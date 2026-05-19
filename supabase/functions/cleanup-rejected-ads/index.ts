import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const FB_API = 'https://graph.facebook.com/v23.0'

async function fetchWithRetry(url: string, init?: RequestInit, maxAttempts = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init)
      const json = await res.json()
      if (json.error?.code === 4 || json.error?.code === 17 || json.error?.code === 32 || res.status === 429) {
        const wait = Math.min(20000, 1500 * 2 ** (attempt - 1))
        console.log(`Rate limit, waiting ${wait}ms`)
        await sleep(wait)
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
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { action, ad_account_id, profile_id, statuses, ad_ids, operation } = body

    if (!action || !ad_account_id || !profile_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get access token
    const service = createClient(supabaseUrl, serviceKey)
    const { data: creds } = await service
      .from('facebook_credentials')
      .select('access_token')
      .eq('profile_id', profile_id)
      .maybeSingle()
    let token = creds?.access_token
    if (!token) {
      const { data: fp } = await service
        .from('facebook_profiles')
        .select('access_token')
        .eq('id', profile_id)
        .maybeSingle()
      token = fp?.access_token
    }
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token de acesso não encontrado para o perfil' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accountId = String(ad_account_id).replace(/^act_/, '')

    // === SCAN ===
    if (action === 'scan') {
      const validStatuses = (statuses && statuses.length ? statuses : ['DISAPPROVED', 'WITH_ISSUES'])
        .filter((s: string) => ['DISAPPROVED', 'WITH_ISSUES', 'PENDING_REVIEW', 'PREAPPROVED'].includes(s))

      const filtering = encodeURIComponent(JSON.stringify([
        { field: 'effective_status', operator: 'IN', value: validStatuses },
      ]))
      const fields = 'id,name,effective_status,status,adset_id,campaign{id,name},adset{id,name},updated_time'
      let url = `${FB_API}/act_${accountId}/ads?fields=${fields}&filtering=${filtering}&limit=200&access_token=${token}`

      const ads: any[] = []
      let pages = 0
      while (url && pages < 25) {
        const data = await fetchWithRetry(url)
        if (data.error) {
          return new Response(JSON.stringify({ error: data.error.message || 'Erro Facebook API', code: data.error.code }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        for (const ad of (data.data || [])) {
          ads.push({
            id: ad.id,
            name: ad.name,
            effective_status: ad.effective_status,
            status: ad.status,
            campaign_id: ad.campaign?.id,
            campaign_name: ad.campaign?.name,
            adset_id: ad.adset?.id,
            adset_name: ad.adset?.name,
            updated_time: ad.updated_time,
          })
        }
        url = data.paging?.next || ''
        pages++
        if (url) await sleep(150)
      }

      return new Response(JSON.stringify({ ads, total: ads.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === EXECUTE (delete / archive) ===
    if (action === 'execute') {
      if (!Array.isArray(ad_ids) || ad_ids.length === 0) {
        return new Response(JSON.stringify({ error: 'ad_ids vazio' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const op = operation === 'archive' ? 'archive' : 'delete'

      const BATCH_SIZE = 50
      let success = 0
      let failed = 0
      const errors: any[] = []

      for (let i = 0; i < ad_ids.length; i += BATCH_SIZE) {
        const chunk = ad_ids.slice(i, i + BATCH_SIZE)
        const batch = chunk.map((id: string) => {
          if (op === 'delete') {
            return { method: 'DELETE', relative_url: id }
          }
          // archive
          return {
            method: 'POST',
            relative_url: id,
            body: 'status=ARCHIVED',
          }
        })

        const form = new FormData()
        form.append('access_token', token)
        form.append('batch', JSON.stringify(batch))

        const res = await fetchWithRetry(FB_API, { method: 'POST', body: form })
        if (Array.isArray(res)) {
          for (let j = 0; j < res.length; j++) {
            const r = res[j]
            const code = r?.code
            if (code >= 200 && code < 300) {
              success++
            } else {
              failed++
              try {
                const parsed = JSON.parse(r?.body || '{}')
                errors.push({ ad_id: chunk[j], code, error: parsed.error?.message || r?.body })
              } catch {
                errors.push({ ad_id: chunk[j], code, error: r?.body })
              }
            }
          }
        } else if (res?.error) {
          failed += chunk.length
          errors.push({ batch_error: res.error.message })
        }

        // Throttle between batches
        if (i + BATCH_SIZE < ad_ids.length) await sleep(800)
      }

      return new Response(JSON.stringify({ success, failed, errors: errors.slice(0, 50), operation: op }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('cleanup-rejected-ads error:', e)
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
