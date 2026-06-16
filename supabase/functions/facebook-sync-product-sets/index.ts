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

    // Build a prioritized list of candidate tokens to try:
    // 1) the catalog's own profile (if active + valid token)
    // 2) any other active profile owned by the effective user with a valid token
    // This handles cases where the catalog row points to a disconnected/stale profile
    // but the user has other active profiles that can read the same catalog via BM sharing.
    const { data: userProfiles } = await supabase
      .from('facebook_profiles')
      .select('id, name, status, role, access_token')
      .eq('user_id', effectiveUserId);

    const profileIds = (userProfiles || []).map((p: any) => p.id);
    const { data: allCreds } = await supabase
      .from('facebook_credentials')
      .select('profile_id, access_token')
      .in('profile_id', profileIds.length > 0 ? profileIds : ['00000000-0000-0000-0000-000000000000']);

    const credMap = new Map<string, string>();
    for (const c of allCreds || []) {
      if (c.access_token && c.access_token.length > 30) credMap.set(c.profile_id, c.access_token);
    }

    type Candidate = { profile_id: string; name: string; token: string };
    const candidates: Candidate[] = [];
    const seenProfiles = new Set<string>();

    const pushCandidate = (p: any) => {
      if (!p || seenProfiles.has(p.id)) return;
      const tok = credMap.get(p.id) || (p.access_token && p.access_token.length > 30 ? p.access_token : null);
      if (!tok) return;
      seenProfiles.add(p.id);
      candidates.push({ profile_id: p.id, name: p.name, token: tok });
    };

    // Priority 1: the catalog's own profile (if active)
    const ownerProfile = (userProfiles || []).find((p: any) => p.id === catalog.profile_id && p.status === 'active');
    pushCandidate(ownerProfile);

    // Priority 2: other active profiles
    for (const p of (userProfiles || [])) {
      if (p.status === 'active') pushCandidate(p);
    }

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ error: 'No active profile with a valid token was found for this user.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try each candidate token until one succeeds
    let productSetsData: any = null;
    let lastError: any = null;
    let usedProfile: string | null = null;

    for (const cand of candidates) {
      const productSetsUrl = `https://graph.facebook.com/v21.0/${catalog_id}/product_sets?fields=id,name,product_count,filter&limit=500&access_token=${cand.token}`;
      try {
        const res = await fetch(productSetsUrl);
        const data = await res.json();
        if (data?.error) {
          console.warn(`[sync-product-sets] Profile "${cand.name}" failed: ${data.error.message} (code ${data.error.code})`);
          lastError = data.error;
          // Token-related errors → try next candidate. Other errors → stop.
          const code = data.error.code;
          if (code === 190 || code === 102 || code === 104 || code === 200) continue;
          // Permission denied for this token → try next
          if (String(data.error.message || '').toLowerCase().includes('permission')) continue;
          break;
        }
        productSetsData = data;
        usedProfile = cand.name;
        console.log(`[sync-product-sets] Success using profile "${cand.name}"`);
        break;
      } catch (err: any) {
        lastError = { message: err?.message || String(err) };
        continue;
      }
    }

    if (!productSetsData) {
      console.error('[sync-product-sets] All candidate tokens failed. Last error:', lastError);
      return new Response(
        JSON.stringify({
          error: lastError?.message || 'Failed to fetch product sets from any available profile.',
          hint: 'Verifique se algum perfil ativo do usuário tem acesso a este catálogo no Facebook Business Manager.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
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
