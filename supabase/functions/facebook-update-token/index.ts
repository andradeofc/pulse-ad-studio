import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FACEBOOK_GRAPH_API = "https://graph.facebook.com/v21.0";

// Utility to chunk arrays
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(
  url: string,
  init?: RequestInit,
  maxAttempts = 5
): Promise<{ ok: boolean; status: number; data: any }> {
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    try {
      const res = await fetch(url, init);
      const status = res.status;
      const text = await res.text();

      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }

      const apiError = data?.error;
      const isRateLimit = status === 429 || apiError?.code === 4;

      if (res.ok && !apiError) {
        return { ok: true, status, data };
      }

      if (isRateLimit && attempt < maxAttempts) {
        const waitMs = Math.min(30000, 1000 * 2 ** (attempt - 1));
        console.warn(`Rate limited. Retrying in ${waitMs}ms (attempt ${attempt}/${maxAttempts})`);
        await sleep(waitMs);
        continue;
      }

      return { ok: false, status, data };
    } catch (e) {
      if (attempt < maxAttempts) {
        const waitMs = Math.min(10000, 500 * attempt);
        console.warn(`Network error. Retrying in ${waitMs}ms (attempt ${attempt}/${maxAttempts})`, e);
        await sleep(waitMs);
        continue;
      }
      throw e;
    }
  }

  return { ok: false, status: 0, data: null };
}

function normalizeAdAccountId(account: any): string | null {
  const raw = account?.account_id ?? account?.id;
  if (!raw) return null;
  const s = String(raw);
  return s.startsWith("act_") ? s.slice(4) : s;
}

// Fetch all paginated results from Facebook API
async function fetchAllPaginated(url: string): Promise<any[]> {
  const all: any[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const { ok, status, data } = await fetchJsonWithRetry(nextUrl, undefined, 5);

    if (!ok) {
      console.error("Pagination fetch failed:", status, data?.error || data);
      break;
    }

    all.push(...(data?.data || []));
    nextUrl = data?.paging?.next || null;
  }

  return all;
}

// Update sync status helper
async function updateSyncStatus(supabase: any, profileId: string, status: string) {
  const { error } = await supabase
    .from("facebook_profiles")
    .update({ sync_status: status })
    .eq("id", profileId);
  
  if (error) {
    console.error("Error updating sync status:", error);
  }
}

