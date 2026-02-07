import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FacebookCatalog {
  id: string;
  name: string;
  product_count?: number;
  vertical?: string;
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

    // Parse request body - now accepts business_id directly
    let businessId: string | null = null;
    try {
      const body = await req.json();
      businessId = body.business_id || null;
    } catch {
      // No body or invalid JSON
    }

    if (!businessId) {
      console.log('[sync-catalogs] No business_id provided');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'business_id is required',
        catalogs_synced: 0 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[sync-catalogs] Starting sync for user ${user.id}, business_id: ${businessId}`);

    // Get a profile that has access to this business (via ad accounts)
    const { data: accounts, error: accountsError } = await supabase
      .from('facebook_ad_accounts')
      .select('profile_id, business_name')
      .eq('business_id', businessId)
      .limit(1);

    if (accountsError || !accounts || accounts.length === 0) {
      console.error('[sync-catalogs] No accounts found for business:', accountsError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No accounts found for this Business Manager',
        catalogs_synced: 0 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const profileId = accounts[0].profile_id;
    const businessName = accounts[0].business_name;

    // Get access token from profile
    const { data: profile, error: profileError } = await supabase
      .from('facebook_profiles')
      .select('id, access_token')
      .eq('id', profileId)
      .eq('status', 'active')
      .single();

    if (profileError || !profile) {
      console.error('[sync-catalogs] Error fetching profile:', profileError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No active profile found' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = profile.access_token;
    console.log(`[sync-catalogs] Fetching catalogs from BM ${businessId} (${businessName})`);

    // Fetch catalogs owned by this Business Manager
    const catalogsUrl = `https://graph.facebook.com/v21.0/${businessId}/owned_product_catalogs?fields=id,name,product_count,vertical&limit=500&access_token=${accessToken}`;
    const catalogsRes = await fetch(catalogsUrl);
    const catalogsData = await catalogsRes.json();

    if (catalogsData.error) {
      console.error(`[sync-catalogs] Error fetching catalogs from BM ${businessId}:`, catalogsData.error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: catalogsData.error.message || 'Failed to fetch catalogs',
        error_code: catalogsData.error.code,
        catalogs_synced: 0 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const catalogs: FacebookCatalog[] = catalogsData.data || [];
    console.log(`[sync-catalogs] Found ${catalogs.length} catalogs in BM ${businessName}`);

    // Prepare catalogs for upsert
    const catalogsToUpsert = catalogs.map(catalog => ({
      profile_id: profileId,
      catalog_id: catalog.id,
      name: catalog.name,
      business_id: businessId,
      business_name: businessName,
      product_count: catalog.product_count || 0,
      vertical: catalog.vertical || 'commerce',
      updated_at: new Date().toISOString(),
    }));

    let totalCatalogsSynced = 0;
    
    if (catalogsToUpsert.length > 0) {
      console.log(`[sync-catalogs] Upserting ${catalogsToUpsert.length} catalogs`);
      
      const { error: upsertError } = await supabase
        .from('facebook_catalogs')
        .upsert(catalogsToUpsert, {
          onConflict: 'profile_id,catalog_id',
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error(`[sync-catalogs] Error upserting catalogs:`, upsertError);
      } else {
        totalCatalogsSynced = catalogsToUpsert.length;
        console.log(`[sync-catalogs] Successfully upserted ${totalCatalogsSynced} catalogs`);
      }
    } else {
      console.log('[sync-catalogs] No catalogs found in this Business Manager');
    }

    return new Response(JSON.stringify({ 
      success: true, 
      catalogs_synced: totalCatalogsSynced,
      business_id: businessId,
      business_name: businessName
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[sync-catalogs] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
