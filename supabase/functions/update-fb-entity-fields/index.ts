// Bulk-edit a Facebook Campaign / Adset / Ad with arbitrary fields.
// Body: { items: [{ accountId, entityId }], level, fields: Record<string,string> }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const FB_VERSION = 'v23.0'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const svc = createClient(SUPABASE_URL, SERVICE)
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    const { items, level, fields } = await req.json()
    if (!Array.isArray(items) || items.length === 0 || !['campaign', 'adset', 'ad'].includes(level) || !fields || typeof fields !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Resolve tokens per account once
    const accountIds = Array.from(new Set(items.map((i: any) => i.accountId)))
    const { data: accs } = await svc
      .from('facebook_ad_accounts')
      .select('id, facebook_profiles!inner(access_token)')
      .in('id', accountIds)
    const tokenMap = new Map<string, string>()
    for (const a of accs || []) {
      const tk = (a as any)?.facebook_profiles?.access_token
      if (tk) tokenMap.set((a as any).id, tk)
    }

    const results: any[] = []
    for (const it of items) {
      const token = tokenMap.get(it.accountId)
      if (!token) { results.push({ entityId: it.entityId, ok: false, error: 'No token' }); continue }
      const form = new URLSearchParams({ access_token: token })
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined || v === null || v === '') continue
        form.set(k, String(v))
      }
      try {
        const r = await fetch(`https://graph.facebook.com/${FB_VERSION}/${it.entityId}`, { method: 'POST', body: form })
        const j = await r.json()
        if (j?.error) results.push({ entityId: it.entityId, ok: false, error: j.error.message })
        else results.push({ entityId: it.entityId, ok: true })
      } catch (e: any) {
        results.push({ entityId: it.entityId, ok: false, error: e?.message || 'Network error' })
      }
    }

    const ok = results.filter((r) => r.ok).length
    const fail = results.length - ok
    return new Response(JSON.stringify({ ok, fail, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
