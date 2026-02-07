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

// Fetch all paginated results from Facebook API
async function fetchAllPaginated(url: string): Promise<any[]> {
  const all: any[] = [];
  let response = await fetch(url);

  while (response.ok) {
    const data = await response.json();
    all.push(...(data.data || []));

    if (data.paging?.next) {
      response = await fetch(data.paging.next);
    } else {
      break;
    }
  }

  return all;
}

// Background sync function for new profiles
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

  console.log("Background sync started for new profile...");

  // Mark sync as started
  await supabase
    .from("facebook_profiles")
    .update({ sync_status: "syncing" })
    .eq("id", profileId);

  try {
    // ========== 1. SYNC AD ACCOUNTS ==========
    console.log("Syncing ad accounts...");
    const syncedAccounts: any[] = [];

    // Personal accounts
    const personalAccountsUrl = `${FACEBOOK_GRAPH_API}/me/adaccounts?fields=id,account_id,name,currency,timezone_name,account_status&limit=500&access_token=${accessToken}`;
    const personalAccounts = await fetchAllPaginated(personalAccountsUrl);

    for (const account of personalAccounts) {
      syncedAccounts.push({
        profile_id: profileId,
        account_id: account.account_id,
        name: account.name,
        currency: account.currency,
        timezone: account.timezone_name,
        status: account.account_status === 1 ? "active" : "inactive",
        business_id: null,
        business_name: "Pessoal",
      });
    }

    // Fetch all Business Managers
    const businessesUrl = `${FACEBOOK_GRAPH_API}/me/businesses?fields=id,name&limit=100&access_token=${accessToken}`;
    const allBusinesses = await fetchAllPaginated(businessesUrl);
    console.log(`Found ${allBusinesses.length} Business Managers`);

    // Process BMs in parallel (5 at a time to avoid rate limits)
    const bmChunks = chunk(allBusinesses, 5);

    for (const bmChunk of bmChunks) {
      const bmPromises = bmChunk.map(async (business: any) => {
        const accounts: any[] = [];

        // Fetch owned and client accounts in parallel
        const [ownedAccounts, clientAccounts] = await Promise.all([
          fetchAllPaginated(
            `${FACEBOOK_GRAPH_API}/${business.id}/owned_ad_accounts?fields=id,account_id,name,currency,timezone_name,account_status&limit=500&access_token=${accessToken}`
          ),
          fetchAllPaginated(
            `${FACEBOOK_GRAPH_API}/${business.id}/client_ad_accounts?fields=id,account_id,name,currency,timezone_name,account_status&limit=500&access_token=${accessToken}`
          ),
        ]);

        for (const account of [...ownedAccounts, ...clientAccounts]) {
          accounts.push({
            profile_id: profileId,
            account_id: account.account_id,
            name: account.name,
            currency: account.currency,
            timezone: account.timezone_name,
            status: account.account_status === 1 ? "active" : "inactive",
            business_id: business.id,
            business_name: business.name,
          });
        }

        return accounts;
      });

      const results = await Promise.all(bmPromises);
      for (const accounts of results) {
        syncedAccounts.push(...accounts);
      }
    }

    // Batch upsert accounts
    const accountChunks = chunk(syncedAccounts, 500);
    for (const rows of accountChunks) {
      if (rows.length === 0) continue;
      const { error } = await supabase
        .from("facebook_ad_accounts")
        .upsert(rows, { onConflict: "profile_id,account_id" });
      if (error) console.error("Error upserting accounts:", error);
    }

    console.log(`Synced ${syncedAccounts.length} ad accounts`);

    // ========== 2. SYNC PIXELS (Batch API) ==========
    console.log("Syncing pixels...");

    const { data: adAccounts } = await supabase
      .from("facebook_ad_accounts")
      .select("account_id, name, business_id, business_name")
      .eq("profile_id", profileId);

    const accounts = adAccounts || [];
    const pixelRows: any[] = [];
    const accountChunksForPixels = chunk(accounts, 50);

    for (const accountChunk of accountChunksForPixels) {
      const batch = accountChunk.map((acc: any) => ({
        method: "GET",
        relative_url: `act_${acc.account_id}/adspixels?fields=id,name&limit=500`,
      }));

      const form = new URLSearchParams();
      form.set("access_token", accessToken);
      form.set("batch", JSON.stringify(batch));

      const batchResponse = await fetch(FACEBOOK_GRAPH_API, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });

      if (!batchResponse.ok) {
        console.error("Batch pixels request failed:", await batchResponse.text());
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
            pixelRows.push({
              profile_id: profileId,
              pixel_id: pixel.id,
              name: pixel.name,
              account_id: acc.account_id,
              account_name: acc.name,
              business_id: acc.business_id,
              business_name: acc.business_name,
            });
          }
        } catch (e) {
          console.error("Error parsing pixels batch body:", e);
        }
      }
    }

    // Batch upsert pixels
    const pixelChunks = chunk(pixelRows, 500);
    for (const rows of pixelChunks) {
      if (rows.length === 0) continue;
      const { error } = await supabase
        .from("facebook_pixels")
        .upsert(rows, { onConflict: "profile_id,pixel_id" });
      if (error) console.error("Error upserting pixels:", error);
    }

    console.log(`Synced ${pixelRows.length} pixels`);

    // ========== 3. SYNC PAGES ==========
    console.log("Syncing pages...");
    const pageRows: any[] = [];

    // Personal pages
    const pagesUrl = `${FACEBOOK_GRAPH_API}/me/accounts?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${accessToken}`;
    const personalPages = await fetchAllPaginated(pagesUrl);
    console.log(`Found ${personalPages.length} personal pages`);

    for (const page of personalPages) {
      pageRows.push({
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
    for (const bmChunk of bmChunks) {
      const bmPromises = bmChunk.map(async (business: any) => {
        const pages: any[] = [];

        // Fetch owned and client pages in parallel
        const [ownedPages, clientPages] = await Promise.all([
          fetchAllPaginated(
            `${FACEBOOK_GRAPH_API}/${business.id}/owned_pages?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${accessToken}`
          ),
          fetchAllPaginated(
            `${FACEBOOK_GRAPH_API}/${business.id}/client_pages?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${accessToken}`
          ),
        ]);

        console.log(`BM ${business.name}: ${ownedPages.length} owned, ${clientPages.length} client pages`);

        for (const page of [...ownedPages, ...clientPages]) {
          pages.push({
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

        return pages;
      });

      const results = await Promise.all(bmPromises);
      for (const pages of results) {
        pageRows.push(...pages);
      }
    }

    // Batch upsert pages
    const pageChunks = chunk(pageRows, 500);
    for (const rows of pageChunks) {
      if (rows.length === 0) continue;
      const { error } = await supabase
        .from("facebook_pages")
        .upsert(rows, { onConflict: "profile_id,page_id" });
      if (error) console.error("Error upserting pages:", error);
    }

    console.log(`Synced ${pageRows.length} pages`);

    // ========== 4. UPDATE LAST SYNCED ==========
    await supabase
      .from("facebook_profiles")
      .update({
        last_synced_at: new Date().toISOString(),
        page_token_valid: true,
        sync_status: "completed",
      })
      .eq("id", profileId);

    console.log("Background sync completed successfully!");
    console.log(`Summary: ${syncedAccounts.length} accounts, ${pixelRows.length} pixels, ${pageRows.length} pages`);

  } catch (error) {
    console.error("Background sync error:", error);
    
    // Mark profile with error status
    await supabase
      .from("facebook_profiles")
      .update({ 
        last_synced_at: new Date().toISOString(),
        sync_status: "error",
      })
      .eq("id", profileId);
  }
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

    const userId = claimsData.claims.sub;
    console.log("Authenticated user:", userId);

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

    if (existingProfile) {
      // Update existing profile
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
          sync_status: "idle", // Will be set to syncing by background task
        })
        .eq("id", existingProfile.id)
        .select()
        .single();

      if (error) {
        console.error("Update error:", error);
        throw error;
      }
      profile = data;
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
          access_token: accessToken,
          status: "active",
          permissions,
          token_expires_at: expiresAt,
          sync_status: "idle", // Will be set to syncing by background task
        })
        .select()
        .single();

      if (error) {
        console.error("Insert error:", error);
        throw error;
      }
      profile = data;
    }

    console.log("Profile saved successfully:", profile.id);

    // 4. Start background sync (non-blocking)
    console.log("Starting background sync...");
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
          sync_status: "syncing",
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
