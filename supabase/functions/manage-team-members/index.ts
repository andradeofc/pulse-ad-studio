import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Auth: get calling user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is a collaborator (collaborators cannot manage team)
    const { data: teamCheck } = await adminClient
      .from('team_members')
      .select('id')
      .eq('member_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (teamCheck) {
      return new Response(JSON.stringify({ error: 'Colaboradores não podem gerenciar a equipe' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is Enterprise plan
    const { data: profile } = await adminClient
      .from('user_profiles')
      .select('plan')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.plan !== 'enterprise') {
      return new Response(JSON.stringify({ error: 'Recurso disponível apenas para o plano Enterprise' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, email, member_id } = await req.json();

    // === LIST ===
    if (action === 'list') {
      const { data: members, error } = await adminClient
        .from('team_members')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Enrich with user profile names
      const enriched = [];
      for (const m of members || []) {
        const { data: memberProfile } = await adminClient
          .from('user_profiles')
          .select('full_name')
          .eq('user_id', m.member_id)
          .maybeSingle();

        enriched.push({
          ...m,
          full_name: memberProfile?.full_name || m.email.split('@')[0],
        });
      }

      return new Response(JSON.stringify({ members: enriched }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === INVITE ===
    if (action === 'invite') {
      if (!email) {
        return new Response(JSON.stringify({ error: 'Email é obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check limit (max 3 active collaborators)
      const { count } = await adminClient
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', user.id)
        .eq('status', 'active');

      if ((count || 0) >= 3) {
        return new Response(JSON.stringify({ error: 'Limite de 3 colaboradores atingido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if email already exists as team member
      const { data: existing } = await adminClient
        .from('team_members')
        .select('id, status')
        .eq('owner_id', user.id)
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (existing && existing.status === 'active') {
        return new Response(JSON.stringify({ error: 'Este email já é um colaborador ativo' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if email is already used by any auth user
      const { data: existingUsers } = await adminClient.auth.admin.listUsers();
      const emailInUse = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

      let memberId: string;

      if (emailInUse) {
        // Check if this user is already a collaborator of someone else
        const { data: otherTeam } = await adminClient
          .from('team_members')
          .select('id')
          .eq('member_id', emailInUse.id)
          .eq('status', 'active')
          .maybeSingle();

        if (otherTeam) {
          return new Response(JSON.stringify({ error: 'Este email já é colaborador de outra conta' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        memberId = emailInUse.id;
      } else {
        // Create new user account with default password
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email: email.toLowerCase(),
          password: 'adstormenterprise',
          email_confirm: true,
          user_metadata: { name: email.split('@')[0] },
        });

        if (createError || !newUser?.user) {
          console.error('Error creating collaborator user:', createError);
          return new Response(JSON.stringify({ error: 'Erro ao criar conta do colaborador: ' + (createError?.message || 'desconhecido') }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        memberId = newUser.user.id;

        // Create user_profile for collaborator
        const { error: profileError } = await adminClient
          .from('user_profiles')
          .insert({
            user_id: memberId,
            full_name: email.split('@')[0],
            status: 'active',
            plan: 'collaborator',
          });

        if (profileError) {
          console.error('Error creating collaborator profile:', profileError);
        }
      }

      // Re-activate if previously removed, or insert new
      if (existing && existing.status === 'removed') {
        const { error: updateError } = await adminClient
          .from('team_members')
          .update({ status: 'active', member_id: memberId, invited_at: new Date().toISOString() })
          .eq('id', existing.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await adminClient
          .from('team_members')
          .insert({
            owner_id: user.id,
            member_id: memberId,
            email: email.toLowerCase(),
            status: 'active',
          });

        if (insertError) throw insertError;
      }

      return new Response(JSON.stringify({ success: true, message: 'Colaborador adicionado com sucesso' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === REMOVE ===
    if (action === 'remove') {
      if (!member_id) {
        return new Response(JSON.stringify({ error: 'member_id é obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: removeError } = await adminClient
        .from('team_members')
        .update({ status: 'removed' })
        .eq('id', member_id)
        .eq('owner_id', user.id);

      if (removeError) throw removeError;

      return new Response(JSON.stringify({ success: true, message: 'Colaborador removido' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in manage-team-members:', error);
    return new Response(JSON.stringify({ error: error.message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
