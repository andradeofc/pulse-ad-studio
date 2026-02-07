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
          last_synced_at: new Date().toISOString(),
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
          last_synced_at: new Date().toISOString(),
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
          last_synced_at: profile.last_synced_at,
        },
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
