import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FACEBOOK_GRAPH_API = "https://graph.facebook.com/v19.0";

// Rate limit configuration
const RATE_LIMIT_CONFIG = {
  BASE_DELAY_MS: 100,           // Base delay between requests
  HIGH_USAGE_THRESHOLD: 50,     // Start slowing down at 50%
  CRITICAL_THRESHOLD: 80,       // Heavy throttling at 80%
  MAX_DELAY_MS: 2000,           // Maximum delay between requests
};

// Helper to parse rate limit header
function parseRateLimitHeader(header: string | null): number {
  if (!header) return 0;
  try {
    const match = header.match(/acc_id_util_pct=(\d+(?:\.\d+)?)/);
    if (match) return parseFloat(match[1]);
    const parsed = JSON.parse(header);
    if (parsed.acc_id_util_pct !== undefined) return parseFloat(parsed.acc_id_util_pct);
  } catch {
    // Ignore parse errors
  }
  return 0;
}

// Adaptive delay based on rate limit usage
function getAdaptiveDelay(usagePercent: number): number {
  const { BASE_DELAY_MS, HIGH_USAGE_THRESHOLD, CRITICAL_THRESHOLD, MAX_DELAY_MS } = RATE_LIMIT_CONFIG;
  
  if (usagePercent >= CRITICAL_THRESHOLD) {
    return MAX_DELAY_MS;
  } else if (usagePercent >= HIGH_USAGE_THRESHOLD) {
    // Linear scale from BASE to MAX between thresholds
    const factor = (usagePercent - HIGH_USAGE_THRESHOLD) / (CRITICAL_THRESHOLD - HIGH_USAGE_THRESHOLD);
    return Math.min(BASE_DELAY_MS + factor * (MAX_DELAY_MS - BASE_DELAY_MS), MAX_DELAY_MS);
  }
  return BASE_DELAY_MS;
}

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch with rate limit tracking
async function fetchWithRateLimit(
  url: string, 
  currentUsage: { percent: number }
): Promise<{ response: Response; newUsage: number }> {
  // Apply adaptive delay before request
  const delay = getAdaptiveDelay(currentUsage.percent);
  if (delay > 0) {
    await sleep(delay);
  }
  
  const response = await fetch(url);
  
  // Update usage from response header
  const usageHeader = response.headers.get("x-ad-account-usage");
  const newUsage = parseRateLimitHeader(usageHeader);
  
  if (newUsage > 0) {
    currentUsage.percent = newUsage;
    console.log(`Rate limit usage: ${newUsage.toFixed(1)}% (delay: ${delay}ms)`);
  }
  
  return { response, newUsage };
}

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
    
    // Track rate limit usage across all requests
    const rateLimitUsage = { percent: 0 };

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
    
    const { response: personalResponse } = await fetchWithRateLimit(personalAccountsUrl, rateLimitUsage);
    
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
    
    const { response: businessesResponse } = await fetchWithRateLimit(businessesUrl, rateLimitUsage);
    
    if (businessesResponse.ok) {
      const businessesData = await businessesResponse.json();
      const businesses = businessesData.data || [];
      console.log(`Found ${businesses.length} Business Managers`);

      for (const business of businesses) {
        // Check if rate limit is critical - if so, log warning but continue with delays
        if (rateLimitUsage.percent >= RATE_LIMIT_CONFIG.CRITICAL_THRESHOLD) {
          console.warn(`High rate limit usage (${rateLimitUsage.percent.toFixed(1)}%), applying maximum delay`);
        }
        
        // Fetch owned ad accounts for this BM
        console.log(`Fetching ad accounts for BM: ${business.name} (${business.id})`);
        
        const ownedAccountsUrl = `${FACEBOOK_GRAPH_API}/${business.id}/owned_ad_accounts?fields=id,account_id,name,currency,timezone_name,account_status,amount_spent&access_token=${accessToken}`;
        const { response: ownedResponse } = await fetchWithRateLimit(ownedAccountsUrl, rateLimitUsage);
        
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
        const { response: clientResponse } = await fetchWithRateLimit(clientAccountsUrl, rateLimitUsage);
        
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

    console.log(`Synced ${syncedAccounts.length} total ad accounts (final rate limit: ${rateLimitUsage.percent.toFixed(1)}%)`);

    return new Response(
      JSON.stringify({
        success: true,
        accountsCount: syncedAccounts.length,
        accounts: syncedAccounts,
        rateLimitPercent: rateLimitUsage.percent,
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