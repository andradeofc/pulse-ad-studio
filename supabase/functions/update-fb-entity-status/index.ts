// Toggle a Facebook Campaign / Adset / Ad status (ACTIVE | PAUSED).
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

    const { accountId, entityId, level, status } = await req.json()
    if (!accountId || !entityId || !['campaign', 'adset', 'ad'].includes(level) || !['ACTIVE', 'PAUSED', 'DELETED'].includes(status)) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: acc } = await svc
      .from('facebook_ad_accounts')
      .select('id, facebook_profiles!inner(access_token, user_id)')
      .eq('id', accountId)
      .maybeSingle()

    const token = (acc as any)?.facebook_profiles?.access_token
    if (!token) return new Response(JSON.stringify({ error: 'No token' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    let r: Response
    if (status === 'DELETED') {
      const url = `https://graph.facebook.com/${FB_VERSION}/${entityId}?access_token=${encodeURIComponent(token)}`
      r = await fetch(url, { method: 'DELETE' })
    } else {
      const url = `https://graph.facebook.com/${FB_VERSION}/${entityId}`
      const form = new URLSearchParams({ status, access_token: token })
      r = await fetch(url, { method: 'POST', body: form })
    }
    const j = await r.json()
    if (j?.error) {
      return new Response(JSON.stringify({ error: j.error.message || 'FB error', fb: j.error }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