// Background sync function - STAGED approach
async function performFullSync(
  supabaseUrl: string,
  supabaseKey: string,
  authHeader: string,
  profileId: string,
  accessToken: string
) {
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  });

  console.log("=== STAGE 1: SYNCING ACCOUNTS ===");
  await updateSyncStatus(supabase, profileId, "syncing_accounts");

  let allBusinesses: any[] = [];

  try {
    // ========== STAGE 1: SYNC AD ACCOUNTS ==========
    // Source of truth: /me/adaccounts (all accessible accounts). Then we enrich BM (business) via Batch.
    const accountsMap = new Map<string, any>();

    console.log("Fetching all accessible ad accounts (/me/adaccounts)...");
    const adAccountsUrl = `${FACEBOOK_GRAPH_API}/me/adaccounts?fields=id,account_id,name,currency,timezone_name,account_status&limit=500&access_token=${accessToken}`;
    const rawAccounts = await fetchAllPaginated(adAccountsUrl);
    console.log(`Found ${rawAccounts.length} ad accounts (raw)`);

    for (const account of rawAccounts) {
      const accountId = normalizeAdAccountId(account);
      if (!accountId) continue;

      const key = String(accountId);
      const existing = accountsMap.get(key);

      accountsMap.set(key, {
        profile_id: profileId,
        account_id: key,
        name: account.name ?? existing?.name ?? "-",
        currency: account.currency ?? existing?.currency ?? null,
        timezone: account.timezone_name ?? existing?.timezone ?? null,
        status: account.account_status === 1 ? "active" : "inactive",
        business_id: existing?.business_id ?? null,
        business_name: existing?.business_name ?? null,
      });
    }

    // Fetch all Business Managers (used in Stage 2 pages sync)
    console.log("Fetching Business Managers (/me/businesses)...");
    const businessesUrl = `${FACEBOOK_GRAPH_API}/me/businesses?fields=id,name&limit=500&access_token=${accessToken}`;
    allBusinesses = await fetchAllPaginated(businessesUrl);
    console.log(`Found ${allBusinesses.length} Business Managers`);

    // Enrich business info for EVERY account via Batch API (more complete + fewer calls)
    const uniqueAccounts = Array.from(accountsMap.values());
    console.log(`Enriching business info for ${uniqueAccounts.length} accounts via Batch API...`);

    let enrichedCount = 0;
    const accountChunksForBusiness = chunk(uniqueAccounts, 50);

    for (const accountChunk of accountChunksForBusiness) {
      const batch = accountChunk.map((acc: any) => ({
        method: "GET",
        relative_url: `act_${acc.account_id}?fields=business{id,name}`,
      }));

      const form = new URLSearchParams();
      form.set("access_token", accessToken);
      form.set("batch", JSON.stringify(batch));

      const { ok, status, data } = await fetchJsonWithRetry(
        FACEBOOK_GRAPH_API,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        },
        5
      );

      if (!ok || !Array.isArray(data)) {
        console.error("Batch business enrichment failed:", status, data?.error || data);
        continue;
      }

      for (let i = 0; i < data.length; i++) {
        const result = data[i];
        const acc = accountChunk[i];

        if (!result || result.code !== 200) continue;

        try {
          const body = typeof result.body === "string" ? JSON.parse(result.body) : result.body;
          const business = body?.business;

          if (business?.id) {
            const key = String(acc.account_id);
            const current = accountsMap.get(key);
            if (current) {
              current.business_id = String(business.id);
              current.business_name = String(business.name || "BM");
              accountsMap.set(key, current);
              enrichedCount++;
            }
          }
        } catch (e) {
          console.error("Error parsing business batch body:", e);
        }
      }

      // gentle pacing to avoid rate limits
      await sleep(250);
    }

    // Mark the remaining accounts as personal
    for (const row of accountsMap.values()) {
      if (!row.business_id) {
        row.business_name = row.business_name || "Pessoal";
      }
    }

    const finalAccounts = Array.from(accountsMap.values());
    console.log(
      `Upserting ${finalAccounts.length} unique accounts... (BM-labeled: ${enrichedCount})`
    );

    const finalChunks = chunk(finalAccounts, 500);
    for (const rows of finalChunks) {
      if (rows.length === 0) continue;
      const { error } = await supabase
        .from("facebook_ad_accounts")
        .upsert(rows, { onConflict: "profile_id,account_id" });
      if (error) console.error("Error upserting accounts:", error);
    }

    console.log(`✓ STAGE 1 COMPLETE: ${finalAccounts.length} accounts synced`);

  } catch (error) {
    console.error("Error in Stage 1 (accounts):", error);
    await updateSyncStatus(supabase, profileId, "error");
    return;
  }

  // ========== STAGE 2: SYNC PAGES ==========
  console.log("=== STAGE 2: SYNCING PAGES ===");
  await updateSyncStatus(supabase, profileId, "syncing_pages");

  try {
    const pagesMap = new Map<string, any>(); // Deduplicate by page_id

    // Personal pages
    console.log("Fetching personal pages...");
    const pagesUrl = `${FACEBOOK_GRAPH_API}/me/accounts?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${accessToken}`;
    const personalPages = await fetchAllPaginated(pagesUrl);
    console.log(`Found ${personalPages.length} personal pages`);

    for (const page of personalPages) {
      pagesMap.set(page.id, {
        profile_id: profileId,
        page_id: page.id,
        name: page.name,
        category: page.category,
        access_token: page.access_token,
        picture_url: page.picture?.data?.url,
        followers_count: page.followers_count || 0,
        is_published: page.is_published !== false,
        tasks: page.tasks || [],
        business_id: null,
        business_name: null,
      });
    }

    // Process BM pages in parallel (5 at a time)
    const bmChunks = chunk(allBusinesses, 5);
    
    for (const bmChunk of bmChunks) {
      const bmPromises = bmChunk.map(async (business: any) => {
        try {
          const [ownedPages, clientPages] = await Promise.all([
            fetchAllPaginated(
              `${FACEBOOK_GRAPH_API}/${business.id}/owned_pages?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${accessToken}`
            ),
            fetchAllPaginated(
              `${FACEBOOK_GRAPH_API}/${business.id}/client_pages?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${accessToken}`
            ),
          ]);

          console.log(`BM ${business.name}: ${ownedPages.length} owned, ${clientPages.length} client pages`);

          return [...ownedPages, ...clientPages].map(page => ({
            page,
            business,
          }));
        } catch (e) {
          console.error(`Error fetching pages for BM ${business.name}:`, e);
          return [];
        }
      });

      const results = await Promise.all(bmPromises);
      for (const pageList of results) {
        for (const { page, business } of pageList) {
          // Only add if not already in map (personal takes precedence)
          if (!pagesMap.has(page.id)) {
            pagesMap.set(page.id, {
              profile_id: profileId,
              page_id: page.id,
              name: page.name,
              category: page.category,
              access_token: page.access_token,
              picture_url: page.picture?.data?.url,
              followers_count: page.followers_count || 0,
              is_published: page.is_published !== false,
              tasks: page.tasks || [],
              business_id: business.id,
              business_name: business.name,
            });
          }
        }
      }
    }

    // Upsert pages in chunks
    const uniquePages = Array.from(pagesMap.values());
    console.log(`Upserting ${uniquePages.length} unique pages...`);
    
    const pageChunks = chunk(uniquePages, 500);
    for (const rows of pageChunks) {
      if (rows.length === 0) continue;
      const { error } = await supabase
        .from("facebook_pages")
        .upsert(rows, { onConflict: "profile_id,page_id" });
      if (error) console.error("Error upserting pages:", error);
    }

    console.log(`✓ STAGE 2 COMPLETE: ${uniquePages.length} pages synced`);

  } catch (error) {
    console.error("Error in Stage 2 (pages):", error);
    await updateSyncStatus(supabase, profileId, "error");
    return;
  }

  // ========== STAGE 3: SYNC PIXELS ==========
  console.log("=== STAGE 3: SYNCING PIXELS ===");
  await updateSyncStatus(supabase, profileId, "syncing_pixels");

  try {
    const pixelsMap = new Map<string, any>(); // Deduplicate by pixel_id

    // Get all ad accounts for this profile
    const { data: adAccounts } = await supabase
      .from("facebook_ad_accounts")
      .select("account_id, name, business_id, business_name")
      .eq("profile_id", profileId);

    const accounts = adAccounts || [];
    console.log(`Fetching pixels from ${accounts.length} accounts...`);

    // Use Batch API for efficiency
    const accountChunksForPixels = chunk(accounts, 50);

    for (const accountChunk of accountChunksForPixels) {
      const batch = accountChunk.map((acc: any) => ({
        method: "GET",
        relative_url: `act_${acc.account_id}/adspixels?fields=id,name&limit=500`,
      }));

      const form = new URLSearchParams();
      form.set("access_token", accessToken);
      form.set("batch", JSON.stringify(batch));

      try {
        const batchResponse = await fetch(FACEBOOK_GRAPH_API, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        });

        if (!batchResponse.ok) {
          console.error("Batch pixels request failed:", batchResponse.status);
          continue;
        }

        const batchResults = await batchResponse.json();

        for (let i = 0; i < batchResults.length; i++) {
          const result = batchResults[i];
          const acc = accountChunk[i];

          if (!result || result.code !== 200) continue;

          try {
            const body = typeof result.body === "string" ? JSON.parse(result.body) : result.body;
            for (const pixel of body?.data || []) {
              // Only add if not already in map
              if (!pixelsMap.has(pixel.id)) {
                pixelsMap.set(pixel.id, {
                  profile_id: profileId,
                  pixel_id: pixel.id,
                  name: pixel.name,
                  account_id: acc.account_id,
                  account_name: acc.name,
                  business_id: acc.business_id,
                  business_name: acc.business_name,
                });
              }
            }
          } catch (e) {
            console.error("Error parsing pixels batch body:", e);
          }
        }
      } catch (e) {
        console.error("Error in batch pixels request:", e);
      }
    }

    // Upsert pixels in chunks
    const uniquePixels = Array.from(pixelsMap.values());
    console.log(`Upserting ${uniquePixels.length} unique pixels...`);
    
    const pixelChunks = chunk(uniquePixels, 500);
    for (const rows of pixelChunks) {
      if (rows.length === 0) continue;
      const { error } = await supabase
        .from("facebook_pixels")
        .upsert(rows, { onConflict: "profile_id,pixel_id" });
      if (error) console.error("Error upserting pixels:", error);
    }

    console.log(`✓ STAGE 3 COMPLETE: ${uniquePixels.length} pixels synced`);

  } catch (error) {
    console.error("Error in Stage 3 (pixels):", error);
    await updateSyncStatus(supabase, profileId, "error");
    return;
  }

  // ========== FINAL: UPDATE COMPLETED ==========
  console.log("=== SYNC COMPLETED ===");
  
  await supabase
    .from("facebook_profiles")
    .update({
      last_synced_at: new Date().toISOString(),
      page_token_valid: true,
      sync_status: "completed",
    })
    .eq("id", profileId);

  console.log("Background sync completed successfully!");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { profileId, accessToken } = await req.json();

    if (!profileId || !accessToken) {
      return new Response(
        JSON.stringify({ error: "Profile ID and access token are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify profile ownership
    const { data: profile, error: profileError } = await supabase
      .from("facebook_profiles")
      .select("*")
      .eq("id", profileId)
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Updating token for profile: ${profile.name}`);

    // 1. Validate the new token
    const validateUrl = `${FACEBOOK_GRAPH_API}/me?fields=id,name,email,picture&access_token=${accessToken}`;
    const validateResponse = await fetch(validateUrl);
    const validateData = await validateResponse.json();

    if (validateData.error) {
      console.error("Token validation failed:", validateData.error);
      
      // Check for rate limit error (code 4)
      if (validateData.error.code === 4) {
        return new Response(
          JSON.stringify({
            error: "Rate limit atingido",
            details: "O Facebook limitou as requisições. Aguarde alguns minutos e tente novamente.",
            isRateLimit: true,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({
          error: "Token inválido",
          details: validateData.error.message,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify it's the same Facebook user
    if (validateData.id !== profile.facebook_id) {
      return new Response(
        JSON.stringify({
          error: "Token mismatch",
          details: "This token belongs to a different Facebook account",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get token debug info for expiration
    const debugUrl = `${FACEBOOK_GRAPH_API}/debug_token?input_token=${accessToken}&access_token=${accessToken}`;
    const debugResponse = await fetch(debugUrl);
    const debugData = await debugResponse.json();

    let tokenExpiresAt = null;
    if (debugData.data?.expires_at) {
      tokenExpiresAt = new Date(debugData.data.expires_at * 1000).toISOString();
    }

    // Get permissions
    const permsUrl = `${FACEBOOK_GRAPH_API}/me/permissions?access_token=${accessToken}`;
    const permsResponse = await fetch(permsUrl);
    const permsData = await permsResponse.json();
    const permissions =
      permsData.data?.filter((p: any) => p.status === "granted").map((p: any) => p.permission) || [];

    console.log(`New token permissions: ${permissions.join(", ")}`);

    // 3. Update the profile with new token immediately
    const { error: updateError } = await supabase
      .from("facebook_profiles")
      .update({
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        permissions: permissions,
        status: "active",
        sync_status: "syncing_accounts",
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);

    if (updateError) {
      throw updateError;
    }

    console.log("Token updated, starting staged background sync...");

    // 4. Start background sync (non-blocking)
    // @ts-ignore: EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(
      performFullSync(supabaseUrl, supabaseKey, authHeader, profileId, accessToken)
    );

    // 5. Return immediately - user doesn't wait for sync
    return new Response(
      JSON.stringify({
        success: true,
        message: "Token atualizado! Sincronização iniciada em background.",
        permissions: permissions,
        background: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error updating token:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
