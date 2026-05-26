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

// Append a progress event to facebook_profile_tasks (no-op if no taskId).
// Uses service-role client to bypass RLS for reliable background writes.
async function reportTaskStep(
  svcClient: any,
  taskId: string | null,
  step: number,
  stepKey: string,
  message: string,
  detail?: Record<string, unknown>
) {
  if (!taskId || !svcClient) return;
  try {
    const { data: current } = await svcClient
      .from("facebook_profile_tasks")
      .select("progress")
      .eq("id", taskId)
      .maybeSingle();

    const prev = Array.isArray(current?.progress) ? current!.progress : [];
    const next = [
      ...prev,
      {
        step,
        step_key: stepKey,
        message,
        detail: detail ?? null,
        timestamp: new Date().toISOString(),
      },
    ];

    await svcClient
      .from("facebook_profile_tasks")
      .update({
        progress: next,
        current_step: step,
        current_step_key: stepKey,
        status: "running",
        started_at: prev.length === 0 ? new Date().toISOString() : undefined,
      })
      .eq("id", taskId);
  } catch (e) {
    console.error("[reportTaskStep] failed:", e);
  }
}

async function finishTask(
  svcClient: any,
  taskId: string | null,
  status: "completed" | "failed",
  payload: { result?: Record<string, unknown>; error?: string }
) {
  if (!taskId || !svcClient) return;
  try {
    await svcClient
      .from("facebook_profile_tasks")
      .update({
        status,
        result: payload.result ?? null,
        error: payload.error ?? null,
        completed_at: new Date().toISOString(),
        current_step_key: status === "completed" ? "completed" : "failed",
      })
      .eq("id", taskId);
  } catch (e) {
    console.error("[finishTask] failed:", e);
  }
}

