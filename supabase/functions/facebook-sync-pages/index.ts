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

    // Get all Facebook profiles for this user
    const { data: profiles, error: profilesError } = await supabase
      .from("facebook_profiles")
      .select("id, access_token, name")
      .eq("user_id", user.id)
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

    let totalPages = 0;

    for (const profile of profiles) {
      try {
        console.log(`Processing profile: ${profile.id} (${profile.name})`);
        const accessToken = profile.access_token;

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

        // 4. Enrich pages with ads_volume using Batch API
        const uniquePages = Array.from(pagesMap.values());
        console.log(`Total unique pages to enrich: ${uniquePages.length}`);

        const BATCH_SIZE = 50;
        for (let i = 0; i < uniquePages.length; i += BATCH_SIZE) {
          const chunk = uniquePages.slice(i, i + BATCH_SIZE);
          const batch = chunk.map((p) => ({
            method: "GET",
            relative_url: `${p.page_id}?fields=ads_volume`,
          }));

          try {
            const batchRes = await fetchJsonWithRetry(
              `https://graph.facebook.com/v21.0/?access_token=${accessToken}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ batch: JSON.stringify(batch) }),
              }
            );

            if (Array.isArray(batchRes)) {
              for (let j = 0; j < batchRes.length; j++) {
                const item = batchRes[j];
                if (item?.code === 200 && item.body) {
                  try {
                    const body = JSON.parse(item.body);
                    const adsVolume = body?.ads_volume;
                    if (adsVolume) {
                      chunk[j].ads_running = adsVolume.ads_running_or_in_review_count || 0;
                      chunk[j].ads_limit = adsVolume.limit_on_ads_running_or_in_review || 250;
                    }
                  } catch (parseErr) {
                    console.error("Error parsing batch item:", parseErr);
                  }
                }
              }
            }
          } catch (batchErr) {
            console.error("Error in batch ads_volume request:", batchErr);
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
      .select("*")
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
