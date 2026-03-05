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

    const { target_user_id, date_from, date_to } = await req.json()

    if (!target_user_id || !date_from || !date_to) {
      return new Response(JSON.stringify({ error: 'target_user_id, date_from, date_to required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Fetching spend for user ${target_user_id} from ${date_from} to ${date_to}`)

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

    // 3. Check which data we already have cached
    const accountIds = adAccounts.map(a => a.account_id)
    const { data: cachedData } = await adminClient
      .from('ad_account_daily_spend')
      .select('ad_account_id, date, spend, currency')
      .in('ad_account_id', accountIds)
      .gte('date', date_from)
      .lte('date', date_to)

    // Determine today's date (UTC) — never use cache for today
    const todayStr = new Date().toISOString().split('T')[0]

    // Build a set of cached (account_id, date) combos, excluding today
    const cachedSet = new Set(
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

    // Find which accounts need fetching (any date missing or today included)
    const accountsToFetch: typeof adAccounts = []
    for (const account of adAccounts) {
      const hasMissingDates = allDates.some(date => !cachedSet.has(`${account.account_id}__${date}`))
      if (hasMissingDates) {
        accountsToFetch.push(account)
      }
    }

    console.log(`${accountsToFetch.length} accounts need fresh data from Facebook`)

    // 4. Fetch from Facebook API for accounts that need it
    if (accountsToFetch.length > 0) {
      // Group accounts by profile to use correct token
      const accountsByProfile = new Map<string, typeof adAccounts>()
      for (const account of accountsToFetch) {
        const existing = accountsByProfile.get(account.profile_id) || []
        existing.push(account)
        accountsByProfile.set(account.profile_id, existing)
      }

      for (const [profileId, accounts] of accountsByProfile) {
        // Get access token securely
        const { data: credentials } = await adminClient
          .from('facebook_credentials')
          .select('access_token')
          .eq('profile_id', profileId)
          .single()

        let accessToken: string | null = credentials?.access_token || null

        if (!accessToken) {
          // Fallback to facebook_profiles
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

        // Fetch insights for each account - 1 request per account covers full range
        for (const account of accounts) {
          try {
            const url = `${FACEBOOK_GRAPH_API}/act_${account.account_id}/insights?fields=spend&time_range={"since":"${date_from}","until":"${date_to}"}&time_increment=1&access_token=${accessToken}`

            console.log(`Fetching insights for account ${account.account_id} (${account.name})`)
            const response = await fetch(url)

            if (!response.ok) {
              const errorData = await response.json()
              console.error(`API error for ${account.account_id}:`, errorData.error?.message || 'Unknown')
              // Continue with other accounts
              continue
            }

            const insightsData = await response.json()
            const insights = insightsData.data || []

            // Prepare upsert data
            const spendRows = insights.map((insight: any) => ({
              user_id: target_user_id,
              ad_account_id: account.account_id,
              account_name: account.name,
              currency: account.currency,
              date: insight.date_start,
              spend: parseFloat(insight.spend || '0'),
              fetched_at: new Date().toISOString(),
            }))

            // Also insert zero-spend rows for dates not returned by API
            const returnedDates = new Set(insights.map((i: any) => i.date_start))
            for (const date of allDates) {
              if (!returnedDates.has(date) && !cachedSet.has(`${account.account_id}__${date}`)) {
                spendRows.push({
                  user_id: target_user_id,
                  ad_account_id: account.account_id,
                  account_name: account.name,
                  currency: account.currency,
                  date,
                  spend: 0,
                  fetched_at: new Date().toISOString(),
                })
              }
            }

            if (spendRows.length > 0) {
              const { error: upsertError } = await adminClient
                .from('ad_account_daily_spend')
                .upsert(spendRows, { onConflict: 'ad_account_id,date' })

              if (upsertError) {
                console.error(`Upsert error for ${account.account_id}:`, upsertError)
              } else {
                console.log(`Cached ${spendRows.length} days for ${account.account_id}`)
              }
            }

            // Small delay between accounts to respect rate limits
            await sleep(200)
          } catch (err) {
            console.error(`Error fetching account ${account.account_id}:`, err)
          }
        }
      }
    }

    // 5. Return all data from cache (now updated)
    const { data: finalData, error: finalError } = await adminClient
      .from('ad_account_daily_spend')
      .select('*')
      .in('ad_account_id', accountIds)
      .gte('date', date_from)
      .lte('date', date_to)
      .order('date', { ascending: true })

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
