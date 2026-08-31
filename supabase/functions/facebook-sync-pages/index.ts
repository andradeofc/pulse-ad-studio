import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FacebookPage {
  id: string;
  name: string;
  category?: string;
  access_token?: string;
  picture?: { data?: { url?: string } };
  followers_count?: number;
  is_published?: boolean;
  tasks?: string[];
}

interface FacebookBusiness {
  id: string;
  name: string;
}

interface PageData {
  page_id: string;
  name: string;
  category: string | null;
  access_token: string | null;
  picture_url: string | null;
  followers_count: number;
  is_published: boolean;
  tasks: string[];
  business_id: string | null;
  business_name: string | null;
  ads_running: number;
  ads_limit: number;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(
  url: string,
  init?: RequestInit,
  maxAttempts = 5
): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init);
      const json = await res.json();
      // Check for rate limit error
      if (json.error?.code === 4 || res.status === 429) {
        const waitMs = Math.min(30000, 1000 * 2 ** (attempt - 1));
        console.log(`Rate limit hit, waiting ${waitMs}ms before retry ${attempt}/${maxAttempts}`);
        await sleep(waitMs);
        continue;
      }
      return json;
    } catch (e) {
      lastError = e as Error;
      const waitMs = Math.min(30000, 1000 * 2 ** (attempt - 1));
      console.log(`Network error, waiting ${waitMs}ms before retry ${attempt}/${maxAttempts}: ${e}`);
      await sleep(waitMs);
    }
  }
  throw lastError || new Error("fetchJsonWithRetry failed");
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header provided");
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("User authentication failed:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Syncing pages for user: ${user.id}`);

    // Get all Facebook profiles for this user (RLS handles team member access)
    const { data: profiles, error: profilesError } = await supabase
      .from("facebook_profiles")
      .select("id, name")
      .eq("status", "active");

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    if (!profiles || profiles.length === 0) {
      console.log("No active Facebook profiles found");
      return new Response(
        JSON.stringify({ pages: [], message: "No active Facebook profiles" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${profiles.length} active profiles`);

    // Create service role client to fetch credentials securely
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseService = createClient(supabaseUrl, serviceRoleKey);

    let totalPages = 0;

    for (const profile of profiles) {
      try {
        console.log(`Processing profile: ${profile.id} (${profile.name})`);
        
        // Get access token securely
        const { data: credentials } = await supabaseService
          .from("facebook_credentials")
          .select("access_token")
          .eq("profile_id", profile.id)
          .single();

        // Fallback to facebook_profiles.access_token if credentials not found
        let accessToken: string | null = null;
        if (credentials?.access_token) {
          accessToken = credentials.access_token;
        } else {
          const { data: fallbackProfile } = await supabaseService
            .from("facebook_profiles")
            .select("access_token")
            .eq("id", profile.id)
            .single();
          accessToken = fallbackProfile?.access_token || null;
        }

        if (!accessToken) {
          console.warn(`No access token found for profile ${profile.id}`);
          continue;
        }

        // Use Map to deduplicate pages by page_id
        const pagesMap = new Map<string, PageData>();

        // 1. Check token permissions first
        const debugData = await fetchJsonWithRetry(
          `https://graph.facebook.com/v21.0/me/permissions?access_token=${accessToken}`
        );
        
        if (debugData.data) {
          const grantedPerms = debugData.data.filter((p: any) => p.status === 'granted').map((p: any) => p.permission);
          console.log(`Token permissions: ${grantedPerms.join(', ')}`);
          
          const hasPagePerms = grantedPerms.includes('pages_read_engagement') || grantedPerms.includes('pages_show_list');
          if (!hasPagePerms) {
            console.log('Warning: Token may lack page permissions (pages_read_engagement or pages_show_list)');
          }
        }

        // 2. Fetch personal pages (me/accounts)
        console.log("Fetching personal pages...");
        const pagesData = await fetchJsonWithRetry(
          `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${accessToken}`
        );

        if (pagesData.error) {
          console.error(`Facebook API error fetching pages:`, pagesData.error);
        } else {
          const pages: FacebookPage[] = pagesData.data || [];
          console.log(`Found ${pages.length} personal pages`);

          for (const page of pages) {
            if (!pagesMap.has(page.id)) {
              pagesMap.set(page.id, {
                page_id: page.id,
                name: page.name,
                category: page.category || null,
                access_token: page.access_token || null,
                picture_url: page.picture?.data?.url || null,
                followers_count: page.followers_count || 0,
                is_published: page.is_published !== false,
                tasks: page.tasks || [],
                business_id: null,
                business_name: null,
                ads_running: 0,
                ads_limit: 250,
              });
            }
          }
        }

        // 3. Fetch Business Managers and their pages
        const businessesData = await fetchJsonWithRetry(
          `https://graph.facebook.com/v21.0/me/businesses?fields=id,name&access_token=${accessToken}`
        );

        if (businessesData.data) {
          const businesses: FacebookBusiness[] = businessesData.data || [];
          console.log(`Found ${businesses.length} Business Managers`);

          for (const business of businesses) {
            // Fetch owned pages
            const ownedData = await fetchJsonWithRetry(
              `https://graph.facebook.com/v21.0/${business.id}/owned_pages?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${accessToken}`
            );

            if (ownedData.data) {
              const ownedPages: FacebookPage[] = ownedData.data || [];
              console.log(`Found ${ownedPages.length} owned pages in BM: ${business.name}`);

              for (const page of ownedPages) {
                if (!pagesMap.has(page.id)) {
                  pagesMap.set(page.id, {
                    page_id: page.id,
                    name: page.name,
                    category: page.category || null,
                    access_token: page.access_token || null,
                    picture_url: page.picture?.data?.url || null,
                    followers_count: page.followers_count || 0,
                    is_published: page.is_published !== false,
                    tasks: page.tasks || [],
                    business_id: business.id,
                    business_name: business.name,
                    ads_running: 0,
                    ads_limit: 250,
                  });
                }
              }
            }

            // Fetch client pages
            const clientData = await fetchJsonWithRetry(
              `https://graph.facebook.com/v21.0/${business.id}/client_pages?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${accessToken}`
            );

            if (clientData.data) {
              const clientPages: FacebookPage[] = clientData.data || [];
              console.log(`Found ${clientPages.length} client pages in BM: ${business.name}`);

              for (const page of clientPages) {
                if (!pagesMap.has(page.id)) {
                  pagesMap.set(page.id, {
                    page_id: page.id,
                    name: page.name,
                    category: page.category || null,
                    access_token: page.access_token || null,
                    picture_url: page.picture?.data?.url || null,
                    followers_count: page.followers_count || 0,
                    is_published: page.is_published !== false,
                    tasks: page.tasks || [],
                    business_id: business.id,
                    business_name: business.name,
                    ads_running: 0,
                    ads_limit: 250,
                  });
                }
              }
            }
          }
        }

        // 4. Enrich pages with ads_volume from Ad Accounts
        // The correct approach: query ads_volume from each ad account with show_breakdown_by_actor=true
        console.log("Fetching ads volume from ad accounts...");
        
        // Get all ad accounts for this profile from DB
        const { data: adAccounts, error: adAccountsError } = await supabase
          .from("facebook_ad_accounts")
          .select("account_id")
          .eq("profile_id", profile.id);

        if (adAccountsError) {
          console.error("Error fetching ad accounts:", adAccountsError);
        }

        // Build a map of page_id -> { ads_running, ads_limit }
        const pageAdsVolumeMap = new Map<string, { ads_running: number; ads_limit: number }>();

        if (adAccounts && adAccounts.length > 0) {
          console.log(`Found ${adAccounts.length} ad accounts to query for ads_volume`);

          for (const account of adAccounts) {
            try {
              // Use the correct endpoint: /act_{account_id}/ads_volume with show_breakdown_by_actor=true
              const adsVolumeUrl = `https://graph.facebook.com/v21.0/act_${account.account_id}/ads_volume?show_breakdown_by_actor=true&access_token=${accessToken}`;
              
              const adsVolumeData = await fetchJsonWithRetry(adsVolumeUrl);

              if (adsVolumeData.error) {
                console.log(`Error fetching ads_volume for account ${account.account_id}: ${adsVolumeData.error.message}`);
                continue;
              }

              // The response contains an array with breakdown by actor (page)
              if (adsVolumeData.data && Array.isArray(adsVolumeData.data)) {
                for (const item of adsVolumeData.data) {
                  const actorId = item.actor_id;
                  const adsRunning = item.ads_running_or_in_review_count || 0;
                  const adsLimit = item.limit_on_ads_running_or_in_review || 250;

                  if (actorId) {
                    // Aggregate ads across accounts (a page can have ads from multiple accounts)
                    const existing = pageAdsVolumeMap.get(actorId);
                    if (existing) {
                      // Both ads_running and ads_limit are global values per page,
                      // so we use Math.max to avoid duplicating when the same page appears in multiple accounts
                      pageAdsVolumeMap.set(actorId, {
                        ads_running: Math.max(existing.ads_running, adsRunning),
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
            } catch (err) {
              console.error(`Error querying ads_volume for account ${account.account_id}:`, err);
            }
          }

          console.log(`Found ads volume data for ${pageAdsVolumeMap.size} pages`);
        }

        // Apply ads_volume data to pages
        const uniquePages = Array.from(pagesMap.values());
        for (const page of uniquePages) {
          const adsData = pageAdsVolumeMap.get(page.page_id);
          if (adsData) {
            page.ads_running = adsData.ads_running;
            page.ads_limit = adsData.ads_limit;
          }
        }

        // 5. Upsert all pages to database
        console.log(`Upserting ${uniquePages.length} pages for profile ${profile.id}`);
        
        const pagesToUpsert = uniquePages.map((p) => ({
          profile_id: profile.id,
          page_id: p.page_id,
          name: p.name,
          category: p.category,
          access_token: p.access_token,
          picture_url: p.picture_url,
          followers_count: p.followers_count,
          is_published: p.is_published,
          tasks: p.tasks,
          business_id: p.business_id,
          business_name: p.business_name,
          ads_running: p.ads_running,
          ads_limit: p.ads_limit,
          source: "api",

        }));

        // Batch upsert
        const UPSERT_CHUNK = 500;
        for (let i = 0; i < pagesToUpsert.length; i += UPSERT_CHUNK) {
          const chunk = pagesToUpsert.slice(i, i + UPSERT_CHUNK);
          const { error: upsertErr } = await supabase
            .from("facebook_pages")
            .upsert(chunk, { onConflict: "profile_id,page_id" });

          if (upsertErr) {
            console.error("Error upserting pages chunk:", upsertErr);
          }
        }

        totalPages += uniquePages.length;

      } catch (profileError) {
        console.error(`Error processing profile ${profile.id}:`, profileError);
      }
    }

    console.log(`Sync complete. Total pages synced: ${totalPages}`);

    // Fetch all pages for this user
    const { data: allPages, error: fetchError } = await supabase
      .from("facebook_pages")
      .select("id, profile_id, page_id, name, category, picture_url, followers_count, is_published, business_id, business_name, ads_running, ads_limit, tasks, created_at, updated_at, source, is_blacklisted, blacklist_reason, blacklisted_at, instagram_actor_id, instagram_actor_type, instagram_resolved_at")
      .order("name");

    if (fetchError) {
      throw fetchError;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        pages: allPages || [],
        synced: totalPages 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in facebook-sync-pages:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
