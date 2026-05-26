// Daily cron: refresh long-lived tokens before they expire (< 7 days),
// and re-check token health for all 'facebook_app' profiles.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

interface ProfileRow {
  id: string;
  user_id: string;
  name: string;
  access_token: string;
  app_id: string | null;
  app_secret: string | null;
  auth_method: string | null;
  token_expires_at: string | null;
  is_long_lived: boolean | null;
}

interface RefreshResult {
  profileId: string;
  name: string;
  action: "refreshed" | "checked_ok" | "marked_expired" | "marked_blocked" | "skipped";
  expiresAt?: string | null;
  error?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(supabaseUrl, serviceKey);

    // Optional: profileId for on-demand refresh of a single profile (used by UI button)
    let targetProfileId: string | null = null;
    try {
      const body = await req.json();
      targetProfileId = body?.profileId || null;
    } catch { /* GET / no body */ }

    // Load eligible profiles
    let query = svc
      .from("facebook_profiles")
      .select(
        "id,user_id,name,access_token,app_id,app_secret,auth_method,token_expires_at,is_long_lived"
      )
      .neq("status", "disconnected");

    if (targetProfileId) {
      query = query.eq("id", targetProfileId);
    } else {
      // Only auto-refresh app-based profiles whose token will expire within 7 days
      // OR whose status is unknown / not VALID
      query = query.eq("auth_method", "facebook_app");
    }

    const { data: profiles, error } = await query;
    if (error) throw error;

    const results: RefreshResult[] = [];
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const p of (profiles || []) as ProfileRow[]) {
      try {
        const expiresMs = p.token_expires_at ? new Date(p.token_expires_at).getTime() : null;
        const needsRefresh =
          targetProfileId !== null ||
          (p.app_id && p.app_secret &&
            (!expiresMs || expiresMs - now < sevenDaysMs));

        // ── Health check first ──
        const appsecretProof =
          p.app_secret ? await hmacSha256Hex(p.app_secret, p.access_token) : null;
        const meUrl = new URL(`${FB}/me`);
        meUrl.searchParams.set("fields", "id");
        meUrl.searchParams.set("access_token", p.access_token);
        if (appsecretProof) meUrl.searchParams.set("appsecret_proof", appsecretProof);

        const meRes = await fetch(meUrl);
        const meData = await meRes.json();

        if (!meRes.ok || meData.error) {
          const code = meData?.error?.code;
          const subcode = meData?.error?.error_subcode;
          const msg = meData?.error?.message || "Token inválido";

          // 190 = OAuth (expired/revoked); 4 / 17 / 32 / 613 = rate limit / app blocked
          const isExpired = code === 190;
          const isBlocked = [4, 17, 32, 613].includes(code);

          await svc
            .from("facebook_profiles")
            .update({
              token_status: isBlocked ? "API_BLOCKED" : isExpired ? "EXPIRED" : "INVALID",
              token_check_error: msg,
              token_check_error_code: String(code ?? subcode ?? ""),
              last_token_check_at: new Date().toISOString(),
            })
            .eq("id", p.id);

          results.push({
            profileId: p.id,
            name: p.name,
            action: isBlocked ? "marked_blocked" : "marked_expired",
            error: msg,
          });
          continue;
        }

        // Token is healthy. Refresh if needed and possible.
        if (needsRefresh && p.app_id && p.app_secret) {
          const url = new URL(`${FB}/oauth/access_token`);
          url.searchParams.set("grant_type", "fb_exchange_token");
          url.searchParams.set("client_id", p.app_id);
          url.searchParams.set("client_secret", p.app_secret);
          url.searchParams.set("fb_exchange_token", p.access_token);

          const exRes = await fetch(url);
          const exData = await exRes.json();

          if (!exRes.ok || exData.error || !exData.access_token) {
            const msg = exData?.error?.message || "Falha ao renovar";
            await svc
              .from("facebook_profiles")
              .update({
                token_status: "EXPIRING_SOON",
                token_check_error: msg,
                token_check_error_code: String(exData?.error?.code ?? ""),
                last_token_check_at: new Date().toISOString(),
              })
              .eq("id", p.id);
            results.push({ profileId: p.id, name: p.name, action: "skipped", error: msg });
            continue;
          }

          const newToken = exData.access_token as string;
          const expiresIn = (exData.expires_in as number) || 60 * 24 * 60 * 60;
          const newExpiresAt = new Date(now + expiresIn * 1000).toISOString();

          await svc
            .from("facebook_profiles")
            .update({
              access_token: newToken,
              token_expires_at: newExpiresAt,
              is_long_lived: true,
              token_status: "VALID",
              token_check_error: null,
              token_check_error_code: null,
              last_token_check_at: new Date().toISOString(),
            })
            .eq("id", p.id);

          await svc
            .from("facebook_credentials")
            .upsert(
              { profile_id: p.id, access_token: newToken, updated_at: new Date().toISOString() },
              { onConflict: "profile_id" }
            );

          results.push({
            profileId: p.id,
            name: p.name,
            action: "refreshed",
            expiresAt: newExpiresAt,
          });
        } else {
          // Healthy & not expiring soon. Update status as EXPIRING_SOON if <14d.
          const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
          const status =
            expiresMs && expiresMs - now < fourteenDaysMs ? "EXPIRING_SOON" : "VALID";
          await svc
            .from("facebook_profiles")
            .update({
              token_status: status,
              token_check_error: null,
              token_check_error_code: null,
              last_token_check_at: new Date().toISOString(),
            })
            .eq("id", p.id);
          results.push({
            profileId: p.id,
            name: p.name,
            action: "checked_ok",
            expiresAt: p.token_expires_at,
          });
        }
      } catch (e) {
        console.error(`[refresh-token] profile ${p.id} failed:`, e);
        results.push({
          profileId: p.id,
          name: p.name,
          action: "skipped",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const summary = {
      total: results.length,
      refreshed: results.filter((r) => r.action === "refreshed").length,
      healthy: results.filter((r) => r.action === "checked_ok").length,
      expired: results.filter((r) => r.action === "marked_expired").length,
      blocked: results.filter((r) => r.action === "marked_blocked").length,
      skipped: results.filter((r) => r.action === "skipped").length,
    };

    console.log("[refresh-token] summary:", summary);

    return new Response(
      JSON.stringify({ success: true, summary, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[refresh-token] fatal:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Erro" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
