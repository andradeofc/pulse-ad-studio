import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const FACEBOOK_GRAPH_API = 'https://graph.facebook.com/v19.0'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: isAdmin } = await callerClient.rpc('is_admin')
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { target_user_id, date_from, date_to, force_refresh } = await req.json()

    if (!target_user_id || !date_from || !date_to) {
      return new Response(JSON.stringify({ error: 'target_user_id, date_from, date_to required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Fetching campaign spend for user ${target_user_id} from ${date_from} to ${date_to}${force_refresh ? ' (FORCE REFRESH)' : ''}`)

    // 1. Get all facebook profiles for target user
    const { data: profiles, error: profilesError } = await adminClient
      .from('facebook_profiles')
      .select('id, name, status')
      .eq('user_id', target_user_id)
      .neq('status', 'disconnected')

    if (profilesError) throw profilesError
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ data: [], message: 'No Facebook profiles found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Get all ad accounts for these profiles
    const profileIds = profiles.map(p => p.id)
    const { data: adAccounts, error: accountsError } = await adminClient
      .from('facebook_ad_accounts')
      .select('id, account_id, name, currency, profile_id')
      .in('profile_id', profileIds)

    if (accountsError) throw accountsError
    if (!adAccounts || adAccounts.length === 0) {
      return new Response(JSON.stringify({ data: [], message: 'No ad accounts found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Found ${adAccounts.length} ad accounts across ${profiles.length} profiles`)

    const accountIds = adAccounts.map(a => a.account_id)

    // 3. Handle force refresh
    if (force_refresh) {
      console.log('Force refresh: deleting cached campaign data for selected period')
      await adminClient
        .from('campaign_daily_spend')
        .delete()
        .in('ad_account_id', accountIds)
        .gte('date', date_from)
        .lte('date', date_to)
    }

    // 4. Check cache
    const todayStr = new Date().toISOString().split('T')[0]

    const { data: cachedData } = force_refresh
      ? { data: [] }
      : await adminClient
          .from('campaign_daily_spend')
          .select('ad_account_id, date')
          .in('ad_account_id', accountIds)
          .gte('date', date_from)
          .lte('date', date_to)

    // Build set of cached account+date combos (exclude today)
    const cachedAccountDates = new Set(
      (cachedData || [])
        .filter(d => d.date !== todayStr)
        .map(d => `${d.ad_account_id}__${d.date}`)
    )

    // Generate all dates in range
    const allDates: string[] = []
    const startDate = new Date(date_from)
    const endDate = new Date(date_to)
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      allDates.push(d.toISOString().split('T')[0])
    }

    // Find accounts that need fetching
    const accountsToFetch = force_refresh
      ? [...adAccounts]
      : adAccounts.filter(account =>
          allDates.some(date => !cachedAccountDates.has(`${account.account_id}__${date}`))
        )

    console.log(`${accountsToFetch.length} accounts need fresh campaign data from Facebook`)

    // 5. Fetch from Facebook API
    if (accountsToFetch.length > 0) {
      const accountsByProfile = new Map<string, typeof adAccounts>()
      for (const account of accountsToFetch) {
        const existing = accountsByProfile.get(account.profile_id) || []
        existing.push(account)
        accountsByProfile.set(account.profile_id, existing)
      }

      for (const [profileId, accounts] of accountsByProfile) {
        // Get access token
        const { data: credentials } = await adminClient
          .from('facebook_credentials')
          .select('access_token')
          .eq('profile_id', profileId)
          .single()

        let accessToken: string | null = credentials?.access_token || null

        if (!accessToken) {
          const { data: fallbackProfile } = await adminClient
            .from('facebook_profiles')
            .select('access_token')
            .eq('id', profileId)
            .single()
          accessToken = fallbackProfile?.access_token || null
        }

        if (!accessToken) {
          console.warn(`No token for profile ${profileId}, skipping ${accounts.length} accounts`)
          continue
        }

        for (const account of accounts) {
          try {
            // Fetch campaign-level insights
            const url = `${FACEBOOK_GRAPH_API}/act_${account.account_id}/insights?fields=campaign_id,campaign_name,spend,actions&time_range={"since":"${date_from}","until":"${date_to}"}&time_increment=1&level=campaign&limit=500&access_token=${accessToken}`

            console.log(`Fetching campaign insights for account ${account.account_id} (${account.name})`)
            const response = await fetch(url)

            if (!response.ok) {
              const errorData = await response.json()
              console.error(`API error for ${account.account_id}:`, errorData.error?.message || 'Unknown')
              continue
            }

            const insightsData = await response.json()
            let allInsights = insightsData.data || []

            // Handle pagination
            let nextUrl = insightsData.paging?.next
            while (nextUrl) {
              const nextResponse = await fetch(nextUrl)
              if (!nextResponse.ok) break
              const nextData = await nextResponse.json()
              allInsights = allInsights.concat(nextData.data || [])
              nextUrl = nextData.paging?.next
              await sleep(100)
            }

            console.log(`Got ${allInsights.length} campaign-day rows for account ${account.account_id}`)

            // Extract purchases
            const getPurchaseCount = (actions: any[] | undefined): number => {
              if (!actions) return 0
              const omni = actions.find((a: any) => a.action_type === 'omni_purchase')
              if (omni) return parseInt(omni.value || '0', 10)
              const pixel = actions.find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase')
              if (pixel) return parseInt(pixel.value || '0', 10)
              return 0
            }

            // Prepare rows
            const spendRows = allInsights
              .filter((insight: any) => parseFloat(insight.spend || '0') > 0 || getPurchaseCount(insight.actions) > 0)
              .map((insight: any) => ({
                user_id: target_user_id,
                ad_account_id: account.account_id,
                account_name: account.name,
                campaign_id: insight.campaign_id,
                campaign_name: insight.campaign_name || 'Sem nome',
                currency: account.currency,
                date: insight.date_start,
                spend: parseFloat(insight.spend || '0'),
                purchases: getPurchaseCount(insight.actions),
                fetched_at: new Date().toISOString(),
              }))

            if (spendRows.length > 0) {
              // Upsert in batches of 100
              for (let i = 0; i < spendRows.length; i += 100) {
                const batch = spendRows.slice(i, i + 100)
                const { error: upsertError } = await adminClient
                  .from('campaign_daily_spend')
                  .upsert(batch, { onConflict: 'ad_account_id,campaign_id,date' })

                if (upsertError) {
                  console.error(`Upsert error for ${account.account_id}:`, upsertError)
                }
              }
              console.log(`Cached ${spendRows.length} campaign-day rows for ${account.account_id}`)
            }

            await sleep(300)
          } catch (err) {
            console.error(`Error fetching account ${account.account_id}:`, err)
          }
        }
      }
    }

    // 6. Return all cached data
    const { data: finalData, error: finalError } = await adminClient
      .from('campaign_daily_spend')
      .select('*')
      .in('ad_account_id', accountIds)
      .gte('date', date_from)
      .lte('date', date_to)
      .order('date', { ascending: true })
      .limit(5000)

    if (finalError) throw finalError

    return new Response(JSON.stringify({
      data: finalData || [],
      accounts_count: adAccounts.length,
      fetched_from_api: accountsToFetch.length,
      cached: adAccounts.length - accountsToFetch.length,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
