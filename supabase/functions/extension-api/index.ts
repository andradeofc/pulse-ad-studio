// Public API consumed by the AdStorm Chrome Extension.
// Routes:
//   POST /auth/login-with-pairing-code  { code }            (public)
//   GET  /auth/me                                            (Bearer ext token)
//   GET  /accounts                                           (Bearer)
//   POST /pages/sync       { accountId, pages: [...] }       (Bearer)
//   POST /ad-limits/sync   { accountId, adLimits: [...] }    (Bearer)
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function resolveUserFromBearer(
  admin: SupabaseClient,
  req: Request,
): Promise<{ userId: string; tokenId: string } | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token || token.length < 16) return null;

  const hash = await sha256(token);
  const { data, error } = await admin
    .from("extension_tokens")
    .select("id, user_id, revoked_at, expires_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  // Best-effort last_used_at update (don't await failure)
  admin.from("extension_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return { userId: data.user_id, tokenId: data.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  // Strip function base: /functions/v1/extension-api
  const path = url.pathname.replace(/^.*\/extension-api/, "") || "/";

  try {
    // -------- Public: exchange pairing code for bearer token --------
    if (req.method === "POST" && path === "/auth/login-with-pairing-code") {
      const body = await req.json().catch(() => ({}));
      const raw = String(body?.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (raw.length !== 6) return json({ error: "Invalid code" }, 400);

      const { data: pairing, error: perr } = await admin
        .from("extension_pairing_codes")
        .select("id, user_id, expires_at, used_at")
        .eq("code", raw)
        .maybeSingle();

      if (perr || !pairing) return json({ error: "Invalid code" }, 401);
      if (pairing.used_at) return json({ error: "Invalid code" }, 401);
      if (new Date(pairing.expires_at).getTime() < Date.now()) {
        return json({ error: "Code expired" }, 401);
      }

      // Mark used (atomic) — only succeeds the first time
      const { data: claimed, error: claimErr } = await admin
        .from("extension_pairing_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", pairing.id)
        .is("used_at", null)
        .select("id")
        .maybeSingle();

      if (claimErr || !claimed) return json({ error: "Invalid code" }, 401);

      // Issue extension token
      const token = randomToken();
      const tokenHash = await sha256(token);

      const ua = req.headers.get("user-agent") || "";
      const label = ua.toLowerCase().includes("edg") ? "Edge Extension"
                  : ua.toLowerCase().includes("chrome") ? "Chrome Extension"
                  : "Browser Extension";

      const { error: tokErr } = await admin.from("extension_tokens").insert({
        token_hash: tokenHash,
        user_id: pairing.user_id,
        label,
      });
      if (tokErr) {
        console.error("token insert failed", tokErr);
        return json({ error: "Failed to issue token" }, 500);
      }

      // Build user payload (email + name)
      const { data: { user: u } } = await admin.auth.admin.getUserById(pairing.user_id);
      const { data: profile } = await admin
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", pairing.user_id)
        .maybeSingle();

      return json({
        accessToken: token,
        // The competitor extension expects refreshToken — we don't rotate, so reuse the same token.
        refreshToken: token,
        expiresIn: 365 * 24 * 60 * 60,
        user: {
          id: pairing.user_id,
          email: u?.email || null,
          name: profile?.full_name || u?.email?.split("@")[0] || "User",
        },
      });
    }

    // -------- Authenticated routes --------
    const auth = await resolveUserFromBearer(admin, req);
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const { userId } = auth;

    if (req.method === "GET" && path === "/auth/me") {
      const { data: { user: u } } = await admin.auth.admin.getUserById(userId);
      const { data: profile } = await admin
        .from("user_profiles")
        .select("full_name, plan")
        .eq("user_id", userId)
        .maybeSingle();
      return json({
        user: {
          id: userId,
          email: u?.email || null,
          name: profile?.full_name || u?.email?.split("@")[0] || "User",
          plan: profile?.plan || null,
        },
      });
    }

    if (req.method === "GET" && path === "/accounts") {
      // List Facebook profiles owned by this user (the "accounts" in extension lingo)
      const { data: profiles, error } = await admin
        .from("facebook_profiles")
        .select("id, name, avatar_url, status, facebook_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("name");
      if (error) return json({ error: error.message }, 500);

      return json({
        accounts: (profiles || []).map((p) => ({
          id: p.id,
          accountName: p.name,
          facebookUserName: p.name,
          facebookUserId: p.facebook_id || null,
          profilePictureUrl: p.avatar_url,
          status: (p.status || "active").toUpperCase(),
        })),
      });
    }

    if (req.method === "POST" && path === "/pages/sync") {
      const body = await req.json().catch(() => ({}));
      const accountId: string = String(body?.accountId || "");
      const pages: Array<{ id: string; name: string; category?: string }> =
        Array.isArray(body?.pages) ? body.pages : [];

      if (!accountId) return json({ error: "accountId required" }, 400);

      // Validate ownership
      const { data: prof } = await admin
        .from("facebook_profiles")
        .select("id")
        .eq("id", accountId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!prof) return json({ error: "Facebook profile not found" }, 404);

      // Get existing page_ids to compute "created" vs "updated"
      const ids = pages.map((p) => String(p.id)).filter(Boolean);
      const { data: existing } = await admin
        .from("facebook_pages")
        .select("page_id")
        .eq("profile_id", accountId)
        .in("page_id", ids);
      const existingSet = new Set((existing || []).map((r) => r.page_id));

      const rows = pages
        .filter((p) => /^\d{10,20}$/.test(String(p.id)))
        .map((p) => ({
          profile_id: accountId,
          page_id: String(p.id),
          name: String(p.name || "").slice(0, 400) || "Unknown",
          category: p.category || null,
          source: "extension",
        }));


      let created = 0, updated = 0;
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error: upErr } = await admin
          .from("facebook_pages")
          .upsert(chunk, { onConflict: "profile_id,page_id" });
        if (upErr) {
          console.error("upsert pages failed", upErr);
          return json({ error: upErr.message }, 500);
        }
        for (const r of chunk) {
          if (existingSet.has(r.page_id)) updated++;
          else created++;
        }
      }

      return json({ success: true, pagesCreated: created, pagesUpdated: updated });
    }

    if (req.method === "POST" && path === "/ad-limits/sync") {
      const body = await req.json().catch(() => ({}));
      const accountId: string = String(body?.accountId || "");
      const adLimits: Array<{
        id: string; name?: string;
        adsRunningOrInReview?: number;
        futureLimit?: number;
        slotsAvailable?: number;
      }> = Array.isArray(body?.adLimits) ? body.adLimits : [];

      if (!accountId) return json({ error: "accountId required" }, 400);

      const { data: prof } = await admin
        .from("facebook_profiles")
        .select("id")
        .eq("id", accountId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!prof) return json({ error: "Facebook profile not found" }, 404);

      // Upsert each page's ads_running + ads_limit
      let updated = 0;
      const rows = adLimits
        .filter((a) => /^\d{10,20}$/.test(String(a.id)))
        .map((a) => ({
          profile_id: accountId,
          page_id: String(a.id),
          name: (a.name || "").slice(0, 400) || "Unknown",
          ads_running: Number(a.adsRunningOrInReview) || 0,
          ads_limit: Number(a.futureLimit) || 250,
        }));

      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error: upErr } = await admin
          .from("facebook_pages")
          .upsert(chunk, { onConflict: "profile_id,page_id" });
        if (upErr) {
          console.error("upsert ad limits failed", upErr);
          return json({ error: upErr.message }, 500);
        }
        updated += chunk.length;
      }

      return json({ success: true, pagesUpdated: updated });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    console.error("extension-api error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
