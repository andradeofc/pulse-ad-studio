import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's primary Facebook profile to use its access token
    const { data: profile, error: profileError } = await supabase
      .from("facebook_profiles")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("is_primary", { ascending: false })
      .limit(1)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "No Facebook profile found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query Facebook's targeting search API for all adlocales
    const url = `https://graph.facebook.com/v25.0/search?type=adlocale&q=&limit=1000&access_token=${profile.access_token}`;
    const fbResp = await fetch(url);
    const fbData = await fbResp.json();

    if (fbData.error) {
      console.error("[search-locales] Facebook API error:", fbData.error);
      return new Response(
        JSON.stringify({ error: fbData.error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the locale list: [{key: number, name: string}, ...]
    const locales = (fbData.data || []).map((l: any) => ({
      id: l.key,
      name: l.name,
    }));

    console.log(`[search-locales] Found ${locales.length} locales`);

    return new Response(JSON.stringify({ locales }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[search-locales] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
