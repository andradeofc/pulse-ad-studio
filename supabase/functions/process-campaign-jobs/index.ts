import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface JobItem {
  id: string;
  job_id: string;
  item_type: 'campaign' | 'adset' | 'ad';
  parent_id: string | null;
  name: string;
  status: string;
  facebook_id: string | null;
  error_message: string | null;
  config: Record<string, any>;
}

interface Job {
  id: string;
  user_id: string;
  status: string;
  config: Record<string, any>;
  total_campaigns: number;
  total_adsets: number;
  total_ads: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxAttempts = 3,
): Promise<{ ok: boolean; status: number; json: any }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, options);
      const json = await res.json();

      // Rate limit handling
      if (res.status === 429 || (json.error?.code === 17 || json.error?.code === 4)) {
        const waitMs = Math.min(10000, 1000 * Math.pow(2, attempt));
        console.warn(`[process-jobs] Rate limited, waiting ${waitMs}ms (attempt ${attempt})`);
        await sleep(waitMs);
        continue;
      }

      return { ok: res.ok, status: res.status, json };
    } catch (err: any) {
      if (attempt === maxAttempts) {
        throw err;
      }
      await sleep(1000 * attempt);
    }
  }
  throw new Error('Max retries exceeded');
}

async function createFacebookCampaign(
  accessToken: string,
  adAccountId: string,
  config: Record<string, any>,
  name: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  const params: Record<string, any> = {
    access_token: accessToken,
    name,
    objective: config.objective || 'OUTCOME_SALES',
    status: config.isPaused ? 'PAUSED' : 'ACTIVE',
    special_ad_categories: config.specialAdCategory === 'NONE' ? '[]' : `["${config.specialAdCategory}"]`,
  };

  // CBO: set campaign budget
  if (config.useCBO) {
    params.daily_budget = Math.round((config.budget || 50) * 100); // cents
    params.bid_strategy = config.bidStrategy || 'LOWEST_COST_WITHOUT_CAP';
  }

  const formData = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    formData.append(key, String(value));
  }

  const { ok, json } = await fetchWithRetry(`${GRAPH_BASE_URL}/${actId}/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  if (!ok || json.error) {
    return { success: false, error: json.error?.message || 'Failed to create campaign' };
  }

  return { success: true, id: json.id };
}

async function createFacebookAdset(
  accessToken: string,
  adAccountId: string,
  campaignId: string,
  config: Record<string, any>,
  name: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  const params: Record<string, any> = {
    access_token: accessToken,
    campaign_id: campaignId,
    name,
    status: config.isPaused ? 'PAUSED' : 'ACTIVE',
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    targeting: JSON.stringify({
      geo_locations: config.geoLocations || { countries: ['BR'] },
      age_min: config.ageMin || 18,
      age_max: config.ageMax || 65,
      locales: config.locales || [24],
    }),
  };

  // ABO: set adset budget
  if (!config.useCBO) {
    params.daily_budget = Math.round((config.adsetBudget || 10) * 100);
  }

  // Promoted object
  if (config.pixelId) {
    params.promoted_object = JSON.stringify({
      pixel_id: config.pixelId,
      custom_event_type: 'PURCHASE',
      ...(config.catalogId && { product_catalog_id: config.catalogId }),
      ...(config.productSetId && { product_set_id: config.productSetId }),
    });
  } else if (config.catalogId) {
    params.promoted_object = JSON.stringify({
      product_catalog_id: config.catalogId,
      ...(config.productSetId && { product_set_id: config.productSetId }),
    });
  }

  const formData = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    formData.append(key, String(value));
  }

  const { ok, json } = await fetchWithRetry(`${GRAPH_BASE_URL}/${actId}/adsets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  if (!ok || json.error) {
    return { success: false, error: json.error?.message || 'Failed to create adset' };
  }

  return { success: true, id: json.id };
}

