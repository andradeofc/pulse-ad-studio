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

interface FacebookBusiness {
  id: string;
  name: string;
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

    console.log(`[sync-catalogs] Starting sync for user ${user.id}`);

    // Get all Facebook profiles for this user
    const { data: profiles, error: profilesError } = await supabase
      .from('facebook_profiles')
      .select('id, access_token, facebook_id')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (profilesError) {
      console.error('[sync-catalogs] Error fetching profiles:', profilesError);
      throw profilesError;
    }

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No active profiles found',
        catalogs_synced: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalCatalogsSynced = 0;

    for (const profile of profiles) {
      console.log(`[sync-catalogs] Processing profile ${profile.id}`);
      const accessToken = profile.access_token;

      try {
        // Get businesses the user has access to
        const businessesUrl = `https://graph.facebook.com/v21.0/me/businesses?fields=id,name&access_token=${accessToken}`;
        const businessesRes = await fetch(businessesUrl);
        const businessesData = await businessesRes.json();

        if (businessesData.error) {
          console.error(`[sync-catalogs] Error fetching businesses:`, businessesData.error);
          continue;
        }

        const businesses: FacebookBusiness[] = businessesData.data || [];
        const catalogsToUpsert: any[] = [];

        // Fetch catalogs from each business
        for (const business of businesses) {
          console.log(`[sync-catalogs] Fetching catalogs from business ${business.id} (${business.name})`);
          
          const catalogsUrl = `https://graph.facebook.com/v21.0/${business.id}/owned_product_catalogs?fields=id,name,product_count,vertical&limit=500&access_token=${accessToken}`;
          const catalogsRes = await fetch(catalogsUrl);
          const catalogsData = await catalogsRes.json();

          if (catalogsData.error) {
            console.error(`[sync-catalogs] Error fetching catalogs for business ${business.id}:`, catalogsData.error);
            continue;
          }

          const catalogs: FacebookCatalog[] = catalogsData.data || [];
          console.log(`[sync-catalogs] Found ${catalogs.length} catalogs in business ${business.name}`);

          for (const catalog of catalogs) {
            catalogsToUpsert.push({
              profile_id: profile.id,
              catalog_id: catalog.id,
              name: catalog.name,
              business_id: business.id,
              business_name: business.name,
              product_count: catalog.product_count || 0,
              vertical: catalog.vertical || 'commerce',
              updated_at: new Date().toISOString(),
            });
          }
        }

        // Also try to get catalogs from ad accounts (some catalogs are at account level)
        const accountsUrl = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name&access_token=${accessToken}`;
        const accountsRes = await fetch(accountsUrl);
        const accountsData = await accountsRes.json();

        if (!accountsData.error && accountsData.data) {
          for (const account of accountsData.data) {
            const accountCatalogsUrl = `https://graph.facebook.com/v21.0/${account.id}/product_catalogs?fields=id,name,product_count,vertical&limit=500&access_token=${accessToken}`;
            const accountCatalogsRes = await fetch(accountCatalogsUrl);
            const accountCatalogsData = await accountCatalogsRes.json();

            if (!accountCatalogsData.error && accountCatalogsData.data) {
              for (const catalog of accountCatalogsData.data) {
                // Check if we already have this catalog
                const exists = catalogsToUpsert.some(c => c.catalog_id === catalog.id);
                if (!exists) {
                  catalogsToUpsert.push({
                    profile_id: profile.id,
                    catalog_id: catalog.id,
                    name: catalog.name,
                    business_id: null,
                    business_name: null,
                    product_count: catalog.product_count || 0,
                    vertical: catalog.vertical || 'commerce',
                    updated_at: new Date().toISOString(),
                  });
                }
              }
            }
          }
        }

        // Upsert catalogs in batches
        if (catalogsToUpsert.length > 0) {
          const { error: upsertError } = await supabase
            .from('facebook_catalogs')
            .upsert(catalogsToUpsert, {
              onConflict: 'profile_id,catalog_id',
              ignoreDuplicates: false,
            });

          if (upsertError) {
            console.error(`[sync-catalogs] Error upserting catalogs:`, upsertError);
          } else {
            totalCatalogsSynced += catalogsToUpsert.length;
            console.log(`[sync-catalogs] Upserted ${catalogsToUpsert.length} catalogs for profile ${profile.id}`);
          }
        }

      } catch (err) {
        console.error(`[sync-catalogs] Error processing profile ${profile.id}:`, err);
      }
    }

    console.log(`[sync-catalogs] Sync complete. Total catalogs: ${totalCatalogsSynced}`);

    return new Response(JSON.stringify({ 
      success: true, 
      catalogs_synced: totalCatalogsSynced 
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
