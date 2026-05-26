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

// Helpers to extract values from FB actions / action_values arrays
function sumActions(arr: any[] | undefined, types: string[]): number {
  if (!arr?.length) return 0
  let total = 0
  for (const a of arr) {
    if (types.includes(a.action_type)) total += parseFloat(a.value || '0') || 0
  }
  return total
}
// For metrics that have both `purchase` and `omni_purchase`, FB recommends preferring omni_* when present.
function preferOmni(arr: any[] | undefined, base: string): number {
  if (!arr?.length) return 0
  const omni = arr.find((a) => a.action_type === `omni_${base}`)
  if (omni) return parseFloat(omni.value || '0') || 0
  const plain = arr.find((a) => a.action_type === base)
  return plain ? parseFloat(plain.value || '0') || 0 : 0
}

function buildInsights(r: any) {
  const actions = r.actions || []
  const actionValues = r.action_values || []
  const costPerAction = r.cost_per_action_type || []
  const outboundClicksArr = r.outbound_clicks || []
  const costPerOutbound = r.cost_per_outbound_click || []
  const purchaseRoas = r.purchase_roas || []
  const websitePurchaseRoas = r.website_purchase_roas || []

  const spend = parseFloat(r.spend || '0') || 0
  const purchases = preferOmni(actions, 'purchase')
  const purchaseValue = preferOmni(actionValues, 'purchase')

  const outboundClicks = outboundClicksArr.reduce(
    (s: number, x: any) => s + (parseFloat(x.value || '0') || 0),
    0,
  )
  const costPerOutboundClick = costPerOutbound[0]
    ? parseFloat(costPerOutbound[0].value || '0') || 0
    : 0

  const roas = (() => {
    const arr = purchaseRoas.length ? purchaseRoas : websitePurchaseRoas
    if (!arr.length) return purchaseValue && spend ? purchaseValue / spend : 0
    return parseFloat(arr[0].value || '0') || 0
  })()

  const leads = preferOmni(actions, 'lead')
  const addToCart = preferOmni(actions, 'add_to_cart')
  const initiateCheckout = preferOmni(actions, 'initiated_checkout')
  const addPaymentInfo = preferOmni(actions, 'add_payment_info')
  const viewContent = preferOmni(actions, 'view_content')
  const pageViews =
    sumActions(actions, ['landing_page_view']) ||
    sumActions(actions, ['page_view']) ||
    0
  const linkClicks = parseFloat(r.inline_link_clicks || '0') || sumActions(actions, ['link_click'])
  const costPerLink = parseFloat(r.cost_per_inline_link_click || '0') || 0
  const uniqueClicks = parseFloat(r.unique_clicks || '0') || 0

  const cpaFor = (types: string[]) => {
    for (const cpa of costPerAction) {
      if (types.includes(cpa.action_type)) return parseFloat(cpa.value || '0') || 0
    }
    return 0
  }

  return {
    spend,
    reach: parseInt(r.reach || '0') || 0,
    impressions: parseInt(r.impressions || '0') || 0,
    clicks: parseInt(r.clicks || '0') || 0,
    ctr: parseFloat(r.ctr || '0') || 0,
    cpc: parseFloat(r.cpc || '0') || 0,
    frequency: parseFloat(r.frequency || '0') || 0,

    inline_link_clicks: linkClicks,
    cost_per_inline_link_click: costPerLink || (linkClicks ? spend / linkClicks : 0),
    unique_clicks: uniqueClicks,
    outbound_clicks: outboundClicks,
    cost_per_outbound_click: costPerOutboundClick || (outboundClicks ? spend / outboundClicks : 0),

    page_views: pageViews,
    cost_per_page_view: pageViews ? spend / pageViews : 0,
    view_content: viewContent,
    cost_per_view_content: cpaFor(['omni_view_content', 'view_content']) || (viewContent ? spend / viewContent : 0),
    add_to_cart: addToCart,
    cost_per_add_to_cart: cpaFor(['omni_add_to_cart', 'add_to_cart']) || (addToCart ? spend / addToCart : 0),
    initiate_checkout: initiateCheckout,
    cost_per_initiate_checkout:
      cpaFor(['omni_initiated_checkout', 'initiate_checkout']) ||
      (initiateCheckout ? spend / initiateCheckout : 0),
    add_payment_info: addPaymentInfo,
    cost_per_add_payment_info:
      cpaFor(['omni_add_payment_info', 'add_payment_info']) ||
      (addPaymentInfo ? spend / addPaymentInfo : 0),
    purchases,
    cost_per_purchase: cpaFor(['omni_purchase', 'purchase']) || (purchases ? spend / purchases : 0),
    purchase_value: purchaseValue,
    roas,
    leads,
    cost_per_lead: cpaFor(['omni_lead', 'lead']) || (leads ? spend / leads : 0),
  }
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

    const { data: accounts, error: accErr } = await svc
      .from('facebook_ad_accounts')
      .select('id, account_id, name, currency, timezone, profile_id, facebook_profiles!inner(id, access_token, user_id)')
      .in('id', accountIds)

    if (accErr) throw accErr
    const allowedAccounts = (accounts || []).filter((a: any) => a.facebook_profiles?.user_id)

    const timeRange = dateFrom && dateTo ? `&time_range=${encodeURIComponent(JSON.stringify({ since: dateFrom, until: dateTo }))}` : ''

    const insightFields = [
      'spend','reach','impressions','clicks','ctr','cpc','frequency',
      'inline_link_clicks','cost_per_inline_link_click','unique_clicks',
      'outbound_clicks','cost_per_outbound_click',
      'actions','action_values','cost_per_action_type',
      'purchase_roas','website_purchase_roas',
    ].join(',')

    async function paginate(initialUrl: string): Promise<any[]> {
      const out: any[] = []
      let url: string | null = initialUrl
      while (url) {
        const j: any = await fbFetch(url)
        if (j?.error) { console.warn('FB paginate error', j.error); break }
        if (j?.data) out.push(...j.data)
        url = j?.paging?.next || null
      }
      return out
    }

    // Fetch all accounts in parallel; within each account fetch nodes, insights,
    // and adset-budget probe (campaign level only) in parallel as well.
    // IMPORTANT: filter by effective_status at the Graph API level. Without this,
    // old accounts return thousands of DELETED/ARCHIVED entities which is the main
    // cause of 30-40s loads. Default excludes DELETED + ARCHIVED.
    const ALL_VISIBLE_STATUSES = [
      'ACTIVE','PAUSED','PENDING_REVIEW','DISAPPROVED','PREAPPROVED',
      'PENDING_BILLING_INFO','CAMPAIGN_PAUSED','ADSET_PAUSED','IN_PROCESS','WITH_ISSUES',
    ]
    const wantedStatuses = statuses.length ? statuses : ALL_VISIBLE_STATUSES
    const filteringParam = `&filtering=${encodeURIComponent(JSON.stringify([
      { field: 'effective_status', operator: 'IN', value: wantedStatuses },
    ]))}`

    const perAccount = await Promise.all(allowedAccounts.map(async (acc: any) => {
      const token = acc.facebook_profiles?.access_token
      if (!token) return [] as any[]
      const actId = String(acc.account_id).replace(/^act_/, '')

      const fields = level === 'campaign'
        ? 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,created_time,updated_time'
        : level === 'adset'
        ? 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,start_time,end_time,billing_event,optimization_goal,bid_strategy,created_time,updated_time'
        : 'id,name,status,effective_status,campaign_id,adset_id,creative{id,name,thumbnail_url},created_time,updated_time'

      const nodePath = level === 'campaign' ? 'campaigns' : level === 'adset' ? 'adsets' : 'ads'

      const nodesP = paginate(`https://graph.facebook.com/${FB_VERSION}/act_${actId}/${nodePath}?fields=${fields}&limit=500${filteringParam}&access_token=${token}`)
      const insightsP = paginate(`https://graph.facebook.com/${FB_VERSION}/act_${actId}/insights?level=${level}&fields=${insightFields}&limit=500${timeRange}${filteringParam}&access_token=${token}`)
      const adsetBudgetP = level === 'campaign'
        ? paginate(`https://graph.facebook.com/${FB_VERSION}/act_${actId}/adsets?fields=campaign_id,daily_budget,lifetime_budget&limit=500${filteringParam}&access_token=${token}`)
        : Promise.resolve([] as any[])

      const [nodes, insightRaw, adsetBudgetRows] = await Promise.all([nodesP, insightsP, adsetBudgetP])

      const insightMap = new Map<string, any>()
      for (const r of insightRaw) {
        const id = r.campaign_id || r.adset_id || r.ad_id
        if (id) insightMap.set(id, buildInsights(r))
      }

      const adsetBudgetCampaigns = new Set<string>()
      for (const a of adsetBudgetRows) {
        if ((a.daily_budget && a.daily_budget !== '0') || (a.lifetime_budget && a.lifetime_budget !== '0')) {
          if (a.campaign_id) adsetBudgetCampaigns.add(a.campaign_id)
        }
      }

      const rows: any[] = []
      for (const n of nodes) {
        const ins = insightMap.get(n.id) || {}
        const dailyB = n.daily_budget ? parseFloat(n.daily_budget) / 100 : null
        const lifeB = n.lifetime_budget ? parseFloat(n.lifetime_budget) / 100 : null
        const budgetSource =
          level === 'campaign' && !dailyB && !lifeB && adsetBudgetCampaigns.has(n.id)
            ? 'adset'
            : 'self'

        rows.push({
          id: n.id,
          name: n.name,
          status: n.status,
          effective_status: n.effective_status,
          objective: n.objective || null,
          campaign_id: n.campaign_id || null,
          adset_id: n.adset_id || null,
          daily_budget: dailyB,
          lifetime_budget: lifeB,
          budget_source: budgetSource,
          budget_remaining: n.budget_remaining ? parseFloat(n.budget_remaining) / 100 : null,
          start_time: n.start_time || null,
          stop_time: n.stop_time || n.end_time || null,
          created_time: n.created_time || null,
          updated_time: n.updated_time || null,
          creative: n.creative || null,
          account: { id: acc.id, account_id: actId, name: acc.name, currency: acc.currency },
          insights: ins,
        })
      }
      return rows
    }))

    const allRows = perAccount.flat()


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
