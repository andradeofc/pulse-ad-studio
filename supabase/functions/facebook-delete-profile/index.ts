import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User-scoped client (respects RLS)
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service-role client (bypasses RLS for credential cleanup)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

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

    console.log(`[delete-profile] Soft-deleting profile ${profileId} for user ${userId}`);

    // 1. Verify ownership
    const { data: profile, error: profileError } = await supabase
      .from("facebook_profiles")
      .select("id, facebook_id, name")
      .eq("id", profileId)
      .eq("user_id", userId)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Count dependent resources before disconnecting
    const [monitorsResult, schedulesResult] = await Promise.all([
      supabaseAdmin
        .from("catalog_media_monitors")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("is_active", true),
      supabaseAdmin
        .from("catalog_schedules")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("status", "pending"),
    ]);

    const activeMonitors = monitorsResult.count || 0;
    const pendingSchedules = schedulesResult.count || 0;

    console.log(`[delete-profile] Found ${activeMonitors} active monitors, ${pendingSchedules} pending schedules`);

    // 3. Pause active monitors linked to this profile
    if (activeMonitors > 0) {
      const { error: pauseMonitorsError } = await supabaseAdmin
        .from("catalog_media_monitors")
        .update({ is_active: false })
        .eq("profile_id", profileId)
        .eq("is_active", true);

      if (pauseMonitorsError) {
        console.error("[delete-profile] Error pausing monitors:", pauseMonitorsError);
      } else {
        console.log(`[delete-profile] Paused ${activeMonitors} monitors`);
      }
    }

    // 4. Pause pending schedules linked to this profile
    if (pendingSchedules > 0) {
      const { error: pauseSchedulesError } = await supabaseAdmin
        .from("catalog_schedules")
        .update({ status: "paused" })
        .eq("profile_id", profileId)
        .eq("status", "pending");

      if (pauseSchedulesError) {
        console.error("[delete-profile] Error pausing schedules:", pauseSchedulesError);
      } else {
        console.log(`[delete-profile] Paused ${pendingSchedules} schedules`);
      }
    }

    // 5. Soft-delete: mark profile as disconnected and clear sensitive data
    const { error: updateError } = await supabase
      .from("facebook_profiles")
      .update({
        status: "disconnected",
        access_token: "REVOKED",
        sync_status: "idle",
      })
      .eq("id", profileId)
      .eq("user_id", userId);

    if (updateError) {
      console.error("[delete-profile] Error updating profile:", updateError);
      throw updateError;
    }

    // 6. Remove secure credentials
    const { error: credDeleteError } = await supabaseAdmin
      .from("facebook_credentials")
      .delete()
      .eq("profile_id", profileId);

    if (credDeleteError) {
      console.error("[delete-profile] Error deleting credentials:", credDeleteError);
      // Non-fatal: token is already revoked in the profile
    }

    console.log("[delete-profile] Profile soft-deleted successfully");

    return new Response(
      JSON.stringify({
        success: true,
        paused_monitors: activeMonitors,
        paused_schedules: pendingSchedules,
        message: activeMonitors > 0 || pendingSchedules > 0
          ? `Perfil desconectado. ${activeMonitors} monitores e ${pendingSchedules} agendamentos foram pausados.`
          : "Perfil desconectado com sucesso.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[delete-profile] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
