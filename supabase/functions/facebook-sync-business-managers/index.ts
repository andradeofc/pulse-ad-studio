import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FacebookBusiness {
  id: string;
  name: string;
  primary_page?: { id: string };
  timezone_id?: number;
  verification_status?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    let profileId: string | null = null;
    try {
      const body = await req.json();
      profileId = body.profile_id || null;
    } catch {
      // No body or invalid JSON
    }

    // If no profileId, sync all profiles for user
    // Get profiles (without access_token - it's now stored securely)
    let profiles;
    if (profileId) {
      const { data, error } = await supabase
        .from('facebook_profiles')
        .select('id')
        .eq('id', profileId)
        .eq('user_id', user.id)
        .eq('status', 'active');
      
      if (error) throw error;
      profiles = data;
    } else {
      const { data, error } = await supabase
        .from('facebook_profiles')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active');
      
      if (error) throw error;
      profiles = data;
    }

    if (!profiles || profiles.length === 0) {
      console.log('[sync-business-managers] No active profiles found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No active profiles found',
        business_managers_synced: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalBMsSynced = 0;

    for (const profile of profiles) {
      console.log(`[sync-business-managers] Fetching BMs for profile ${profile.id}`);
      
      // Get access token securely (service role already in use)
      const { data: credentials } = await supabase
        .from('facebook_credentials')
        .select('access_token')
        .eq('profile_id', profile.id)
        .single();

      // Fallback to facebook_profiles.access_token if credentials not found
      let accessToken: string | null = null;
      if (credentials?.access_token) {
        accessToken = credentials.access_token;
      } else {
        const { data: fallbackProfile } = await supabase
          .from('facebook_profiles')
          .select('access_token')
          .eq('id', profile.id)
          .single();
        accessToken = fallbackProfile?.access_token || null;
      }

      if (!accessToken) {
        console.warn(`[sync-business-managers] No access token found for profile ${profile.id}`);
        continue;
      }
      
      // Fetch all businesses the user has access to via /me/businesses
      const businessesUrl = `https://graph.facebook.com/v21.0/me/businesses?fields=id,name,primary_page,timezone_id,verification_status&limit=500&access_token=${accessToken}`;
      
      const response = await fetch(businessesUrl);
      const data = await response.json();

      if (data.error) {
        console.error(`[sync-business-managers] Error fetching BMs for profile ${profile.id}:`, data.error);
        continue;
      }

      const businesses: FacebookBusiness[] = data.data || [];
      console.log(`[sync-business-managers] Found ${businesses.length} BMs for profile ${profile.id}`);

      if (businesses.length === 0) continue;

      // Prepare records for upsert
      const bmsToUpsert = businesses.map(bm => ({
        profile_id: profile.id,
        business_id: bm.id,
        name: bm.name,
        primary_page_id: bm.primary_page?.id || null,
        timezone: bm.timezone_id?.toString() || null,
        verification_status: bm.verification_status || null,
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from('facebook_business_managers')
        .upsert(bmsToUpsert, {
          onConflict: 'profile_id,business_id',
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error(`[sync-business-managers] Error upserting BMs:`, upsertError);
      } else {
        totalBMsSynced += businesses.length;
        console.log(`[sync-business-managers] Upserted ${businesses.length} BMs for profile ${profile.id}`);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      business_managers_synced: totalBMsSynced,
      profiles_processed: profiles.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[sync-business-managers] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
