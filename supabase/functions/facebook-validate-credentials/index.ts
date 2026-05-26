import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FB = "https://graph.facebook.com/v23.0";

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { accessToken, appId, appSecret } = await req.json();

    if (!accessToken) {
      return new Response(
        JSON.stringify({ valid: false, error: "Access token é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // appsecret_proof reduces error 190 noise when both app_secret and token present
    let appsecretProof: string | null = null;
    if (appSecret) {
      try {
        appsecretProof = await hmacSha256Hex(appSecret, accessToken);
      } catch (e) {
        console.warn("[validate-credentials] Failed to compute appsecret_proof:", e);
      }
    }

    // /me
    const meUrl = new URL(`${FB}/me`);
    meUrl.searchParams.set("fields", "id,name,email,picture.type(large)");
    meUrl.searchParams.set("access_token", accessToken);
    if (appsecretProof) meUrl.searchParams.set("appsecret_proof", appsecretProof);

    const meRes = await fetch(meUrl);
    const meData = await meRes.json();

    if (!meRes.ok || meData.error) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: meData?.error?.message || "Token inválido",
          errorCode: meData?.error?.code ?? null,
          errorSubcode: meData?.error?.error_subcode ?? null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // /debug_token
    let scopes: string[] = [];
    let expiresAt: string | null = null;
    let isShortLived = true;
    let appName: string | null = null;
    let tokenAppId: string | null = null;

    try {
      // For debug_token, the access_token param can be the same user token when no app token is available
      const debugUrl = `${FB}/debug_token?input_token=${encodeURIComponent(
        accessToken
      )}&access_token=${encodeURIComponent(
        appId && appSecret ? `${appId}|${appSecret}` : accessToken
      )}`;
      const debugRes = await fetch(debugUrl);
      const debugData = await debugRes.json();
      const td = debugData?.data;
      if (td) {
        scopes = td.scopes || [];
        if (td.expires_at && td.expires_at > 0) {
          expiresAt = new Date(td.expires_at * 1000).toISOString();
          const ttlDays = (td.expires_at * 1000 - Date.now()) / 86400000;
          isShortLived = ttlDays < 7; // anything <7d we consider short-lived
        } else {
          // never expires
          expiresAt = null;
          isShortLived = false;
        }
        tokenAppId = td.app_id ? String(td.app_id) : null;
        appName = td.application || null;
      }
    } catch (e) {
      console.warn("[validate-credentials] debug_token failed:", e);
    }

    // If user provided appId, sanity check
    let appIdMatches: boolean | null = null;
    if (appId && tokenAppId) {
      appIdMatches = String(appId) === tokenAppId;
    }

    return new Response(
      JSON.stringify({
        valid: true,
        userId: meData.id,
        userName: meData.name,
        email: meData.email || null,
        avatarUrl: meData.picture?.data?.url || null,
        scopes,
        expiresAt,
        isShortLived,
        appName,
        appId: tokenAppId,
        appIdMatches,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[validate-credentials] error:", e);
    return new Response(
      JSON.stringify({ valid: false, error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