async function createFacebookAd(
  accessToken: string,
  adAccountId: string,
  adsetId: string,
  config: Record<string, any>,
  name: string,
  pageId: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  // For catalog ads, we use a template creative
  if (config.useCatalog && config.catalogId) {
    // Create ad creative for dynamic ads
    const creativeParams = {
      access_token: accessToken,
      name: `Creative_${name}`,
      object_story_spec: JSON.stringify({
        page_id: pageId,
        template_data: {
          call_to_action: {
            type: config.ctaType || 'SHOP_NOW',
            value: { link: config.destinationUrl || 'https://example.com' },
          },
          link: config.destinationUrl || 'https://example.com',
          message: config.primaryText || '{{product.name}}',
          name: config.headline || '{{product.name}}',
          description: config.description || '{{product.price}}',
        },
      }),
      product_set_id: config.productSetId || '',
    };

    const creativeFormData = new URLSearchParams();
    for (const [key, value] of Object.entries(creativeParams)) {
      if (value) creativeFormData.append(key, String(value));
    }

    const creativeResult = await fetchWithRetry(`${GRAPH_BASE_URL}/${actId}/adcreatives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: creativeFormData.toString(),
    });

    if (!creativeResult.ok || creativeResult.json.error) {
      return { success: false, error: creativeResult.json.error?.message || 'Failed to create ad creative' };
    }

    const creativeId = creativeResult.json.id;

    // Create the ad
    const adParams = {
      access_token: accessToken,
      name,
      adset_id: adsetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status: config.isPaused ? 'PAUSED' : 'ACTIVE',
    };

    const adFormData = new URLSearchParams();
    for (const [key, value] of Object.entries(adParams)) {
      adFormData.append(key, String(value));
    }

    const { ok, json } = await fetchWithRetry(`${GRAPH_BASE_URL}/${actId}/ads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: adFormData.toString(),
    });

    if (!ok || json.error) {
      return { success: false, error: json.error?.message || 'Failed to create ad' };
    }

    return { success: true, id: json.id };
  } else {
    // For non-catalog ads, we need a creative with image/video
    // This would require uploading the creative first - simplified for now
    return { success: false, error: 'Non-catalog ads require creative upload - not implemented yet' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse job_id from request
    let jobId: string | null = null;
    try {
      const body = await req.json();
      jobId = body.job_id;
    } catch {
      // No body
    }

    if (!jobId) {
      return new Response(JSON.stringify({ error: 'job_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[process-jobs] Processing job ${jobId} for user ${user.id}`);

    // Get the job
    const { data: job, error: jobError } = await supabase
      .from('campaign_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (job.status === 'completed') {
      return new Response(JSON.stringify({ error: 'Job already completed', job }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update job to processing
    await supabase
      .from('campaign_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', jobId);

    // Get job items
    const { data: items, error: itemsError } = await supabase
      .from('campaign_job_items')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at');

    if (itemsError || !items) {
      throw new Error('Failed to fetch job items');
    }

    // Get access token and ad account from config
    const config = job.config as Record<string, any>;
    const selectedAccountIds = config.selectedAccounts || [];

    if (selectedAccountIds.length === 0) {
      throw new Error('No ad accounts selected in job config');
    }

    // Get the first selected ad account with its profile
    const { data: adAccount, error: accError } = await supabase
      .from('facebook_ad_accounts')
      .select('account_id, profile_id')
      .eq('id', selectedAccountIds[0])
      .single();

    if (accError || !adAccount) {
      throw new Error('Ad account not found');
    }

    // Get access token from profile
    const { data: profile, error: profError } = await supabase
      .from('facebook_profiles')
      .select('access_token')
      .eq('id', adAccount.profile_id)
      .eq('user_id', user.id)
      .single();

    if (profError || !profile) {
      throw new Error('Profile not found or access denied');
    }

    const accessToken = profile.access_token;

    // Get page ID for ads
    let pageId = '';
    if (config.selectedPages && config.selectedPages.length > 0) {
      const { data: page } = await supabase
        .from('facebook_pages')
        .select('page_id')
        .eq('id', config.selectedPages[0])
        .single();
      pageId = page?.page_id || '';
    }

    // Process items in order: campaigns → adsets → ads
    const campaigns = items.filter((i) => i.item_type === 'campaign');
    const adsets = items.filter((i) => i.item_type === 'adset');
    const ads = items.filter((i) => i.item_type === 'ad');

    const totalItems = items.length;
    let processedItems = 0;
    let hasError = false;
    let lastError = '';

    // Map of local ID to Facebook ID
    const idMap = new Map<string, string>();

    // Process campaigns
    for (const campaign of campaigns) {
      console.log(`[process-jobs] Creating campaign: ${campaign.name}`);

      await supabase
        .from('campaign_job_items')
        .update({ status: 'processing' })
        .eq('id', campaign.id);

      const result = await createFacebookCampaign(accessToken, adAccount.account_id, config, campaign.name);

      if (result.success && result.id) {
        idMap.set(campaign.id, result.id);
        await supabase
          .from('campaign_job_items')
          .update({ status: 'completed', facebook_id: result.id })
          .eq('id', campaign.id);
      } else {
        hasError = true;
        lastError = result.error || 'Unknown error';
        await supabase
          .from('campaign_job_items')
          .update({ status: 'failed', error_message: result.error })
          .eq('id', campaign.id);
      }

      processedItems++;
      const progress = Math.round((processedItems / totalItems) * 100);
      await supabase.from('campaign_jobs').update({ progress }).eq('id', jobId);
    }

    // Process adsets
    for (const adset of adsets) {
      const parentFbId = adset.parent_id ? idMap.get(adset.parent_id) : null;

      if (!parentFbId) {
        await supabase
          .from('campaign_job_items')
          .update({ status: 'failed', error_message: 'Parent campaign failed' })
          .eq('id', adset.id);
        processedItems++;
        hasError = true;
        continue;
      }

      console.log(`[process-jobs] Creating adset: ${adset.name}`);

      await supabase
        .from('campaign_job_items')
        .update({ status: 'processing' })
        .eq('id', adset.id);

      const result = await createFacebookAdset(accessToken, adAccount.account_id, parentFbId, config, adset.name);

      if (result.success && result.id) {
        idMap.set(adset.id, result.id);
        await supabase
          .from('campaign_job_items')
          .update({ status: 'completed', facebook_id: result.id })
          .eq('id', adset.id);
      } else {
        hasError = true;
        lastError = result.error || 'Unknown error';
        await supabase
          .from('campaign_job_items')
          .update({ status: 'failed', error_message: result.error })
          .eq('id', adset.id);
      }

      processedItems++;
      const progress = Math.round((processedItems / totalItems) * 100);
      await supabase.from('campaign_jobs').update({ progress }).eq('id', jobId);
    }

    // Process ads
    for (const ad of ads) {
      const parentFbId = ad.parent_id ? idMap.get(ad.parent_id) : null;

      if (!parentFbId) {
        await supabase
          .from('campaign_job_items')
          .update({ status: 'failed', error_message: 'Parent adset failed' })
          .eq('id', ad.id);
        processedItems++;
        hasError = true;
        continue;
      }

      if (!pageId) {
        await supabase
          .from('campaign_job_items')
          .update({ status: 'failed', error_message: 'No page selected for ad' })
          .eq('id', ad.id);
        processedItems++;
        hasError = true;
        lastError = 'No page selected';
        continue;
      }

      console.log(`[process-jobs] Creating ad: ${ad.name}`);

      await supabase
        .from('campaign_job_items')
        .update({ status: 'processing' })
        .eq('id', ad.id);

      const result = await createFacebookAd(accessToken, adAccount.account_id, parentFbId, config, ad.name, pageId);

      if (result.success && result.id) {
        idMap.set(ad.id, result.id);
        await supabase
          .from('campaign_job_items')
          .update({ status: 'completed', facebook_id: result.id })
          .eq('id', ad.id);
      } else {
        hasError = true;
        lastError = result.error || 'Unknown error';
        await supabase
          .from('campaign_job_items')
          .update({ status: 'failed', error_message: result.error })
          .eq('id', ad.id);
      }

      processedItems++;
      const progress = Math.round((processedItems / totalItems) * 100);
      await supabase.from('campaign_jobs').update({ progress }).eq('id', jobId);
    }

    // Final status update
    const finalStatus = hasError ? 'failed' : 'completed';
    await supabase
      .from('campaign_jobs')
      .update({
        status: finalStatus,
        progress: 100,
        completed_at: new Date().toISOString(),
        error_message: hasError ? lastError : null,
      })
      .eq('id', jobId);

    console.log(`[process-jobs] Job ${jobId} finished with status: ${finalStatus}`);

    return new Response(
      JSON.stringify({
        success: !hasError,
        status: finalStatus,
        processed: processedItems,
        total: totalItems,
        error: hasError ? lastError : null,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error: any) {
    console.error('[process-jobs] Fatal error:', error);

    // Try to update job status to failed
    try {
      const body = await req.clone().json();
      if (body?.job_id) {
        await supabase
          .from('campaign_jobs')
          .update({ status: 'failed', error_message: error.message })
          .eq('id', body.job_id);
      }
    } catch {
      // Ignore
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
