import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, options: RequestInit, label: string, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429 || res.status >= 500) {
      const waitMs = Math.min(5000, 1000 * Math.pow(2, attempt - 1));
      console.warn(`[monitor-catalog-media] ${label} HTTP ${res.status}, attempt ${attempt}/${maxAttempts}. Waiting ${waitMs}ms`);
      if (attempt === maxAttempts) {
        const errorText = await res.text();
        throw new Error(`${label} failed after ${maxAttempts} retries: ${errorText}`);
      }
      await sleep(waitMs);
      continue;
    }
    return res;
  }
  throw new Error(`${label} failed unexpectedly`);
}

const canonicalizeRetailerId = (value: unknown) => {
  let s = String(value ?? '');
  try { s = s.normalize('NFKC'); } catch { /* ignore */ }
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/[\u0000-\u001F\u007F]/g, '');
  return s.trim();
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('[monitor-catalog-media] Starting execution...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch active monitors (max 5 per execution, rotate by last_checked_at)
    const { data: monitors, error: monitorsError } = await supabase
      .from('catalog_media_monitors')
      .select(`
        *,
        catalog:facebook_catalogs(catalog_id, name),
        product_set:facebook_product_sets(product_set_id, name),
        creative:creatives(id, url, type)
      `)
      .eq('is_active', true)
      .order('last_checked_at', { ascending: true, nullsFirst: true });

    if (monitorsError) {
      console.error('[monitor-catalog-media] Error fetching monitors:', monitorsError);
      throw monitorsError;
    }

    if (!monitors || monitors.length === 0) {
      console.log('[monitor-catalog-media] No active monitors found');
      return new Response(
        JSON.stringify({ message: 'No active monitors', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[monitor-catalog-media] Processing ${monitors.length} monitors`);

    const results = [];

    for (const monitor of monitors) {
      try {
        console.log(`[monitor-catalog-media] Checking monitor ${monitor.id} (${monitor.product_set_name})`);

        // Get access token
        const { data: credentials } = await supabase
          .from('facebook_credentials')
          .select('access_token')
          .eq('profile_id', monitor.profile_id)
          .single();

        let accessToken: string;
        if (credentials?.access_token) {
          accessToken = credentials.access_token;
        } else {
          const { data: fallbackProfile } = await supabase
            .from('facebook_profiles')
            .select('access_token')
            .eq('id', monitor.profile_id)
            .single();
          if (!fallbackProfile?.access_token) {
            console.error(`[monitor-catalog-media] No token for profile ${monitor.profile_id}`);
            continue;
          }
          accessToken = fallbackProfile.access_token;
        }

        const catalogFbId = (monitor.catalog as any)?.catalog_id;
        const productSetFbId = (monitor.product_set as any)?.product_set_id;
        const catalogName = (monitor.catalog as any)?.name || 'Unknown';

        if (!productSetFbId) {
          console.error(`[monitor-catalog-media] No Facebook product set ID for monitor ${monitor.id}`);
          continue;
        }

        // Fetch recently repaired retailer_ids (cooldown 30 min)
        const cooldownMinutes = 30;
        const cooldownCutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
        const { data: recentRepairs } = await supabase
          .from('catalog_media_alerts')
          .select('retailer_id')
          .eq('monitor_id', monitor.id)
          .eq('status', 'repaired')
          .gte('repaired_at', cooldownCutoff);

        const recentlyRepairedIds = new Set(
          (recentRepairs || []).map(r => canonicalizeRetailerId(r.retailer_id))
        );

        if (recentlyRepairedIds.size > 0) {
          console.log(`[monitor-catalog-media] Cooldown: ${recentlyRepairedIds.size} products repaired in last ${cooldownMinutes}min will be skipped`);
        }

        // Fetch products from product set
        const productsWithIssues: Array<{ retailer_id: string; name: string }> = [];
        let nextUrl: string | null = `https://graph.facebook.com/v23.0/${productSetFbId}/products?fields=id,retailer_id,name,videos,image_url&limit=500&access_token=${accessToken}`;
        const allProducts: any[] = [];

        while (nextUrl) {
          const res = await fetchWithRetry(nextUrl, { method: 'GET' }, `fetch products for ${monitor.product_set_name}`);
          if (!res.ok) {
            const errData = await res.text();
            console.error(`[monitor-catalog-media] Failed to fetch products: ${errData}`);
            break;
          }
          const data = await res.json();
          allProducts.push(...(data.data || []));
          nextUrl = data.paging?.next || null;
          if (allProducts.length >= 5000) break;
        }

        console.log(`[monitor-catalog-media] Found ${allProducts.length} products in ${monitor.product_set_name}`);

        // Debug: log raw videos field for first 3 products
        for (const p of allProducts.slice(0, 3)) {
          console.log(`[monitor-catalog-media] DEBUG product "${p.retailer_id}" videos field:`, JSON.stringify(p.videos), `| type: ${typeof p.videos} | isArray: ${Array.isArray(p.videos)}`);
        }

        // Detect products missing video (have image but no video), skip recently repaired
        let skippedCooldown = 0;
        for (const product of allProducts) {
          const hasVideo = product.videos && Array.isArray(product.videos) && product.videos.length > 0;
          
          if (!hasVideo && product.image_url) {
            const rid = canonicalizeRetailerId(product.retailer_id);
            if (recentlyRepairedIds.has(rid)) {
              skippedCooldown++;
              continue;
            }
            productsWithIssues.push({
              retailer_id: rid,
              name: product.name || product.retailer_id,
            });
          }
        }

        if (skippedCooldown > 0) {
          console.log(`[monitor-catalog-media] Skipped ${skippedCooldown} products (cooldown active)`);
        }

        // Update last_checked_at
        await supabase
          .from('catalog_media_monitors')
          .update({
            last_checked_at: new Date().toISOString(),
            ...(productsWithIssues.length > 0 ? {
              last_issue_at: new Date().toISOString(),
              issues_found: monitor.issues_found + productsWithIssues.length,
            } : {}),
          })
          .eq('id', monitor.id);

        if (productsWithIssues.length === 0) {
          console.log(`[monitor-catalog-media] No issues found for ${monitor.product_set_name}`);
          // Retroactive cleanup: mark stale 'detected' alerts as repaired
          // (products are now healthy, so any open alert is obsolete)
          const { data: cleaned } = await supabase
            .from('catalog_media_alerts')
            .update({ status: 'repaired', repaired_at: new Date().toISOString() })
            .eq('monitor_id', monitor.id)
            .eq('status', 'detected')
            .select('id');
          if (cleaned && cleaned.length > 0) {
            console.log(`[monitor-catalog-media] Retroactive cleanup: ${cleaned.length} stale alerts marked repaired for ${monitor.product_set_name}`);
          }
          results.push({ monitor_id: monitor.id, issues: 0, cleaned: cleaned?.length || 0 });
          continue;
        }

        console.log(`[monitor-catalog-media] Found ${productsWithIssues.length} products missing video in ${monitor.product_set_name}`);

        // Insert alerts
        const alertRecords = productsWithIssues.map(p => ({
          monitor_id: monitor.id,
          user_id: monitor.user_id,
          retailer_id: p.retailer_id,
          product_name: p.name,
          product_set_name: monitor.product_set_name,
          catalog_name: catalogName,
          alert_type: 'video_missing',
          status: 'detected',
          webhook_sent: false,
        }));

        await supabase.from('catalog_media_alerts').insert(alertRecords);

        // Auto-repair if enabled
        let repaired = false;
        if (monitor.auto_repair && monitor.creative_id && catalogFbId) {
          const creative = monitor.creative as any;
          if (creative?.url) {
            console.log(`[monitor-catalog-media] Auto-repairing ${productsWithIssues.length} products...`);
            
            const batchRequests = productsWithIssues.map(p => ({
              method: 'UPDATE' as const,
              retailer_id: p.retailer_id,
              data: {
                id: p.retailer_id,
                video: [{ url: creative.url }],
              },
            }));

            // Process in batches of 4999
            for (let i = 0; i < batchRequests.length; i += 4999) {
              const batch = batchRequests.slice(i, i + 4999);
              try {
                const batchRes = await fetchWithRetry(
                  `https://graph.facebook.com/v23.0/${catalogFbId}/items_batch`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      access_token: accessToken,
                      item_type: 'PRODUCT_ITEM',
                      requests: batch,
                    }),
                  },
                  'auto-repair batch'
                );
                
                if (batchRes.ok) {
                  repaired = true;
                  console.log(`[monitor-catalog-media] Auto-repair batch sent successfully`);
                } else {
                  const errText = await batchRes.text();
                  console.error(`[monitor-catalog-media] Auto-repair batch failed: ${errText}`);
                }
              } catch (err) {
                console.error(`[monitor-catalog-media] Auto-repair error:`, err);
              }
            }

            if (repaired) {
              // Update alert statuses to repaired
              await supabase
                .from('catalog_media_alerts')
                .update({ status: 'repaired', repaired_at: new Date().toISOString() })
                .eq('monitor_id', monitor.id)
                .eq('status', 'detected');
            }
          }
        }

        // Send webhook if configured
        const webhookUrl = monitor.webhook_url;
        if (webhookUrl) {
          try {
            const payload = {
              event: 'video_missing',
              catalog: catalogName,
              product_set: monitor.product_set_name,
              products: productsWithIssues.slice(0, 50).map(p => ({
                retailer_id: p.retailer_id,
                name: p.name,
              })),
              total_affected: productsWithIssues.length,
              auto_repair: monitor.auto_repair,
              repaired,
              timestamp: new Date().toISOString(),
            };

            const webhookRes = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

            if (webhookRes.ok) {
              console.log(`[monitor-catalog-media] Webhook sent successfully`);
              await supabase
                .from('catalog_media_alerts')
                .update({ webhook_sent: true, status: 'notified' })
                .eq('monitor_id', monitor.id)
                .eq('webhook_sent', false);
            } else {
              console.error(`[monitor-catalog-media] Webhook failed: ${webhookRes.status}`);
            }
          } catch (err) {
            console.error(`[monitor-catalog-media] Webhook error:`, err);
          }
        }

        // Send Z-API notification if user has it configured
        try {
          const { data: zapiSettings } = await supabase
            .from('user_zapi_settings')
            .select('is_enabled')
            .eq('user_id', monitor.user_id)
            .eq('is_enabled', true)
            .maybeSingle();

          if (zapiSettings) {
            console.log(`[monitor-catalog-media] Sending Z-API notification for user ${monitor.user_id}`);
            const zapiPayload = {
              user_id: monitor.user_id,
              event: 'video_missing',
              catalog: catalogName,
              product_set: monitor.product_set_name,
              products: productsWithIssues.slice(0, 50).map(p => ({
                retailer_id: p.retailer_id,
                name: p.name,
              })),
              total_affected: productsWithIssues.length,
              auto_repair: monitor.auto_repair,
              repaired,
              timestamp: new Date().toISOString(),
            };

            const zapiRes = await fetch(
              `${supabaseUrl}/functions/v1/zapi-webhook-proxy`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify(zapiPayload),
              }
            );
            console.log(`[monitor-catalog-media] Z-API proxy response: ${zapiRes.status}`);
          }
        } catch (zapiErr) {
          console.error(`[monitor-catalog-media] Z-API notification error:`, zapiErr);
        }

        results.push({ monitor_id: monitor.id, issues: productsWithIssues.length, repaired });
      } catch (err) {
        console.error(`[monitor-catalog-media] Error processing monitor ${monitor.id}:`, err);
        results.push({ monitor_id: monitor.id, error: String(err) });
      }
    }

    console.log(`[monitor-catalog-media] Completed. Results:`, JSON.stringify(results));

    return new Response(
      JSON.stringify({ message: 'Monitor completed', results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[monitor-catalog-media] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
