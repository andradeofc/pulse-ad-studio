import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function fetchWithRetry(url: string, maxAttempts = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url)
      const json = await res.json()
      if (json.error?.code === 4 || res.status === 429) {
        const waitMs = Math.min(15000, 1000 * 2 ** (attempt - 1))
        console.log(`Rate limit, waiting ${waitMs}ms (attempt ${attempt})`)
        await sleep(waitMs)
        continue
      }
      return json
    } catch (e) {
      if (attempt === maxAttempts) throw e
      await sleep(1000 * attempt)
    }
  }
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
      return new Response(JSON.stringify({ error: 'Feature not enabled for this account' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { ad_account_id, profile_id, date_from, date_to } = await req.json()

    if (!ad_account_id || !profile_id || !date_from || !date_to) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
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
      return new Response(JSON.stringify({ error: 'No access token found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch campaigns with spend insights
    const campaigns: any[] = []
    let url = `https://graph.facebook.com/v21.0/act_${ad_account_id}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time&filtering=[{"field":"spend","operator":"GREATER_THAN","value":"0"}]&time_range={"since":"${date_from}","until":"${date_to}"}&limit=100&access_token=${accessToken}`

    // Fetch campaigns list
    const campaignsData = await fetchWithRetry(url)
    if (campaignsData.error) {
      console.error('Error fetching campaigns:', campaignsData.error)
      return new Response(JSON.stringify({ error: campaignsData.error.message || 'Facebook API error' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rawCampaigns = campaignsData.data || []

    // Fetch insights for these campaigns in batches
    for (let i = 0; i < rawCampaigns.length; i += 20) {
      const batch = rawCampaigns.slice(i, i + 20)
      const insightPromises = batch.map(async (camp: any) => {
        const insightUrl = `https://graph.facebook.com/v21.0/${camp.id}/insights?fields=spend,actions&time_range={"since":"${date_from}","until":"${date_to}"}&access_token=${accessToken}`
        const insightData = await fetchWithRetry(insightUrl)
        let spend = 0
        let purchases = 0
        if (insightData.data && insightData.data[0]) {
          spend = parseFloat(insightData.data[0].spend || '0')
          const purchaseAction = (insightData.data[0].actions || []).find(
            (a: any) => a.action_type === 'purchase' || a.action_type === 'omni_purchase'
          )
          purchases = purchaseAction ? parseInt(purchaseAction.value || '0') : 0
        }
        return {
          campaign_id: camp.id,
          name: camp.name,
          status: camp.status,
          objective: camp.objective,
          daily_budget: camp.daily_budget ? parseFloat(camp.daily_budget) / 100 : null,
          lifetime_budget: camp.lifetime_budget ? parseFloat(camp.lifetime_budget) / 100 : null,
          spend,
          purchases,
        }
      })
      const results = await Promise.all(insightPromises)
      campaigns.push(...results)
      if (i + 20 < rawCampaigns.length) await sleep(200)
    }

    // Handle pagination
    let paging = campaignsData.paging
    while (paging?.next) {
      const nextData = await fetchWithRetry(paging.next)
      if (nextData.data) {
        for (const camp of nextData.data) {
          const insightUrl = `https://graph.facebook.com/v21.0/${camp.id}/insights?fields=spend,actions&time_range={"since":"${date_from}","until":"${date_to}"}&access_token=${accessToken}`
          const insightData = await fetchWithRetry(insightUrl)
          let spend = 0, purchases = 0
          if (insightData.data?.[0]) {
            spend = parseFloat(insightData.data[0].spend || '0')
            const pa = (insightData.data[0].actions || []).find((a: any) => a.action_type === 'purchase' || a.action_type === 'omni_purchase')
            purchases = pa ? parseInt(pa.value || '0') : 0
          }
          campaigns.push({
            campaign_id: camp.id,
            name: camp.name,
            status: camp.status,
            objective: camp.objective,
            daily_budget: camp.daily_budget ? parseFloat(camp.daily_budget) / 100 : null,
            lifetime_budget: camp.lifetime_budget ? parseFloat(camp.lifetime_budget) / 100 : null,
            spend,
            purchases,
          })
        }
      }
      paging = nextData.paging
      await sleep(200)
    }

    return new Response(JSON.stringify({ campaigns }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
