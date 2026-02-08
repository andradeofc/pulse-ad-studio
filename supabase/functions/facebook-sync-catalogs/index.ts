import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface FacebookCatalog {
  id: string;
  name: string;
  product_count?: number;
  vertical?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJsonWithRetry(url: string, label: string) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url);

    // Handle rate limit / transient errors
    if (res.status === 429 || res.status >= 500) {
      const bodyText = await res.text();
      const waitMs = Math.min(4000, 500 * Math.pow(2, attempt - 1));
      console.warn(
        `[sync-catalogs] ${label} got HTTP ${res.status} (attempt ${attempt}/${maxAttempts}). Waiting ${waitMs}ms. Body: ${bodyText.slice(0, 250)}`,
      );
      if (attempt === maxAttempts) {
        throw new Error(`${label} failed after retries (HTTP ${res.status})`);
      }
      await sleep(waitMs);
      continue;
    }

    const json = await res.json();
    return { status: res.status, json };
  }

  throw new Error(`${label} failed unexpectedly`);
}

async function fetchAllPagesData(firstUrl: string, label: string, maxPages = 10): Promise<any[]> {
  const out: any[] = [];
  let url: string | null = firstUrl;
  let page = 0;

  while (url) {
    page++;
    if (page > maxPages) {
      console.warn(`[sync-catalogs] ${label} hit maxPages=${maxPages}, stopping pagination`);
      break;
    }

    const { json } = await fetchJsonWithRetry(url, `${label} page ${page}`);

    if (json?.error) {
      const msg = json.error?.message || 'Unknown Facebook API error';
      const code = json.error?.code;
      throw new Error(`${label} error (code ${code}): ${msg}`);
    }

    const data = json?.data || [];
    out.push(...data);

    url = json?.paging?.next || null;
  }

  return out;
}

