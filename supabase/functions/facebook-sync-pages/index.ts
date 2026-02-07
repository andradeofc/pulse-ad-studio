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

        // 1. Fetch personal pages (me/accounts)
        const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${profile.access_token}`;
        
        console.log("Fetching personal pages...");
        const pagesResponse = await fetch(pagesUrl);
        const pagesData = await pagesResponse.json();

        if (pagesData.error) {
          console.error(`Facebook API error fetching pages:`, pagesData.error);
        } else {
          const pages: FacebookPage[] = pagesData.data || [];
          console.log(`Found ${pages.length} personal pages`);

          for (const page of pages) {
            await upsertPage(supabase, profile.id, page, null, null);
            totalPages++;
          }
        }

        // 2. Fetch Business Managers and their pages
        const businessesUrl = `https://graph.facebook.com/v21.0/me/businesses?fields=id,name&access_token=${profile.access_token}`;
        const businessesResponse = await fetch(businessesUrl);
        const businessesData = await businessesResponse.json();

        if (businessesData.data) {
          const businesses: FacebookBusiness[] = businessesData.data || [];
          console.log(`Found ${businesses.length} Business Managers`);

          for (const business of businesses) {
            // Fetch owned pages
            const ownedPagesUrl = `https://graph.facebook.com/v21.0/${business.id}/owned_pages?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${profile.access_token}`;
            
            const ownedResponse = await fetch(ownedPagesUrl);
            const ownedData = await ownedResponse.json();

            if (ownedData.data) {
              const ownedPages: FacebookPage[] = ownedData.data || [];
              console.log(`Found ${ownedPages.length} owned pages in BM: ${business.name}`);

              for (const page of ownedPages) {
                await upsertPage(supabase, profile.id, page, business.id, business.name);
                totalPages++;
              }
            }

            // Fetch client pages
            const clientPagesUrl = `https://graph.facebook.com/v21.0/${business.id}/client_pages?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${profile.access_token}`;
            
            const clientResponse = await fetch(clientPagesUrl);
            const clientData = await clientResponse.json();

            if (clientData.data) {
              const clientPages: FacebookPage[] = clientData.data || [];
              console.log(`Found ${clientPages.length} client pages in BM: ${business.name}`);

              for (const page of clientPages) {
                await upsertPage(supabase, profile.id, page, business.id, business.name);
                totalPages++;
              }
            }
          }
        }

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

async function upsertPage(
  supabase: any,
  profileId: string,
  page: FacebookPage,
  businessId: string | null,
  businessName: string | null
) {
  const { error: upsertError } = await supabase
    .from("facebook_pages")
    .upsert(
      {
        profile_id: profileId,
        page_id: page.id,
        name: page.name,
        category: page.category || null,
        access_token: page.access_token || null,
        picture_url: page.picture?.data?.url || null,
        followers_count: page.followers_count || 0,
        is_published: page.is_published !== false,
        tasks: page.tasks || [],
        business_id: businessId,
        business_name: businessName,
      },
      { onConflict: "profile_id,page_id" }
    );

  if (upsertError) {
    console.error(`Error upserting page ${page.id}:`, upsertError);
  }
}
