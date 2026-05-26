// Fetch FB campaigns/adsets/ads for the Gerenciador de Campanhas dashboard.
// In-memory cache (2 minutes) keyed by user + filters to avoid hammering Graph API.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FB_VERSION = 'v23.0'
const CACHE_TTL_MS = 2 * 60 * 1000
const cache = new Map<string, { ts: number; data: any }>()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fbFetch(url: string, attempts = 3): Promise<any> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(url)
      const j = await r.json()
      if (j?.error?.code === 4 || j?.error?.code === 17 || j?.error?.code === 32 || r.status === 429) {
        await sleep(Math.min(8000, 800 * 2 ** (i - 1)))
        continue
      }
      return j
    } catch (e) {
      if (i === attempts) throw e
      await sleep(500 * i)
    }
  }
}

function buildInsightsMap(rows: any[]): Map<string, any> {
  const m = new Map()
  for (const row of rows || []) {
    if (!row?.id) continue
    const actions = row.actions || []
    const find = (t: string) => {
      const a = actions.find((x: any) => x.action_type === t)
      return a ? parseFloat(a.value) : 0
    }
    const purchases = find('purchase') + find('omni_purchase')
    const linkClicks = find('link_click')
    m.set(row.id, {
      spend: parseFloat(row.spend || '0'),
      reach: parseInt(row.reach || '0'),
      impressions: parseInt(row.impressions || '0'),
      clicks: parseInt(row.clicks || '0'),
      link_clicks: linkClicks,
      ctr: parseFloat(row.ctr || '0'),
      cpc: parseFloat(row.cpc || '0'),
      frequency: parseFloat(row.frequency || '0'),
      purchases,
    })
  }
  return m
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const svc = createClient(SUPABASE_URL, SERVICE)

    const { data: { user }, error: uErr } = await userClient.auth.getUser()
    if (uErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const accountIds: string[] = body.accountIds || []
    const level: 'campaign' | 'adset' | 'ad' = body.level || 'campaign'
    const dateFrom: string | null = body.dateFrom || null
    const dateTo: string | null = body.dateTo || null
    const statuses: string[] = body.statuses || []
    const forceRefresh = !!body.forceRefresh

    if (!accountIds.length) {
      return new Response(JSON.stringify({ rows: [], cached: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cacheKey = JSON.stringify({ u: user.id, a: [...accountIds].sort(), level, dateFrom, dateTo, s: [...statuses].sort() })
    if (!forceRefresh) {
      const hit = cache.get(cacheKey)
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
        return new Response(JSON.stringify({ ...hit.data, cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Load ad accounts with tokens
    const { data: accounts, error: accErr } = await svc
      .from('facebook_ad_accounts')
      .select('id, account_id, name, currency, timezone_name, profile_id, facebook_profiles!inner(id, access_token, user_id)')
      .in('id', accountIds)

    if (accErr) throw accErr

    // RLS check: only allow accounts owned by the user (or via team)
    const allowedAccounts = (accounts || []).filter((a: any) => a.facebook_profiles?.user_id)

    const timeRange = dateFrom && dateTo ? `&time_range=${encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }))}` : ''

    const allRows: any[] = []

    for (const acc of allowedAccounts) {
      const token = (acc as any).facebook_profiles?.access_token
      if (!token) continue
      const actId = String(acc.account_id).replace(/^act_/, '')

      // Fetch nodes
      const fields = level === 'campaign'
        ? 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time'
        : level === 'adset'
        ? 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,start_time,end_time,billing_event,optimization_goal,bid_strategy,created_time,updated_time'
        : 'id,name,status,effective_status,campaign_id,adset_id,creative{id,name,thumbnail_url},created_time,updated_time'

      const nodePath = level === 'campaign' ? 'campaigns' : level === 'adset' ? 'adsets' : 'ads'
      let nodeUrl: string | null = `https://graph.facebook.com/${FB_VERSION}/act_${actId}/${nodePath}?fields=${fields}&limit=200&access_token=${token}`

      const nodes: any[] = []
      while (nodeUrl) {
        const j: any = await fbFetch(nodeUrl)
        if (j?.error) {
          console.warn('FB error', actId, j.error)
          break
        }
        if (j?.data) nodes.push(...j.data)
        nodeUrl = j?.paging?.next || null
      }

      if (!nodes.length) continue

      // Insights via account-level query, filtered by level
      const insightFields = 'spend,reach,impressions,clicks,ctr,cpc,frequency,actions'
      let insightUrl: string | null = `https://graph.facebook.com/${FB_VERSION}/act_${actId}/insights?level=${level}&fields=${insightFields}&limit=500${timeRange}&access_token=${token}`
      const insightRows: any[] = []
      while (insightUrl) {
        const j: any = await fbFetch(insightUrl)
        if (j?.error) {
          console.warn('FB insights error', actId, j.error)
          break
        }
        if (j?.data) insightRows.push(...j.data.map((r: any) => ({ ...r, id: r.campaign_id || r.adset_id || r.ad_id || r.id })))
        insightUrl = j?.paging?.next || null
      }
      // Map by id
      const insightMap = new Map<string, any>()
      for (const r of insightRows) {
        const id = r.campaign_id || r.adset_id || r.ad_id
        if (!id) continue
        const actions = r.actions || []
        const find = (t: string) => {
          const a = actions.find((x: any) => x.action_type === t)
          return a ? parseFloat(a.value) : 0
        }
        insightMap.set(id, {
          spend: parseFloat(r.spend || '0'),
          reach: parseInt(r.reach || '0'),
          impressions: parseInt(r.impressions || '0'),
          clicks: parseInt(r.clicks || '0'),
          link_clicks: find('link_click'),
          ctr: parseFloat(r.ctr || '0'),
          cpc: parseFloat(r.cpc || '0'),
          frequency: parseFloat(r.frequency || '0'),
          purchases: find('purchase') + find('omni_purchase'),
        })
      }

      for (const n of nodes) {
        const ins = insightMap.get(n.id) || {}
        allRows.push({
          id: n.id,
          name: n.name,
          status: n.status,
          effective_status: n.effective_status,
          objective: n.objective || null,
          campaign_id: n.campaign_id || null,
          adset_id: n.adset_id || null,
          daily_budget: n.daily_budget ? parseFloat(n.daily_budget) / 100 : null,
          lifetime_budget: n.lifetime_budget ? parseFloat(n.lifetime_budget) / 100 : null,
          start_time: n.start_time || null,
          stop_time: n.stop_time || n.end_time || null,
          created_time: n.created_time || null,
          updated_time: n.updated_time || null,
          creative: n.creative || null,
          account: { id: acc.id, account_id: actId, name: acc.name, currency: acc.currency },
          insights: ins,
        })
      }
    }

    // Status filter
    const filtered = statuses.length
      ? allRows.filter((r) => statuses.includes(r.effective_status) || statuses.includes(r.status))
      : allRows

    const payload = { rows: filtered, fetchedAt: new Date().toISOString() }
    cache.set(cacheKey, { ts: Date.now(), data: payload })

    return new Response(JSON.stringify({ ...payload, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('fetch-fb-campaign-manager error', e)
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
