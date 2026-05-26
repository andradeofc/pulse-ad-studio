// Generates a short-lived 6-char pairing code for the Chrome extension.
// Requires the logged-in user's Supabase JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Avoid visually ambiguous chars (0/O, 1/I)
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function genCode(len = 6) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Clear previous unused codes for this user (keep table clean)
    await admin
      .from("extension_pairing_codes")
      .delete()
      .eq("user_id", user.id)
      .is("used_at", null);

    // Try a few times in case of (very unlikely) code collision
    let code = "";
    let expiresAt = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = genCode(6);
      const exp = new Date(Date.now() + 60_000).toISOString();
      const { error: insErr } = await admin
        .from("extension_pairing_codes")
        .insert({ code: candidate, user_id: user.id, expires_at: exp });
      if (!insErr) {
        code = candidate;
        expiresAt = exp;
        break;
      }
      if (!insErr || (insErr as any).code !== "23505") {
        // Not a unique-violation → real error, bail
        if (attempt === 4) {
          console.error("pairing code insert failed", insErr);
          return new Response(JSON.stringify({ error: "Failed to create code" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ code, expiresAt, ttlSeconds: 60 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("extension-pairing-code error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