// Background sync function - STAGED approach
async function performFullSync(
  supabaseUrl: string,
  supabaseKey: string,
  authHeader: string,
  profileId: string,
  accessToken: string,
  taskId: string | null = null,
  svcClient: any = null
) {
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Counters for final task summary
  let accountsCount = 0;
  let pagesCount = 0;
  let pixelsCount = 0;
  let bmsCount = 0;

  console.log("=== STAGE 1: SYNCING ACCOUNTS ===");
  await updateSyncStatus(supabase, profileId, "syncing_accounts");
  await reportTaskStep(svcClient, taskId, 5, "fetchingAdAccounts", "Buscando contas de anúncio...");

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

    accountsCount = finalAccounts.length;
    bmsCount = allBusinesses.length;
    console.log(`✓ STAGE 1 COMPLETE: ${finalAccounts.length} accounts synced`);
    await reportTaskStep(svcClient, taskId, 6, "savingAccounts", `Salvas ${finalAccounts.length} contas de anúncio (${bmsCount} BMs)`, {
      accountsCount: finalAccounts.length,
      bmsCount,
    });

  } catch (error) {
    console.error("Error in Stage 1 (accounts):", error);
    await updateSyncStatus(supabase, profileId, "error");
    await finishTask(svcClient, taskId, "failed", { error: error instanceof Error ? error.message : "Falha ao sincronizar contas" });
    return;
  }

  // ========== STAGE 2: SYNC PAGES ==========
  console.log("=== STAGE 2: SYNCING PAGES ===");
  await updateSyncStatus(supabase, profileId, "syncing_pages");
  await reportTaskStep(svcClient, taskId, 7, "syncingPages", "Sincronizando páginas do Facebook...");

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

    // Fetch ads volume from Ad Accounts using the correct endpoint: /act_{account_id}/ads_volume?show_breakdown_by_actor=true
    // This is the ONLY correct way per Facebook Marketing API documentation
    const uniquePages = Array.from(pagesMap.values());
    console.log(`Fetching ads volume for ${uniquePages.length} pages via Ad Accounts...`);

    // Build a map of page_id -> { ads_running, ads_limit }
    const pageAdsVolumeMap = new Map<string, { ads_running: number; ads_limit: number }>();

    // Get all ad accounts that were synced in Stage 1
    const { data: adAccounts } = await supabase
      .from("facebook_ad_accounts")
      .select("account_id")
      .eq("profile_id", profileId);

    if (adAccounts && adAccounts.length > 0) {
      console.log(`Querying ads_volume from ${adAccounts.length} ad accounts...`);

      // Use Batch API to query multiple accounts at once
      const accountChunksForAdsVolume = chunk(adAccounts, 50);

      for (const accountChunk of accountChunksForAdsVolume) {
        const batch = accountChunk.map((acc: any) => ({
          method: "GET",
          relative_url: `act_${acc.account_id}/ads_volume?show_breakdown_by_actor=true`,
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
          3
        );

        if (!ok || !Array.isArray(data)) {
          console.error("Batch ads_volume request failed:", status, data?.error || data);
          continue;
        }

        for (let i = 0; i < data.length; i++) {
          const result = data[i];

          if (!result || result.code !== 200) continue;

          try {
            const body = typeof result.body === "string" ? JSON.parse(result.body) : result.body;
            
            // The response contains an array with breakdown by actor (page)
            if (body?.data && Array.isArray(body.data)) {
              for (const item of body.data) {
                const actorId = item.actor_id;
                const adsRunning = item.ads_running_or_in_review_count || 0;
                const adsLimit = item.limit_on_ads_running_or_in_review || 250;

                if (actorId) {
                  // Aggregate ads across accounts (a page can have ads from multiple accounts)
                  const existing = pageAdsVolumeMap.get(actorId);
                  if (existing) {
                    pageAdsVolumeMap.set(actorId, {
                      ads_running: existing.ads_running + adsRunning,
                      ads_limit: Math.max(existing.ads_limit, adsLimit),
                    });
                  } else {
                    pageAdsVolumeMap.set(actorId, {
                      ads_running: adsRunning,
                      ads_limit: adsLimit,
                    });
                  }
                }
              }
            }
          } catch (e) {
            console.error("Error parsing ads_volume batch body:", e);
          }
        }

        await sleep(250);
      }

      console.log(`Found ads volume data for ${pageAdsVolumeMap.size} pages`);
    }

    // Apply ads_volume data to pages
    for (const page of uniquePages) {
      const adsData = pageAdsVolumeMap.get(page.page_id);
      if (adsData) {
        page.ads_running = adsData.ads_running;
        page.ads_limit = adsData.ads_limit;
      } else {
        page.ads_running = 0;
        page.ads_limit = 250;
      }
    }

    // Upsert pages in chunks
    const finalPages = Array.from(pagesMap.values());
    console.log(`Upserting ${finalPages.length} unique pages...`);
    
    const pageChunks = chunk(finalPages, 500);
    for (const rows of pageChunks) {
      if (rows.length === 0) continue;
      const { error } = await supabase
        .from("facebook_pages")
        .upsert(rows, { onConflict: "profile_id,page_id" });
      if (error) console.error("Error upserting pages:", error);
    }

    console.log(`✓ STAGE 2 COMPLETE: ${finalPages.length} pages synced`);

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
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error("Auth error:", claimsError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authUserId = claimsData.claims.sub;
    console.log("Authenticated user:", authUserId);

    // Resolve effective user ID (for collaborators, use owner's ID)
    const serviceRoleKeyForTeam = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClientForTeam = createClient(supabaseUrl, serviceRoleKeyForTeam);
    
    const { data: teamMemberData } = await adminClientForTeam
      .from("team_members")
      .select("owner_id")
      .eq("member_id", authUserId)
      .eq("status", "active")
      .maybeSingle();
    
    const userId = teamMemberData?.owner_id || authUserId;
    if (teamMemberData) {
      console.log(`Collaborator detected. Using owner ID: ${userId}`);
    }

    const { accessToken } = await req.json();

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Access token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Validate token with Facebook
    console.log("Validating token with Facebook...");
    const meResponse = await fetch(
      `${FACEBOOK_GRAPH_API}/me?fields=id,name,email,picture.type(large)&access_token=${accessToken}`
    );

    if (!meResponse.ok) {
      const errorData = await meResponse.json();
      console.error("Facebook API error:", errorData);
      
      // Check for rate limit
      if (errorData.error?.code === 4) {
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
        JSON.stringify({ error: errorData.error?.message || "Invalid access token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userData = await meResponse.json();
    console.log("Facebook user:", { id: userData.id, name: userData.name });

    // 2. Get token debug info
    const debugResponse = await fetch(
      `${FACEBOOK_GRAPH_API}/debug_token?input_token=${accessToken}&access_token=${accessToken}`
    );

    let permissions: string[] = [];
    let expiresAt: string | null = null;

    if (debugResponse.ok) {
      const debugData = await debugResponse.json();
      const tokenData = debugData.data;
      if (tokenData) {
        permissions = tokenData.scopes || [];
        if (tokenData.expires_at) {
          expiresAt = new Date(tokenData.expires_at * 1000).toISOString();
        }
      }
    }

    // 3. Check if profile already exists for this user
    const { data: existingProfile } = await supabase
      .from("facebook_profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("facebook_id", userData.id)
      .single();

    let profile;

    // Create service role client for secure credential storage
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseService = createClient(supabaseUrl, serviceRoleKey);

    if (existingProfile) {
      // Update existing profile (may be reconnecting a disconnected profile)
      console.log("Updating existing profile:", existingProfile.id);
      const { data, error } = await supabase
        .from("facebook_profiles")
        .update({
          name: userData.name,
          email: userData.email || null,
          avatar_url: userData.picture?.data?.url || null,
          access_token: accessToken,
          status: "active",
          permissions,
          token_expires_at: expiresAt,
          sync_status: "syncing_accounts",
        })
        .eq("id", existingProfile.id)
        .select()
        .single();

      if (error) {
        console.error("Update error:", error);
        throw error;
      }
      profile = data;

      // Store token securely in facebook_credentials (service role bypasses RLS)
      const { error: credError } = await supabaseService
        .from("facebook_credentials")
        .upsert({
          profile_id: existingProfile.id,
          access_token: accessToken,
          updated_at: new Date().toISOString(),
        }, { onConflict: "profile_id" });

      if (credError) {
        console.error("Error storing secure credentials:", credError);
      } else {
        console.log("Secure credentials stored successfully");
      }

      // Reactivate paused monitors and schedules (reconnecting same facebook_id)
      try {
        const { count: reactivatedMonitors } = await supabaseService
          .from("catalog_media_monitors")
          .update({ is_active: true })
          .eq("profile_id", existingProfile.id)
          .eq("is_active", false)
          .select("id", { count: "exact", head: true });

        const { count: reactivatedSchedules } = await supabaseService
          .from("catalog_schedules")
          .update({ status: "pending" })
          .eq("profile_id", existingProfile.id)
          .eq("status", "paused")
          .select("id", { count: "exact", head: true });

        if ((reactivatedMonitors || 0) > 0 || (reactivatedSchedules || 0) > 0) {
          console.log(`Reactivated ${reactivatedMonitors || 0} monitors and ${reactivatedSchedules || 0} schedules for reconnected profile`);
        }
      } catch (reactivateErr) {
        console.error("Error reactivating monitors/schedules:", reactivateErr);
        // Non-fatal: profile is reconnected, user can manually reactivate
      }
    } else {
      // Create new profile
      console.log("Creating new profile for user:", userId);
      const { data, error } = await supabase
        .from("facebook_profiles")
        .insert({
          user_id: userId,
          facebook_id: userData.id,
          name: userData.name,
          email: userData.email || null,
          avatar_url: userData.picture?.data?.url || null,
          access_token: accessToken, // Keep for backward compatibility during migration
          status: "active",
          permissions,
          token_expires_at: expiresAt,
          sync_status: "syncing_accounts",
        })
        .select()
        .single();

      if (error) {
        console.error("Insert error:", error);
        throw error;
      }
      profile = data;

      // Store token securely in facebook_credentials (service role bypasses RLS)
      const { error: credError } = await supabaseService
        .from("facebook_credentials")
        .insert({
          profile_id: profile.id,
          access_token: accessToken,
        });

      if (credError) {
        console.error("Error storing secure credentials:", credError);
        // Don't throw - backward compatible via facebook_profiles.access_token
      } else {
        console.log("Secure credentials stored successfully");
      }
    }

    console.log("Profile saved successfully:", profile.id);

    // 4. Start background sync (non-blocking)
    console.log("Starting staged background sync...");
    // @ts-ignore: EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(
      performFullSync(supabaseUrl, supabaseKey, authHeader, profile.id, accessToken)
    );

    return new Response(
      JSON.stringify({
        success: true,
        profile: {
          id: profile.id,
          facebook_id: profile.facebook_id,
          name: profile.name,
          email: profile.email,
          avatar_url: profile.avatar_url,
          status: profile.status,
          permissions: profile.permissions,
          token_expires_at: profile.token_expires_at,
          sync_status: "syncing_accounts",
        },
        background: true,
        message: "Perfil adicionado! Sincronização iniciada em background.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error adding profile:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
