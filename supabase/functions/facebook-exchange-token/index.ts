import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FB = "https://graph.facebook.com/v23.0";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { appId, appSecret, shortToken, profileId } = await req.json();

    if (!appId || !appSecret || !shortToken) {
      return new Response(
        JSON.stringify({ error: "appId, appSecret e shortToken são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(`${FB}/oauth/access_token`);
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", String(appId));
    url.searchParams.set("client_secret", String(appSecret));
    url.searchParams.set("fb_exchange_token", String(shortToken));

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      console.error("[exchange-token] FB error:", data?.error);
      return new Response(
        JSON.stringify({
          success: false,
          error: data?.error?.message || "Falha ao trocar token",
          errorCode: data?.error?.code ?? null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const longLivedToken = data.access_token as string;
    const expiresIn = (data.expires_in as number) || 60 * 24 * 60 * 60; // ~60d default
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Persist on profile if profileId provided
    if (profileId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const svc = createClient(supabaseUrl, serviceKey);

        await svc
          .from("facebook_profiles")
          .update({
            access_token: longLivedToken,
            token_expires_at: expiresAt,
            is_long_lived: true,
            token_status: "VALID",
            token_check_error: null,
            token_check_error_code: null,
            last_token_check_at: new Date().toISOString(),
          })
          .eq("id", profileId);

        await svc
          .from("facebook_credentials")
          .upsert(
            {
              profile_id: profileId,
              access_token: longLivedToken,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "profile_id" }
          );
      } catch (e) {
        console.error("[exchange-token] Failed to persist:", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        accessToken: longLivedToken,
        tokenType: data.token_type || "bearer",
        isLongLived: true,
        expiresAt,
        expiresIn,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[exchange-token] error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
