import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { user_id, event, catalog, product_set, products, total_affected, auto_repair, repaired, timestamp } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch user's Z-API settings
    const { data: settings, error: settingsError } = await supabase
      .from('user_zapi_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (settingsError || !settings || !settings.is_enabled) {
      console.log(`[zapi-webhook-proxy] Z-API not configured or disabled for user ${user_id}`);
      return new Response(JSON.stringify({ message: 'Z-API not configured or disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { instance_id, token, client_token, recipients } = settings;

    if (!instance_id || !token || !client_token) {
      return new Response(JSON.stringify({ error: 'Z-API credentials incomplete' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const recipientList = (recipients as Array<{ type: string; value: string; name: string }>) || [];
    if (recipientList.length === 0) {
      return new Response(JSON.stringify({ message: 'No recipients configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format message
    const productList = (products || [])
      .slice(0, 20)
      .map((p: { retailer_id: string; name: string }) => `  • ${p.name || p.retailer_id}`)
      .join('\n');

    const statusEmoji = repaired ? '✅' : '⚠️';
    const repairText = auto_repair
      ? (repaired ? '✅ Auto-reparo aplicado com sucesso' : '❌ Auto-reparo falhou')
      : '🔧 Auto-reparo desativado';

    const message = [
      `${statusEmoji} *Monitor de Catálogo - AdStorm*`,
      ``,
      `📦 *Catálogo:* ${catalog}`,
      `📋 *Conjunto:* ${product_set}`,
      `🔢 *Produtos afetados:* ${total_affected}`,
      ``,
      repairText,
      ``,
      total_affected > 0 ? `*Produtos sem vídeo:*\n${productList}` : '',
      total_affected > 20 ? `\n... e mais ${total_affected - 20} produtos` : '',
      ``,
      `🕐 ${new Date(timestamp || Date.now()).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    ].filter(Boolean).join('\n');

    // Send to all recipients
    const results = [];
    const baseUrl = `https://api.z-api.io/instances/${instance_id}/token/${token}`;

    for (const recipient of recipientList) {
      try {
        const payload: Record<string, string> = { message };

        if (recipient.type === 'group') {
          // For groups, use the group endpoint
          payload.phone = recipient.value;
        } else {
          payload.phone = recipient.value;
        }

        const res = await fetch(`${baseUrl}/send-text`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Client-Token': client_token,
          },
          body: JSON.stringify(payload),
        });

        const resData = await res.json().catch(() => ({}));
        console.log(`[zapi-webhook-proxy] Sent to ${recipient.value}: ${res.status}`);
        results.push({ recipient: recipient.value, status: res.status, success: res.ok, data: resData });
      } catch (err) {
        console.error(`[zapi-webhook-proxy] Error sending to ${recipient.value}:`, err);
        results.push({ recipient: recipient.value, success: false, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ message: 'Messages sent', results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[zapi-webhook-proxy] Fatal error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
