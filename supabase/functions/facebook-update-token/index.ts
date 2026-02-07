import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FACEBOOK_GRAPH_API = "https://graph.facebook.com/v21.0";

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
      return new Response(
        JSON.stringify({ 
          error: "Invalid token", 
          details: validateData.error.message 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify it's the same Facebook user
    if (validateData.id !== profile.facebook_id) {
      return new Response(
        JSON.stringify({ 
          error: "Token mismatch", 
          details: "This token belongs to a different Facebook account" 
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
    const permissions = permsData.data
      ?.filter((p: any) => p.status === "granted")
      .map((p: any) => p.permission) || [];

    console.log(`New token permissions: ${permissions.join(", ")}`);

    // 3. Update the profile with new token
    const { error: updateError } = await supabase
      .from("facebook_profiles")
      .update({
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        permissions: permissions,
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);

    if (updateError) {
      throw updateError;
    }

    console.log("Token updated successfully, starting full sync...");

    // 4. Sync everything - Ad Accounts
    console.log("Syncing ad accounts...");
    const syncedAccounts: any[] = [];
    
    // Personal accounts
    const personalAccountsUrl = `${FACEBOOK_GRAPH_API}/me/adaccounts?fields=id,account_id,name,currency,timezone_name,account_status&access_token=${accessToken}`;
    const personalResponse = await fetch(personalAccountsUrl);
    
    if (personalResponse.ok) {
      const personalData = await personalResponse.json();
      for (const account of personalData.data || []) {
        const { data } = await supabase
          .from("facebook_ad_accounts")
          .upsert({
            profile_id: profileId,
            account_id: account.account_id,
            name: account.name,
            currency: account.currency,
            timezone: account.timezone_name,
            status: account.account_status === 1 ? "active" : "inactive",
            business_id: null,
            business_name: "Pessoal",
          }, { onConflict: "profile_id,account_id" })
          .select()
          .single();
        if (data) syncedAccounts.push(data);
      }
    }

    // Business Manager accounts
    const businessesUrl = `${FACEBOOK_GRAPH_API}/me/businesses?fields=id,name&access_token=${accessToken}`;
    const businessesResponse = await fetch(businessesUrl);
    
    if (businessesResponse.ok) {
      const businessesData = await businessesResponse.json();
      for (const business of businessesData.data || []) {
        // Owned accounts
        const ownedUrl = `${FACEBOOK_GRAPH_API}/${business.id}/owned_ad_accounts?fields=id,account_id,name,currency,timezone_name,account_status&access_token=${accessToken}`;
        const ownedResponse = await fetch(ownedUrl);
        if (ownedResponse.ok) {
          const ownedData = await ownedResponse.json();
          for (const account of ownedData.data || []) {
            await supabase.from("facebook_ad_accounts").upsert({
              profile_id: profileId,
              account_id: account.account_id,
              name: account.name,
              currency: account.currency,
              timezone: account.timezone_name,
              status: account.account_status === 1 ? "active" : "inactive",
              business_id: business.id,
              business_name: business.name,
            }, { onConflict: "profile_id,account_id" });
            syncedAccounts.push(account);
          }
        }

        // Client accounts
        const clientUrl = `${FACEBOOK_GRAPH_API}/${business.id}/client_ad_accounts?fields=id,account_id,name,currency,timezone_name,account_status&access_token=${accessToken}`;
        const clientResponse = await fetch(clientUrl);
        if (clientResponse.ok) {
          const clientData = await clientResponse.json();
          for (const account of clientData.data || []) {
            await supabase.from("facebook_ad_accounts").upsert({
              profile_id: profileId,
              account_id: account.account_id,
              name: account.name,
              currency: account.currency,
              timezone: account.timezone_name,
              status: account.account_status === 1 ? "active" : "inactive",
              business_id: business.id,
              business_name: business.name,
            }, { onConflict: "profile_id,account_id" });
            syncedAccounts.push(account);
          }
        }
      }
    }

    console.log(`Synced ${syncedAccounts.length} ad accounts`);

    // 5. Sync Pixels
    console.log("Syncing pixels...");
    let syncedPixels = 0;

    const { data: adAccounts } = await supabase
      .from("facebook_ad_accounts")
      .select("account_id, name, business_id, business_name")
      .eq("profile_id", profileId);

    for (const account of adAccounts || []) {
      const pixelsUrl = `${FACEBOOK_GRAPH_API}/act_${account.account_id}/adspixels?fields=id,name&access_token=${accessToken}`;
      const pixelsResponse = await fetch(pixelsUrl);
      
      if (pixelsResponse.ok) {
        const pixelsData = await pixelsResponse.json();
        for (const pixel of pixelsData.data || []) {
          await supabase.from("facebook_pixels").upsert({
            profile_id: profileId,
            pixel_id: pixel.id,
            name: pixel.name,
            account_id: account.account_id,
            account_name: account.name,
            business_id: account.business_id,
            business_name: account.business_name,
          }, { onConflict: "profile_id,pixel_id" });
          syncedPixels++;
        }
      }
    }

    console.log(`Synced ${syncedPixels} pixels`);

    // 6. Sync Pages
    console.log("Syncing pages...");
    let syncedPages = 0;

    // Personal pages
    const pagesUrl = `${FACEBOOK_GRAPH_API}/me/accounts?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${accessToken}`;
    const pagesResponse = await fetch(pagesUrl);
    
    if (pagesResponse.ok) {
      const pagesData = await pagesResponse.json();
      console.log(`Found ${pagesData.data?.length || 0} personal pages`);
      
      for (const page of pagesData.data || []) {
        await supabase.from("facebook_pages").upsert({
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
        }, { onConflict: "profile_id,page_id" });
        syncedPages++;
      }
    }

    // Business pages
    if (businessesResponse.ok) {
      const businessesData = await businessesResponse.json();
      for (const business of businessesData.data || []) {
        // Owned pages
        const ownedPagesUrl = `${FACEBOOK_GRAPH_API}/${business.id}/owned_pages?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${accessToken}`;
        const ownedPagesResponse = await fetch(ownedPagesUrl);
        
        if (ownedPagesResponse.ok) {
          const ownedPagesData = await ownedPagesResponse.json();
          for (const page of ownedPagesData.data || []) {
            await supabase.from("facebook_pages").upsert({
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
            }, { onConflict: "profile_id,page_id" });
            syncedPages++;
          }
        }

        // Client pages
        const clientPagesUrl = `${FACEBOOK_GRAPH_API}/${business.id}/client_pages?fields=id,name,category,access_token,picture,followers_count,is_published,tasks&limit=100&access_token=${accessToken}`;
        const clientPagesResponse = await fetch(clientPagesUrl);
        
        if (clientPagesResponse.ok) {
          const clientPagesData = await clientPagesResponse.json();
          for (const page of clientPagesData.data || []) {
            await supabase.from("facebook_pages").upsert({
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
            }, { onConflict: "profile_id,page_id" });
            syncedPages++;
          }
        }
      }
    }

    console.log(`Synced ${syncedPages} pages`);

    // Update last synced
    await supabase
      .from("facebook_profiles")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", profileId);

    console.log("Full sync completed successfully!");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Token updated and all data synced",
        permissions: permissions,
        synced: {
          accounts: syncedAccounts.length,
          pixels: syncedPixels,
          pages: syncedPages,
        },
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
