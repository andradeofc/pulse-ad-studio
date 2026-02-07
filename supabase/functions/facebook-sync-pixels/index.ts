import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FacebookPixel {
  id: string;
  name: string;
}

interface FacebookAdAccount {
  id: string;
  name: string;
  business?: {
    id: string;
    name: string;
  };
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

    console.log(`Syncing pixels for user: ${user.id}`);

    // Get all Facebook profiles for this user
    const { data: profiles, error: profilesError } = await supabase
      .from("facebook_profiles")
      .select("id, access_token, proxy_host, proxy_port, proxy_username, proxy_password")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    if (!profiles || profiles.length === 0) {
      console.log("No active Facebook profiles found");
      return new Response(
        JSON.stringify({ pixels: [], message: "No active Facebook profiles" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${profiles.length} active profiles`);

    let totalPixels = 0;

    for (const profile of profiles) {
      try {
        console.log(`Processing profile: ${profile.id}`);

        // First, get all ad accounts for this profile
        const { data: adAccounts, error: accountsError } = await supabase
          .from("facebook_ad_accounts")
          .select("account_id, name, business_id, business_name")
          .eq("profile_id", profile.id);

        if (accountsError) {
          console.error(`Error fetching ad accounts for profile ${profile.id}:`, accountsError);
          continue;
        }

        if (!adAccounts || adAccounts.length === 0) {
          console.log(`No ad accounts found for profile ${profile.id}`);
          continue;
        }

        console.log(`Found ${adAccounts.length} ad accounts for profile ${profile.id}`);

        // Fetch pixels from each ad account
        for (const account of adAccounts) {
          try {
            const pixelsUrl = `https://graph.facebook.com/v21.0/act_${account.account_id}/adspixels?fields=id,name&access_token=${profile.access_token}`;
            
            console.log(`Fetching pixels for account ${account.account_id}`);
            
            const response = await fetch(pixelsUrl);
            const data = await response.json();

            if (data.error) {
              console.error(`Facebook API error for account ${account.account_id}:`, data.error);
              continue;
            }

            const pixels: FacebookPixel[] = data.data || [];
            console.log(`Found ${pixels.length} pixels for account ${account.account_id}`);

            // Upsert pixels to database
            for (const pixel of pixels) {
              const { error: upsertError } = await supabase
                .from("facebook_pixels")
                .upsert(
                  {
                    profile_id: profile.id,
                    pixel_id: pixel.id,
                    name: pixel.name,
                    account_id: account.account_id,
                    account_name: account.name,
                    business_id: account.business_id,
                    business_name: account.business_name,
                  },
                  { onConflict: "profile_id,pixel_id" }
                );

              if (upsertError) {
                console.error(`Error upserting pixel ${pixel.id}:`, upsertError);
              } else {
                totalPixels++;
              }
            }
          } catch (accountError) {
            console.error(`Error processing account ${account.account_id}:`, accountError);
          }
        }
      } catch (profileError) {
        console.error(`Error processing profile ${profile.id}:`, profileError);
      }
    }

    console.log(`Sync complete. Total pixels synced: ${totalPixels}`);

    // Fetch all pixels for this user
    const { data: allPixels, error: fetchError } = await supabase
      .from("facebook_pixels")
      .select("*")
      .order("name");

    if (fetchError) {
      throw fetchError;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        pixels: allPixels || [],
        synced: totalPixels 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in facebook-sync-pixels:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