function normalizeActId(accountId: string) {
  return accountId.startsWith('act_') ? accountId : `act_${accountId}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Body
    let businessId: string | null = null;
    let adAccountDbIds: string[] = [];

    try {
      const body = await req.json();
      businessId = body.business_id || null;
      adAccountDbIds = Array.isArray(body.ad_account_ids) ? body.ad_account_ids : [];
    } catch {
      // ignore
    }

    if (!businessId) {
      return new Response(
        JSON.stringify({ success: false, error: 'business_id is required', catalogs_synced: 0 }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    console.log(
      `[sync-catalogs] user=${user.id} business_id=${businessId} ad_accounts=${adAccountDbIds.length}`,
    );

    // Active profiles for this user (without access_token - it's now stored securely)
    const { data: profiles, error: profilesError } = await supabase
      .from('facebook_profiles')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (profilesError || !profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No active profile found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get credentials for all profiles securely
    const profileIds = profiles.map((p) => p.id);
    const { data: allCredentials } = await supabase
      .from('facebook_credentials')
      .select('profile_id, access_token')
      .in('profile_id', profileIds);

    // Build map with credentials (fallback to facebook_profiles if needed)
    const profilesById = new Map<string, { id: string; access_token: string | null }>();
    for (const p of profiles) {
      const cred = allCredentials?.find(c => c.profile_id === p.id);
      profilesById.set(p.id, { 
        id: p.id, 
        access_token: cred?.access_token || null 
      });
    }

    // Fallback: get tokens from facebook_profiles for profiles without credentials
    const profilesWithoutCreds = profiles.filter(p => !profilesById.get(p.id)?.access_token);
    if (profilesWithoutCreds.length > 0) {
      const { data: fallbackProfiles } = await supabase
        .from('facebook_profiles')
        .select('id, access_token')
        .in('id', profilesWithoutCreds.map(p => p.id));
      
      for (const fp of fallbackProfiles || []) {
        if (fp.access_token) {
          profilesById.set(fp.id, { id: fp.id, access_token: fp.access_token });
        }
      }
    }

    // BM row for this user (name + profile reference)
    const { data: bmRows, error: bmError } = await supabase
      .from('facebook_business_managers')
      .select('profile_id, name')
      .eq('business_id', businessId)
      .in('profile_id', profileIds)
      .limit(1);

    if (bmError || !bmRows || bmRows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Business Manager not found for this profile. Sync Business Managers first.',
          catalogs_synced: 0,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const bm = bmRows[0];
    const businessName = bm.name;

    const debug: Record<string, any> = {
      owned_product_catalogs: { count: 0 },
      discovered_from_adsets: {
        accounts_processed: 0,
        adsets_scanned: 0,
        catalog_ids_found: 0,
        errors: [] as Array<{ scope: string; error: string }>,
      },
    };

    const catalogMap = new Map<string, FacebookCatalog>();

    // A) Owned catalogs
    const ownedToken = profilesById.get(bm.profile_id)?.access_token;
    if (ownedToken) {
      try {
        const url = new URL(`https://graph.facebook.com/v21.0/${businessId}/owned_product_catalogs`);
        url.searchParams.set('fields', 'id,name,product_count,vertical');
        url.searchParams.set('limit', '500');
        url.searchParams.set('access_token', ownedToken);

        const owned = (await fetchAllPagesData(url.toString(), 'owned_product_catalogs', 10)) as FacebookCatalog[];
        debug.owned_product_catalogs.count = owned.length;
        for (const c of owned) catalogMap.set(c.id, c);
        console.log(`[sync-catalogs] owned_product_catalogs=${owned.length}`);
      } catch (err: any) {
        debug.owned_product_catalogs.error = err?.message || String(err);
        console.warn(`[sync-catalogs] owned_product_catalogs failed: ${debug.owned_product_catalogs.error}`);
      }
    } else {
      debug.owned_product_catalogs.error = 'No active token for BM profile';
    }

    // B) If we still have nothing, discover catalogs via AdSets promoted_object.product_catalog_id
    if (catalogMap.size === 0 && adAccountDbIds.length > 0) {
      const { data: adAccounts, error: adAccountsError } = await supabase
        .from('facebook_ad_accounts')
        .select('id, profile_id, account_id')
        .in('id', adAccountDbIds)
        .in('profile_id', profileIds);

      if (adAccountsError) {
        debug.discovered_from_adsets.errors.push({ scope: 'db:facebook_ad_accounts', error: adAccountsError.message });
      } else {
        const discoveredCatalogIds = new Set<string>();

        for (const acc of adAccounts || []) {
          const tokenForAccount = profilesById.get(acc.profile_id)?.access_token;
          if (!tokenForAccount) continue;

          debug.discovered_from_adsets.accounts_processed++;

          const actId = normalizeActId(acc.account_id);
          try {
            const url = new URL(`https://graph.facebook.com/v21.0/${actId}/adsets`);
            url.searchParams.set('fields', 'id,name,promoted_object{product_catalog_id},effective_status');
            url.searchParams.set('limit', '200');
            url.searchParams.set('access_token', tokenForAccount);

            const adsets = await fetchAllPagesData(url.toString(), `${actId}/adsets`, 5);
            debug.discovered_from_adsets.adsets_scanned += adsets.length;

            for (const adset of adsets) {
              const catalogId = adset?.promoted_object?.product_catalog_id;
              if (catalogId) discoveredCatalogIds.add(String(catalogId));
            }
          } catch (err: any) {
            debug.discovered_from_adsets.errors.push({
              scope: `${actId}/adsets`,
              error: err?.message || String(err),
            });
          }
        }

        debug.discovered_from_adsets.catalog_ids_found = discoveredCatalogIds.size;

        // Fetch catalog node details
        for (const catalogId of discoveredCatalogIds) {
          try {
            // Use ownedToken when possible; fallback to any active token
            const t = ownedToken || profiles[0].access_token;
            const url = new URL(`https://graph.facebook.com/v21.0/${catalogId}`);
            url.searchParams.set('fields', 'id,name,product_count,vertical');
            url.searchParams.set('access_token', t);

            const { json } = await fetchJsonWithRetry(url.toString(), `catalog ${catalogId}`);
            if (json?.error) {
              throw new Error(`catalog ${catalogId} error (code ${json.error?.code}): ${json.error?.message}`);
            }

            const c: FacebookCatalog = {
              id: String(json.id),
              name: String(json.name || catalogId),
              product_count: json.product_count ?? 0,
              vertical: json.vertical ?? 'commerce',
            };
            catalogMap.set(c.id, c);
          } catch (err: any) {
            debug.discovered_from_adsets.errors.push({
              scope: `catalog_node:${catalogId}`,
              error: err?.message || String(err),
            });
          }
        }
      }
    }

    const allCatalogs = Array.from(catalogMap.values());
    console.log(`[sync-catalogs] unique_catalogs=${allCatalogs.length}`);

    // Upsert
    const catalogsToUpsert = allCatalogs.map((catalog) => ({
      profile_id: bm.profile_id,
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
      const { error: upsertError } = await supabase.from('facebook_catalogs').upsert(catalogsToUpsert, {
        onConflict: 'profile_id,catalog_id',
        ignoreDuplicates: false,
      });

      if (upsertError) {
        console.error('[sync-catalogs] Error upserting catalogs:', upsertError);
      } else {
        totalCatalogsSynced = catalogsToUpsert.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        catalogs_synced: totalCatalogsSynced,
        business_id: businessId,
        business_name: businessName,
        debug,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error: any) {
    console.error('[sync-catalogs] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
