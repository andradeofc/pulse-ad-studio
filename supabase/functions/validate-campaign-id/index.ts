import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check feature access
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('custom_limits')
      .eq('user_id', user.id)
      .single()

    if (!profile?.custom_limits || !(profile.custom_limits as any).campaign_scheduler) {
      return new Response(JSON.stringify({ error: 'Feature not enabled' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { campaign_id, profile_id } = await req.json()

    if (!campaign_id || !profile_id) {
      return new Response(JSON.stringify({ error: 'campaign_id and profile_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get access token
    const serviceClient = createClient(supabaseUrl, serviceKey)
    const { data: creds } = await serviceClient
      .from('facebook_credentials')
      .select('access_token')
      .eq('profile_id', profile_id)
      .single()

    let accessToken = creds?.access_token
    if (!accessToken) {
      const { data: fp } = await serviceClient
        .from('facebook_profiles')
        .select('access_token')
        .eq('id', profile_id)
        .single()
      accessToken = fp?.access_token
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'No access token' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch campaign from Facebook
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${campaign_id}?fields=id,name,status,objective,account_id,daily_budget,lifetime_budget&access_token=${accessToken}`
    )
    const data = await res.json()

    if (data.error) {
      return new Response(JSON.stringify({
        found: false,
        error: data.error.message || 'Campaign not found',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      found: true,
      campaign: {
        campaign_id: data.id,
        name: data.name,
        status: data.status,
        objective: data.objective,
        ad_account_id: data.account_id?.replace('act_', ''),
        daily_budget: data.daily_budget ? parseFloat(data.daily_budget) / 100 : null,
        lifetime_budget: data.lifetime_budget ? parseFloat(data.lifetime_budget) / 100 : null,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
