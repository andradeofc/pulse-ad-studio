import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FACEBOOK_GRAPH_API = "https://graph.facebook.com/v19.0";

serve(async (req) => {
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    const { profileId } = await req.json();

    if (!profileId) {
      return new Response(
        JSON.stringify({ error: "Profile ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get the profile and verify ownership
    const { data: profile, error: profileError } = await supabase
      .from("facebook_profiles")
      .select("*")
      .eq("id", profileId)
      .eq("user_id", userId)
      .single();

    if (profileError || !profile) {
      console.error("Profile not found:", profileError);
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Syncing ad accounts for profile:", profile.id);

    // 2. Fetch ad accounts from Facebook
    const adAccountsUrl = `${FACEBOOK_GRAPH_API}/me/adaccounts?fields=id,account_id,name,currency,timezone_name,account_status&access_token=${profile.access_token}`;
    
    const adAccountsResponse = await fetch(adAccountsUrl);
    
    if (!adAccountsResponse.ok) {
      const errorData = await adAccountsResponse.json();
      console.error("Facebook API error:", errorData);
      
      // If token expired, update profile status
      if (errorData.error?.code === 190) {
        await supabase
          .from("facebook_profiles")
          .update({ status: "expired" })
          .eq("id", profileId);
        
        return new Response(
          JSON.stringify({ error: "Token expired", tokenExpired: true }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: errorData.error?.message || "Failed to fetch ad accounts" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adAccountsData = await adAccountsResponse.json();
    const adAccounts = adAccountsData.data || [];
    
    console.log(`Found ${adAccounts.length} ad accounts`);

    // 3. Upsert ad accounts
    const syncedAccounts = [];
    
    for (const account of adAccounts) {
      const accountStatus = account.account_status === 1 ? "active" : 
                           account.account_status === 2 ? "disabled" : 
                           account.account_status === 3 ? "unsettled" : "unknown";
      
      const { data, error } = await supabase
        .from("facebook_ad_accounts")
        .upsert(
          {
            profile_id: profileId,
            account_id: account.account_id,
            name: account.name,
            currency: account.currency,
            timezone: account.timezone_name,
            status: accountStatus,
          },
          { onConflict: "profile_id,account_id" }
        )
        .select()
        .single();

      if (error) {
        console.error("Error upserting account:", error);
      } else {
        syncedAccounts.push(data);
      }
    }

    // 4. Update profile last_synced_at
    await supabase
      .from("facebook_profiles")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", profileId);

    console.log(`Synced ${syncedAccounts.length} ad accounts`);

    return new Response(
      JSON.stringify({
        success: true,
        accountsCount: syncedAccounts.length,
        accounts: syncedAccounts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error syncing accounts:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
