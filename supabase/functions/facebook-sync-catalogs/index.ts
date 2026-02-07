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

    // Parse request body for selected account IDs
    let selectedAccountIds: string[] = [];
    try {
      const body = await req.json();
      selectedAccountIds = body.account_ids || [];
    } catch {
      // No body or invalid JSON, will use empty array
    }

    console.log(`[sync-catalogs] Starting sync for user ${user.id}, accounts: ${selectedAccountIds.join(', ') || 'all'}`);

    // Get selected ad accounts from database
    let accountsQuery = supabase
      .from('facebook_ad_accounts')
      .select('id, account_id, name, business_id, business_name, profile_id');

    // Filter by selected accounts if provided
    if (selectedAccountIds.length > 0) {
      // Remove 'act_' prefix if present for matching
      const normalizedIds = selectedAccountIds.map(id => id.replace(/^act_/, ''));
      accountsQuery = accountsQuery.or(
        normalizedIds.map(id => `account_id.eq.${id},account_id.eq.act_${id}`).join(',')
      );
    }

    const { data: accounts, error: accountsError } = await accountsQuery;

    if (accountsError) {
      console.error('[sync-catalogs] Error fetching accounts:', accountsError);
      throw accountsError;
    }

    if (!accounts || accounts.length === 0) {
      console.log('[sync-catalogs] No accounts found to sync');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No accounts found',
        catalogs_synced: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[sync-catalogs] Found ${accounts.length} accounts to sync catalogs from`);

    // Get unique profile IDs to fetch access tokens
    const profileIds = [...new Set(accounts.map(a => a.profile_id))];
    
    const { data: profiles, error: profilesError } = await supabase
      .from('facebook_profiles')
      .select('id, access_token')
      .in('id', profileIds)
      .eq('status', 'active');

    if (profilesError || !profiles || profiles.length === 0) {
      console.error('[sync-catalogs] Error fetching profiles:', profilesError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No active profiles found' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const profileTokenMap = new Map(profiles.map(p => [p.id, p.access_token]));
    const catalogsMap = new Map<string, any>(); // Deduplicate by catalog_id
    let totalCatalogsSynced = 0;

    // Fetch catalogs for each ad account
    for (const account of accounts) {
      const accessToken = profileTokenMap.get(account.profile_id);
      if (!accessToken) {
        console.log(`[sync-catalogs] No token for profile ${account.profile_id}, skipping account ${account.account_id}`);
        continue;
      }

      const accountId = account.account_id.startsWith('act_') 
        ? account.account_id 
        : `act_${account.account_id}`;

      console.log(`[sync-catalogs] Fetching catalogs for account ${accountId} (${account.name})`);

      try {
        // Fetch product catalogs associated with this ad account
        const catalogsUrl = `https://graph.facebook.com/v21.0/${accountId}/product_catalogs?fields=id,name,product_count,vertical,business&limit=500&access_token=${accessToken}`;
        const catalogsRes = await fetch(catalogsUrl);
        const catalogsData = await catalogsRes.json();

        if (catalogsData.error) {
          console.error(`[sync-catalogs] Error fetching catalogs for account ${accountId}:`, catalogsData.error);
          continue;
        }

        const catalogs: FacebookCatalog[] = catalogsData.data || [];
        console.log(`[sync-catalogs] Found ${catalogs.length} catalogs for account ${account.name}`);

        for (const catalog of catalogs) {
          // Use catalog_id as key to deduplicate
          if (!catalogsMap.has(catalog.id)) {
            const businessInfo = (catalog as any).business;
            catalogsMap.set(catalog.id, {
              profile_id: account.profile_id,
              catalog_id: catalog.id,
              name: catalog.name,
              business_id: businessInfo?.id || account.business_id || null,
              business_name: businessInfo?.name || account.business_name || null,
              product_count: catalog.product_count || 0,
              vertical: catalog.vertical || 'commerce',
              updated_at: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.error(`[sync-catalogs] Error processing account ${accountId}:`, err);
      }
    }

    // Upsert all unique catalogs
    const catalogsToUpsert = Array.from(catalogsMap.values());
    
    if (catalogsToUpsert.length > 0) {
      console.log(`[sync-catalogs] Upserting ${catalogsToUpsert.length} unique catalogs`);
      
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
      console.log('[sync-catalogs] No catalogs found for the selected accounts');
    }

    return new Response(JSON.stringify({ 
      success: true, 
      catalogs_synced: totalCatalogsSynced,
      accounts_checked: accounts.length
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
