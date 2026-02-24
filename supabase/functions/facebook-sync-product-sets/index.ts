import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FacebookProductSet {
  id: string;
  name: string;
  product_count?: number;
  filter?: string;
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

    // Get request body
    const { catalog_id, catalog_db_id } = await req.json();

    if (!catalog_id || !catalog_db_id) {
      return new Response(JSON.stringify({ error: 'catalog_id and catalog_db_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[sync-product-sets] Starting sync for catalog ${catalog_id}`);

    // Verify user owns this catalog
    const { data: catalog, error: catalogError } = await supabase
      .from('facebook_catalogs')
      .select('id, profile_id, catalog_id')
      .eq('id', catalog_db_id)
      .single();

    if (catalogError || !catalog) {
      return new Response(JSON.stringify({ error: 'Catalog not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the profile to verify ownership
    const { data: profile, error: profileError } = await supabase
      .from('facebook_profiles')
      .select('user_id')
      .eq('id', catalog.profile_id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify ownership (resolve effective user id for collaborators)
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('owner_id')
      .eq('member_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    const effectiveUserId = (teamMember as any)?.owner_id || user.id;

    if (profile.user_id !== effectiveUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get access token securely (service role already in use)
    const { data: credentials } = await supabase
      .from('facebook_credentials')
      .select('access_token')
      .eq('profile_id', catalog.profile_id)
      .single();

    // Fallback to facebook_profiles.access_token if credentials not found
    let accessToken: string | null = null;
    if (credentials?.access_token) {
      accessToken = credentials.access_token;
    } else {
      const { data: fallbackProfile } = await supabase
        .from('facebook_profiles')
        .select('access_token')
        .eq('id', catalog.profile_id)
        .single();
      accessToken = fallbackProfile?.access_token || null;
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'No access token found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch product sets from Facebook
    const productSetsUrl = `https://graph.facebook.com/v21.0/${catalog_id}/product_sets?fields=id,name,product_count,filter&limit=500&access_token=${accessToken}`;
    const productSetsRes = await fetch(productSetsUrl);
    const productSetsData = await productSetsRes.json();

    if (productSetsData.error) {
      console.error('[sync-product-sets] Error from Facebook:', productSetsData.error);
      return new Response(JSON.stringify({ error: productSetsData.error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const productSets: FacebookProductSet[] = productSetsData.data || [];
    console.log(`[sync-product-sets] Found ${productSets.length} product sets`);

    // Prepare data for upsert
    const setsToUpsert = productSets.map(set => ({
      catalog_id: catalog_db_id, // Database UUID, not Facebook ID
      product_set_id: set.id,
      name: set.name,
      product_count: set.product_count || 0,
      filter: set.filter ? JSON.stringify(set.filter) : null,
    }));

    // Upsert product sets
    if (setsToUpsert.length > 0) {
      const { error: upsertError } = await supabase
        .from('facebook_product_sets')
        .upsert(setsToUpsert, {
          onConflict: 'catalog_id,product_set_id',
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error('[sync-product-sets] Error upserting:', upsertError);
        throw upsertError;
      }
    }

    console.log(`[sync-product-sets] Sync complete. Synced ${setsToUpsert.length} product sets`);

    return new Response(JSON.stringify({ 
      success: true, 
      product_sets_synced: setsToUpsert.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[sync-product-sets] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
