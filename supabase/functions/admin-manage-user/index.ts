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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

    const { data: { user: callerUser } } = await callerClient.auth.getUser()
    const adminUserId = callerUser?.id

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    const { action, target_user_id, new_password } = await req.json()
    const ipAddress = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || 'unknown'

    if (!target_user_id) {
      return new Response(JSON.stringify({ error: 'target_user_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let result: any = {}

    switch (action) {
      case 'reset_password': {
        if (!new_password || new_password.length < 6) {
          return new Response(JSON.stringify({ error: 'Password min 6 chars' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const { error } = await adminClient.auth.admin.updateUserById(target_user_id, {
          password: new_password,
        })
        if (error) throw error
        result = { success: true, message: 'Password updated' }
        break
      }

      case 'delete_user': {
        // Don't allow deleting yourself
        if (target_user_id === adminUserId) {
          return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const { error } = await adminClient.auth.admin.deleteUser(target_user_id)
        if (error) throw error
        result = { success: true, message: 'User deleted' }
        break
      }

      case 'get_user_email': {
        const { data, error } = await adminClient.auth.admin.getUserById(target_user_id)
        if (error) throw error
        result = { email: data.user?.email }
        break
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    // Audit log
    if (adminUserId) {
      await adminClient.from('admin_audit_logs').insert({
        admin_user_id: adminUserId,
        action: `admin_${action}`,
        target_type: 'user',
        target_id: target_user_id,
        details: { action },
        ip_address: ipAddress,
      })
    }

    return new Response(JSON.stringify(result), {
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
