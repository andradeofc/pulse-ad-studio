import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: isAdmin } = await callerClient.rpc('is_admin')
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: { user: adminUser } } = await callerClient.auth.getUser()
    if (!adminUser) {
      return new Response(JSON.stringify({ error: 'Admin user not found' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { target_user_id } = await req.json()
    if (!target_user_id) {
      return new Response(JSON.stringify({ error: 'target_user_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Don't allow impersonating yourself
    if (target_user_id === adminUser.id) {
      return new Response(JSON.stringify({ error: 'Cannot impersonate yourself' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Get target user info
    const { data: targetUserData, error: userError } = await adminClient.auth.admin.getUserById(target_user_id)
    if (userError || !targetUserData.user) {
      return new Response(JSON.stringify({ error: 'Target user not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate a magic link for the target user
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUserData.user.email!,
    })

    if (linkError || !linkData) {
      return new Response(JSON.stringify({ error: linkError?.message || 'Failed to generate link' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get target user profile
    const { data: targetProfile } = await adminClient
      .from('user_profiles')
      .select('full_name, plan, status')
      .eq('user_id', target_user_id)
      .maybeSingle()

    // Audit log
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown'
    await adminClient.from('admin_audit_logs').insert({
      admin_user_id: adminUser.id,
      action: 'impersonate_user',
      target_type: 'user',
      target_id: target_user_id,
      details: {
        target_email: targetUserData.user.email,
        target_name: targetProfile?.full_name,
        impersonated_by: adminUser.id,
      },
      ip_address: ipAddress,
    })

    return new Response(JSON.stringify({
      token_hash: linkData.properties?.hashed_token,
      target_user: {
        id: targetUserData.user.id,
        email: targetUserData.user.email,
        name: targetProfile?.full_name || targetUserData.user.email?.split('@')[0],
        plan: targetProfile?.plan || 'starter',
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
