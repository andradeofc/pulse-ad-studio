import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const FB_API = 'https://graph.facebook.com/v23.0'

async function fetchWithRetry(url: string, init?: RequestInit, maxAttempts = 3): Promise<any> {
  let lastJson: any = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init)
      const json = await res.json().catch(() => ({}))
      lastJson = json
      if (json?.error?.code === 4 || json?.error?.code === 17 || json?.error?.code === 32 || res.status === 429) {
        const wait = Math.min(20000, 1500 * 2 ** (attempt - 1))
        console.log(`Rate limit hit (code ${json?.error?.code}), waiting ${wait}ms`)
        await sleep(wait)
        continue
      }
      return json
    } catch (e) {
      console.error(`fetchWithRetry attempt ${attempt} failed:`, e)
      if (attempt === maxAttempts) {
        return lastJson ?? { error: { message: (e as Error).message || 'Network error', code: -1 } }
      }
      await sleep(1000 * attempt)
    }
  }
  // Exhausted retries (e.g. rate-limited every attempt)
  return lastJson ?? { error: { message: 'Rate limit exceeded after retries', code: 17 } }
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
        if (!data || data.error) {
          const errMsg = data?.error?.message || 'Erro ao consultar Facebook API'
          const errCode = data?.error?.code
          // Rate limit → return 200 with friendly message so UI doesn't crash
          if (errCode === 4 || errCode === 17 || errCode === 32 || errCode === 613) {
            return new Response(JSON.stringify({
              error: `Limite de requisições do Facebook atingido para esta conta. Aguarde 1-2 minutos e tente novamente. (code ${errCode})`,
              code: errCode,
              rate_limited: true,
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
          }
          return new Response(JSON.stringify({ error: errMsg, code: errCode }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        for (const ad of (data.data || [])) {
          if (['DELETED', 'ARCHIVED'].includes(String(ad.status || '').toUpperCase())) {
            continue
          }
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
      const facebookResponses: any[] = []
      const verificationDetails: any[] = []

      // Helper: run a batch with a specific HTTP method strategy
      // strategy 'post' -> POST status=<targetStatus>
      // strategy 'delete' -> HTTP DELETE
      async function runBatch(ids: string[], strategy: 'post' | 'delete', targetStatus: 'ARCHIVED' | 'DELETED' = 'DELETED') {
        const batch = ids.map((id: string) => {
          if (strategy === 'delete') {
            return { method: 'DELETE', relative_url: id }
          }
          return {
            method: 'POST',
            relative_url: id,
            body: `status=${targetStatus}`,
          }
        })

        const form = new FormData()
        form.append('access_token', token)
        form.append('batch', JSON.stringify(batch))

        const res = await fetchWithRetry(FB_API, { method: 'POST', body: form })
        const okIds: string[] = []
        const methodFailIds: string[] = []
        const realErrors: any[] = []

        if (Array.isArray(res)) {
          for (let j = 0; j < res.length; j++) {
            const r = res[j]
            const code = r?.code
            const rawBody = r?.body || ''
            let parsedBody: any = null
            try { parsedBody = JSON.parse(rawBody) } catch { /* ignore */ }
            const fbErrMsg = parsedBody?.error?.message || ''
            const fbErrCode = parsedBody?.error?.code
            const fbErrSub = parsedBody?.error?.error_subcode

            facebookResponses.push({
              ad_id: ids[j],
              strategy,
              target_status: strategy === 'post' ? targetStatus : 'HTTP_DELETE',
              http_code: code,
              body: parsedBody ?? rawBody,
            })

            if (code >= 200 && code < 300) {
              okIds.push(ids[j])
              continue
            }

            const isBadMethod =
              code === 405 ||
              /no path defined with the given http verb|bad method|method not allowed|unsupported (post|delete) request/i
                .test(fbErrMsg + ' ' + rawBody)
            if (isBadMethod) {
              methodFailIds.push(ids[j])
              continue
            }

            const isGone =
              code === 404 ||
              fbErrCode === 100 || fbErrSub === 33 ||
              /does not exist|cannot be loaded/i.test(fbErrMsg)
            if (isGone) {
              okIds.push(ids[j])
              continue
            }

            realErrors.push({ ad_id: ids[j], code, error: fbErrMsg || rawBody || `HTTP ${code}` })
          }
        } else if (res?.error) {
          facebookResponses.push({ strategy, target_status: strategy === 'post' ? targetStatus : 'HTTP_DELETE', batch_error: res.error })
          realErrors.push({ batch_error: res.error.message })
          for (const id of ids) methodFailIds.push(id)
        }

        return { okIds, methodFailIds, realErrors }
      }

      async function verifyAdStatuses(ids: string[], expectedStatus: 'ARCHIVED' | 'DELETED') {
        const verifiedIds = new Set<string>()
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
          const chunk = ids.slice(i, i + BATCH_SIZE)
          const params = new URLSearchParams({
            ids: chunk.join(','),
            fields: 'id,name,status,effective_status',
            access_token: token,
          })
          const data = await fetchWithRetry(`${FB_API}/?${params.toString()}`)
          if (data?.error) {
            verificationDetails.push({ expected_status: expectedStatus, batch_ids: chunk, error: data.error })
            continue
          }

          for (const id of chunk) {
            const item = data?.[id]
            const itemErr = item?.error
            const itemStatus = String(item?.status || '').toUpperCase()
            const errMsg = itemErr?.message || ''
            const errCode = itemErr?.code
            const isGone =
              expectedStatus === 'DELETED' &&
              (errCode === 100 || errCode === 33 || /does not exist|cannot be loaded|unsupported get request/i.test(errMsg))

            const verified = itemStatus === expectedStatus || isGone
            if (verified) verifiedIds.add(id)
            verificationDetails.push({
              ad_id: id,
              expected_status: expectedStatus,
              status: itemStatus || null,
              effective_status: item?.effective_status || null,
              verified,
              error: itemErr || null,
            })
          }
        }
        return verifiedIds
      }

      for (let i = 0; i < ad_ids.length; i += BATCH_SIZE) {
        const chunk = ad_ids.slice(i, i + BATCH_SIZE)

        if (op === 'delete') {
          // Estratégia para DELETE com criativos quebrados (erro 2446289):
          // Facebook exige ARCHIVED antes de DELETED. Anúncios arquivados
          // pulam a validação de "criativo incompleto" que bloqueia o delete direto.
          const deletedSet = new Set<string>()

          // Passo 1: ARCHIVE em massa
          const rArch = await runBatch(chunk, 'post', 'ARCHIVED')
          const archivedIds = [...rArch.okIds]
          const failedToArchive = [
            ...rArch.methodFailIds,
            ...rArch.realErrors.map((e) => e.ad_id).filter(Boolean),
          ]

          await sleep(400)

          // Passo 2: DELETE nos arquivados
          if (archivedIds.length > 0) {
            const rDel = await runBatch(archivedIds, 'post', 'DELETED')
            for (const id of rDel.okIds) deletedSet.add(id)
            if (rDel.methodFailIds.length > 0) {
              await sleep(300)
              const rDel2 = await runBatch(rDel.methodFailIds, 'delete')
              for (const id of rDel2.okIds) deletedSet.add(id)
              for (const id of rDel2.methodFailIds) {
                errors.push({ ad_id: id, code: 405, error: 'Método HTTP não suportado após arquivar' })
              }
              for (const e of rDel2.realErrors) errors.push(e)
            }
            for (const e of rDel.realErrors) {
              if (!deletedSet.has(e.ad_id)) errors.push(e)
            }
          }

          // Passo 3: tentar delete direto nos que falharam ao arquivar
          if (failedToArchive.length > 0) {
            await sleep(300)
            const rDirect = await runBatch(failedToArchive, 'post', 'DELETED')
            for (const id of rDirect.okIds) deletedSet.add(id)
            if (rDirect.methodFailIds.length > 0) {
              await sleep(300)
              const rDirect2 = await runBatch(rDirect.methodFailIds, 'delete')
              for (const id of rDirect2.okIds) deletedSet.add(id)
              for (const id of rDirect2.methodFailIds) {
                errors.push({ ad_id: id, code: 405, error: 'Não foi possível excluir (criativo quebrado)' })
              }
              for (const e of rDirect2.realErrors) errors.push(e)
            }
            for (const e of rDirect.realErrors) {
              if (!deletedSet.has(e.ad_id)) errors.push(e)
            }
          }

          // Verifica: aceita DELETED OU ARCHIVED como sucesso final, pois
          // o Facebook não permite DELETE real em anúncios com criativo quebrado
          // (#2446289) via API. Nesse caso ARCHIVED é o estado terminal possível.
          const verifyIds = [...deletedSet]
          const verifiedDeleted = new Set<string>()
          const archivedFallback = new Set<string>()
          for (let i = 0; i < verifyIds.length; i += BATCH_SIZE) {
            const chunkV = verifyIds.slice(i, i + BATCH_SIZE)
            const params = new URLSearchParams({
              ids: chunkV.join(','),
              fields: 'id,name,status,effective_status',
              access_token: token,
            })
            const data = await fetchWithRetry(`${FB_API}/?${params.toString()}`)
            if (data?.error) {
              verificationDetails.push({ expected_status: 'DELETED', batch_ids: chunkV, error: data.error })
              continue
            }
            for (const id of chunkV) {
              const item = data?.[id]
              const itemErr = item?.error
              const itemStatus = String(item?.status || '').toUpperCase()
              const errMsg = itemErr?.message || ''
              const errCode = itemErr?.code
              const isGone = errCode === 100 || errCode === 33 ||
                /does not exist|cannot be loaded|unsupported get request/i.test(errMsg)
              let verified = false
              let note: string | null = null
              if (itemStatus === 'DELETED' || isGone) {
                verifiedDeleted.add(id); verified = true
              } else if (itemStatus === 'ARCHIVED') {
                archivedFallback.add(id); verified = true
                note = 'Facebook não permitiu DELETE (criativo quebrado #2446289). Anúncio foi ARQUIVADO — equivale a removido da listagem ativa.'
              }
              verificationDetails.push({
                ad_id: id,
                expected_status: 'DELETED',
                status: itemStatus || null,
                effective_status: item?.effective_status || null,
                verified,
                note,
                error: itemErr || null,
              })
            }
          }
          for (const id of deletedSet) {
            if (!verifiedDeleted.has(id) && !archivedFallback.has(id)) {
              errors.push({ ad_id: id, error: 'Facebook respondeu sucesso, mas o anúncio não ficou DELETED nem ARCHIVED na verificação' })
            }
          }
          const okCount = verifiedDeleted.size + archivedFallback.size
          success += okCount
          failed += chunk.length - okCount
          console.log(`[delete] chunk=${chunk.length} deleted=${verifiedDeleted.size} archivedFallback=${archivedFallback.size} failed=${chunk.length - okCount}`)
          console.log('[delete] fb_responses:', JSON.stringify(facebookResponses.slice(-chunk.length * 3)))
        } else {
          // ARCHIVE
          const r1 = await runBatch(chunk, 'post', 'ARCHIVED')
          const verifiedArchived = await verifyAdStatuses(r1.okIds, 'ARCHIVED')
          for (const id of r1.okIds) {
            if (!verifiedArchived.has(id)) {
              errors.push({ ad_id: id, error: 'Facebook respondeu sucesso, mas o anúncio não ficou ARCHIVED na verificação' })
            }
          }
          success += verifiedArchived.size
          failed += chunk.length - verifiedArchived.size
          errors.push(...r1.realErrors)
          for (const id of r1.methodFailIds) {
            errors.push({ ad_id: id, code: 405, error: 'Método HTTP não suportado' })
          }
        }

        if (i + BATCH_SIZE < ad_ids.length) await sleep(800)
      }

      return new Response(JSON.stringify({
        success,
        failed,
        errors: errors.slice(0, 50),
        operation: op,
        facebook_responses: facebookResponses.slice(0, 50),
        verification: verificationDetails.slice(0, 50),
      }), {
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
