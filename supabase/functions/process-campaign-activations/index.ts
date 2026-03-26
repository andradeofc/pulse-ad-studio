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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Find pending schedules where scheduled_at <= now
    const { data: pendingSchedules, error: fetchError } = await supabase
      .from('campaign_activation_schedules')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20)

    if (fetchError) {
      console.error('Error fetching schedules:', fetchError)
      throw fetchError
    }

    if (!pendingSchedules || pendingSchedules.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No pending activations' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Found ${pendingSchedules.length} pending activations`)
    let processed = 0
    let errors = 0

    for (const schedule of pendingSchedules) {
      try {
        // Mark as processing
        await supabase
          .from('campaign_activation_schedules')
          .update({ status: 'processing', updated_at: new Date().toISOString() })
          .eq('id', schedule.id)

        // Get access token
        const { data: creds } = await supabase
          .from('facebook_credentials')
          .select('access_token')
          .eq('profile_id', schedule.profile_id)
          .single()

        let accessToken = creds?.access_token
        if (!accessToken) {
          const { data: fp } = await supabase
            .from('facebook_profiles')
            .select('access_token')
            .eq('id', schedule.profile_id)
            .single()
          accessToken = fp?.access_token
        }

        if (!accessToken) {
          throw new Error('Token de acesso não encontrado para o perfil')
        }

        // Activate the campaign via Facebook API
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${schedule.campaign_id}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'ACTIVE',
              access_token: accessToken,
            }),
          }
        )
        const data = await res.json()

        if (data.error) {
          throw new Error(data.error.message || 'Facebook API error')
        }

        // Mark as completed
        await supabase
          .from('campaign_activation_schedules')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', schedule.id)

        console.log(`Activated campaign ${schedule.campaign_id} (${schedule.campaign_name})`)
        processed++
      } catch (err) {
        console.error(`Error activating campaign ${schedule.campaign_id}:`, err)
        await supabase
          .from('campaign_activation_schedules')
          .update({
            status: 'failed',
            error_message: (err as Error).message || 'Unknown error',
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', schedule.id)
        errors++
      }
    }

    return new Response(JSON.stringify({ processed, errors, total: pendingSchedules.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
