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
      .select("id, name, status")
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

    // Get access token securely from facebook_credentials (service role has access)
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    const { data: credentials } = await supabaseService
      .from("facebook_credentials")
      .select("access_token")
      .eq("profile_id", profileId)
      .single();

    // Fallback to facebook_profiles.access_token if credentials not found (migration period)
    let accessToken: string;
    if (credentials?.access_token) {
      accessToken = credentials.access_token;
      console.log("Using secure credentials");
    } else {
      // Fallback during migration
      const { data: fallbackProfile } = await supabaseService
        .from("facebook_profiles")
        .select("access_token")
        .eq("id", profileId)
        .single();
      
      if (!fallbackProfile?.access_token) {
        return new Response(
          JSON.stringify({ error: "No access token found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      accessToken = fallbackProfile.access_token;
      console.warn("Using fallback token");
    }

    const syncedAccounts: any[] = [];

    // Helper function to upsert ad account with spend
    const upsertAdAccount = async (account: any, businessId: string | null, businessName: string | null) => {
      const accountStatus = account.account_status === 1 ? "active" : 
                           account.account_status === 2 ? "disabled" : 
                           account.account_status === 3 ? "unsettled" : "unknown";
      
      // Parse amount_spent (Facebook returns in cents for most currencies)
      const amountSpent = account.amount_spent ? parseFloat(account.amount_spent) / 100 : 0;
      
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
            business_id: businessId,
            business_name: businessName,
            amount_spent: amountSpent,
            spend_updated_at: new Date().toISOString(),
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
    };

    // 2. Fetch personal ad accounts with spend
    console.log("Fetching personal ad accounts...");
    const personalAccountsUrl = `${FACEBOOK_GRAPH_API}/me/adaccounts?fields=id,account_id,name,currency,timezone_name,account_status,amount_spent&access_token=${accessToken}`;
    
    const personalResponse = await fetch(personalAccountsUrl);
    
    if (!personalResponse.ok) {
      const errorData = await personalResponse.json();
      console.error("Facebook API error (personal accounts):", errorData);
      
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
    } else {
      const personalData = await personalResponse.json();
      const personalAccounts = personalData.data || [];
      console.log(`Found ${personalAccounts.length} personal ad accounts`);
      
      for (const account of personalAccounts) {
        await upsertAdAccount(account, null, "Pessoal");
      }
    }

    // 3. Fetch Business Managers
    console.log("Fetching Business Managers...");
    const businessesUrl = `${FACEBOOK_GRAPH_API}/me/businesses?fields=id,name&access_token=${accessToken}`;
    
    const businessesResponse = await fetch(businessesUrl);
    
    if (businessesResponse.ok) {
      const businessesData = await businessesResponse.json();
      const businesses = businessesData.data || [];
      console.log(`Found ${businesses.length} Business Managers`);

      for (const business of businesses) {
        // Fetch owned ad accounts for this BM
        console.log(`Fetching ad accounts for BM: ${business.name} (${business.id})`);
        
        const ownedAccountsUrl = `${FACEBOOK_GRAPH_API}/${business.id}/owned_ad_accounts?fields=id,account_id,name,currency,timezone_name,account_status,amount_spent&access_token=${accessToken}`;
        const ownedResponse = await fetch(ownedAccountsUrl);
        
        if (ownedResponse.ok) {
          const ownedData = await ownedResponse.json();
          const ownedAccounts = ownedData.data || [];
          console.log(`Found ${ownedAccounts.length} owned accounts in BM ${business.name}`);
          
          for (const account of ownedAccounts) {
            await upsertAdAccount(account, business.id, business.name);
          }
        } else {
          console.error(`Error fetching owned accounts for BM ${business.id}:`, await ownedResponse.text());
        }

        // Fetch client ad accounts for this BM
        const clientAccountsUrl = `${FACEBOOK_GRAPH_API}/${business.id}/client_ad_accounts?fields=id,account_id,name,currency,timezone_name,account_status,amount_spent&access_token=${accessToken}`;
        const clientResponse = await fetch(clientAccountsUrl);
        
        if (clientResponse.ok) {
          const clientData = await clientResponse.json();
          const clientAccounts = clientData.data || [];
          console.log(`Found ${clientAccounts.length} client accounts in BM ${business.name}`);
          
          for (const account of clientAccounts) {
            await upsertAdAccount(account, business.id, business.name);
          }
        } else {
          console.error(`Error fetching client accounts for BM ${business.id}:`, await clientResponse.text());
        }
      }
    } else {
      console.log("Could not fetch Business Managers (user may not have any)");
    }

    // 4. Update profile last_synced_at
    await supabase
      .from("facebook_profiles")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", profileId);

    console.log(`Synced ${syncedAccounts.length} total ad accounts`);

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
