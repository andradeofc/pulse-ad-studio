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

// Cache per-request to avoid repeated Graph calls
const igActorIdCache = new Map<string, string | null>();
const pageTokenCache = new Map<string, string | null>();

// Get a Page Access Token using the user's access token (fallback when DB token is missing)
async function getPageAccessTokenFromUserToken(
  userAccessToken: string,
  pageId: string,
): Promise<string | null> {
  if (pageTokenCache.has(pageId)) return pageTokenCache.get(pageId) ?? null;

  try {
    let url: string | null = `${GRAPH_BASE_URL}/me/accounts?fields=id,access_token&limit=500&access_token=${userAccessToken}`;

    for (let i = 0; i < 5 && url; i++) {
      const { ok, json } = await fetchWithRetry(url, { method: 'GET' });

      if (!ok || json?.error) {
        const fbError = json?.error;
        console.warn(
          `[process-jobs] Could not fetch page tokens from /me/accounts: ${fbError?.message || 'unknown error'}${
            fbError?.code !== undefined ? ` | code=${fbError.code}` : ''
          }${fbError?.error_subcode !== undefined ? ` | subcode=${fbError.error_subcode}` : ''}`,
        );
        break;
      }

      const match = (json?.data || []).find((p: any) => p?.id === pageId && p?.access_token);
      if (match?.access_token) {
        pageTokenCache.set(pageId, match.access_token);
        return match.access_token;
      }

      url = json?.paging?.next || null;
    }

    pageTokenCache.set(pageId, null);
    return null;
  } catch (err) {
    console.warn(`[process-jobs] Error while fetching page access token via /me/accounts:`, err);
    pageTokenCache.set(pageId, null);
    return null;
  }
}

// Resolve the correct Instagram Actor ID for a Page ("Use selected Page" behavior)
// For ads, instagram_actor_id must be an IGUser id (often a Page-backed IG account).
async function resolveInstagramActorIdForPage(params: {
  userAccessToken: string;
  pageId: string;
  pageAccessTokenFromDb?: string | null;
}): Promise<string | null> {
  const { userAccessToken, pageId, pageAccessTokenFromDb } = params;

  if (igActorIdCache.has(pageId)) return igActorIdCache.get(pageId) ?? null;

  try {
    const pageAccessToken =
      pageAccessTokenFromDb || (await getPageAccessTokenFromUserToken(userAccessToken, pageId));

    // 1) Preferred: Page-backed IG account(s) for this Page (requires Page access token)
    if (pageAccessToken) {
      const pbiaUrl = `${GRAPH_BASE_URL}/${pageId}/page_backed_instagram_accounts?fields=id,username&access_token=${pageAccessToken}`;
      const pbiaRes = await fetchWithRetry(pbiaUrl, { method: 'GET' });

      if (pbiaRes.ok && !pbiaRes.json?.error && Array.isArray(pbiaRes.json?.data) && pbiaRes.json.data.length > 0) {
        const igId = pbiaRes.json.data[0].id as string;
        console.log(`[process-jobs] Resolved Page-backed Instagram account ${igId} for page ${pageId}`);
        igActorIdCache.set(pageId, igId);
        return igId;
      }

      if (pbiaRes.json?.error) {
        const e = pbiaRes.json.error;
        console.warn(
          `[process-jobs] page_backed_instagram_accounts error: ${e?.message || 'unknown'}${
            e?.code !== undefined ? ` | code=${e.code}` : ''
          }${e?.error_subcode !== undefined ? ` | subcode=${e.error_subcode}` : ''}`,
        );
      }

      // 2) Next: instagram_accounts edge (requires Page access token)
      const iaUrl = `${GRAPH_BASE_URL}/${pageId}/instagram_accounts?fields=id,username&access_token=${pageAccessToken}`;
      const iaRes = await fetchWithRetry(iaUrl, { method: 'GET' });

      if (iaRes.ok && !iaRes.json?.error && Array.isArray(iaRes.json?.data) && iaRes.json.data.length > 0) {
        const igId = iaRes.json.data[0].id as string;
        console.log(`[process-jobs] Resolved Instagram account ${igId} for page ${pageId}`);
        igActorIdCache.set(pageId, igId);
        return igId;
      }

      if (iaRes.json?.error) {
        const e = iaRes.json.error;
        console.warn(
          `[process-jobs] instagram_accounts error: ${e?.message || 'unknown'}${
            e?.code !== undefined ? ` | code=${e.code}` : ''
          }${e?.error_subcode !== undefined ? ` | subcode=${e.error_subcode}` : ''}`,
        );
      }
    } else {
      console.warn(`[process-jobs] No Page access token available for page ${pageId}; cannot query instagram_accounts endpoints.`);
    }

    // 3) Last fallback: try reading instagram_business_account via user token (may work depending on permissions)
    const ibaUrl = `${GRAPH_BASE_URL}/${pageId}?fields=instagram_business_account&access_token=${userAccessToken}`;
    const ibaRes = await fetchWithRetry(ibaUrl, { method: 'GET' });

    if (ibaRes.ok && !ibaRes.json?.error && ibaRes.json?.instagram_business_account?.id) {
      const igId = ibaRes.json.instagram_business_account.id as string;
      console.log(`[process-jobs] Resolved instagram_business_account ${igId} for page ${pageId}`);
      igActorIdCache.set(pageId, igId);
      return igId;
    }

    if (ibaRes.json?.error) {
      const e = ibaRes.json.error;
      console.warn(
        `[process-jobs] instagram_business_account error: ${e?.message || 'unknown'}${
          e?.code !== undefined ? ` | code=${e.code}` : ''
        }${e?.error_subcode !== undefined ? ` | subcode=${e.error_subcode}` : ''}`,
      );
    }

    console.log(`[process-jobs] Could not resolve an Instagram actor for page ${pageId}`);
    igActorIdCache.set(pageId, null);
    return null;
  } catch (err) {
    console.error(`[process-jobs] Error resolving Instagram actor for page ${pageId}:`, err);
    igActorIdCache.set(pageId, null);
    return null;
  }
}

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

  // Facebook requires special_ad_categories to always be present.
  // When there is no special category, it MUST contain "NONE".
  const specialAdCategory = (config.specialAdCategory || 'NONE') as string;
  const specialAdCategories = [specialAdCategory];

  const params: Record<string, any> = {
    access_token: accessToken,
    name,
    objective: config.objective || 'OUTCOME_SALES',
    status: config.isPaused ? 'PAUSED' : 'ACTIVE',
    special_ad_categories: JSON.stringify(specialAdCategories),
  };

  // For Dynamic Product Ads (DPA/Catalog), add product_catalog_id at CAMPAIGN level
  if (config.useCatalog && config.catalogId) {
    params.promoted_object = JSON.stringify({
      product_catalog_id: config.catalogId,
    });
  }

  const logParams = { ...params, access_token: '[REDACTED]' };
  console.log(`[process-jobs] Campaign params:`, JSON.stringify(logParams, null, 2));

  // CBO: set campaign budget
  if (config.useCBO) {
    params.daily_budget = Math.round((config.budget || 50) * 100); // cents
    params.bid_strategy = config.bidStrategy || 'LOWEST_COST_WITHOUT_CAP';
  } else {
    // ABO: Facebook requires is_adset_budget_sharing_enabled when not using CBO
    // Setting to false avoids the need for bid_strategy at campaign level
    params.is_adset_budget_sharing_enabled = false;
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
    const fbError = json?.error;
    console.error('[process-jobs] Facebook campaign error:', JSON.stringify(fbError ?? json, null, 2));

    const msg = fbError?.message || 'Failed to create campaign';
    const code = fbError?.code;
    const subcode = fbError?.error_subcode;
    const userMsg = fbError?.error_user_msg;

    const details = [
      msg,
      code !== undefined ? `code=${code}` : null,
      subcode !== undefined ? `subcode=${subcode}` : null,
      userMsg ? `user_msg=${userMsg}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    return { success: false, error: details };
  }

  return { success: true, id: json.id };
}

async function createFacebookAdset(
  accessToken: string,
  adAccountId: string,
  campaignId: string,
  config: Record<string, any>,
  name: string,
  placementTargeting?: Record<string, any>,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  const targetingObj: Record<string, any> = {
    geo_locations: config.geoLocations || { countries: ['BR'] },
    age_min: config.ageMin || 18,
    age_max: config.ageMax || 65,
    locales: config.locales || [24],
    ...(placementTargeting || {}),
    // REQUIRED by Meta API: targeting_automation must explicitly set advantage_audience
    // 1 = Advantage+ Audience enabled (Meta expands targeting)
    // 0 = Advantage+ Audience disabled (use exact targeting provided)
    targeting_automation: {
      advantage_audience: config.advantagePlus ? 1 : 0,
    },
  };

  const params: Record<string, any> = {
    access_token: accessToken,
    campaign_id: campaignId,
    name,
    status: config.isPaused ? 'PAUSED' : 'ACTIVE',

    // Required for most website conversion/ad catalog flows
    destination_type: 'WEBSITE',

    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',

    // Explicit bidding strategy. Fixes cases where FB assumes a strategy that requires bid_amount/bid_constraints.
    bid_strategy: config.bidStrategy || 'LOWEST_COST_WITHOUT_CAP',

    targeting: JSON.stringify(targetingObj),
  };

  // ABO: set adset budget
  if (!config.useCBO) {
    params.daily_budget = Math.round((config.adsetBudget || 10) * 100);
  }

  // Promoted object (combine Pixel + Catalog when available)
  // For OUTCOME_SALES with OFFSITE_CONVERSIONS, pixel_id is REQUIRED to track conversions.
  const promotedObject: Record<string, any> = {};

  // Validation: OFFSITE_CONVERSIONS requires a Pixel
  if (!config.pixelId) {
    console.error('[process-jobs] Missing pixelId for OFFSITE_CONVERSIONS optimization');
    return {
      success: false,
      error: 'Para o objetivo VENDAS com otimização de conversões no site, é necessário selecionar um Pixel. Por favor, edite a campanha e selecione um Pixel no Step 3 (Conjuntos).',
    };
  }

  promotedObject.pixel_id = config.pixelId;
  promotedObject.custom_event_type = 'PURCHASE';

  // For DPA mode: only include product_set_id at adset level (product_catalog_id goes at campaign level)
  if (config.useCatalog && config.productSetId) {
    promotedObject.product_set_id = config.productSetId;
  }

  params.promoted_object = JSON.stringify(promotedObject);

  const logParams = { ...params, access_token: '[REDACTED]' };
  console.log(`[process-jobs] Adset params:`, JSON.stringify(logParams, null, 2));

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
    const fbError = json?.error;
    console.error('[process-jobs] Facebook adset error:', JSON.stringify(fbError ?? json, null, 2));

    const msg = fbError?.message || 'Failed to create adset';
    const code = fbError?.code;
    const subcode = fbError?.error_subcode;
    const userMsg = fbError?.error_user_msg;
    const blame = fbError?.error_data?.blame_field_specs
      ? JSON.stringify(fbError.error_data.blame_field_specs)
      : null;

    const details = [
      msg,
      code !== undefined ? `code=${code}` : null,
      subcode !== undefined ? `subcode=${subcode}` : null,
      userMsg ? `user_msg=${userMsg}` : null,
      blame ? `blame_field_specs=${blame}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    return { success: false, error: details };
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
  instagramUserId: string | null,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  // For catalog ads, we use a template creative
  if (config.useCatalog && config.catalogId) {
    // Create ad creative for dynamic ads
    // Facebook DPA requires specific structure for template_data
    
    // Build the destination URL with URL params if provided
    let finalDestinationUrl = config.destinationUrl || 'https://example.com';
    const urlParams = config.urlParams || '';
    
    // Template data for single image/video format (not carousel)
    // NOTE: Do NOT use force_single_link here - it conflicts with format_option and degrees_of_freedom_spec
    // The deep link override is handled via template_url_spec at the ad creative level instead
    const templateData: Record<string, any> = {
      call_to_action: {
        type: config.ctaType || 'SHOP_NOW',
        value: { link: finalDestinationUrl },
      },

      link: finalDestinationUrl,

      message: config.primaryText || '{{product.name}}',
      name: config.headline || '{{product.name}}',
      description: config.description || '{{product.price}}',

      // Force single image/video format (not carousel)
      // Dynamic Media (degrees_of_freedom_spec) will prioritize video when available
      format_option: 'single_image',
    };

    const objectStorySpec: Record<string, any> = {
      page_id: pageId,
      template_data: templateData,
    };

    // IMPORTANT (Meta API): use instagram_user_id (IGUser id). instagram_actor_id is deprecated.
    if (instagramUserId) {
      objectStorySpec.instagram_user_id = instagramUserId;
    }

    // Dynamic Media (Meta):
    // - media_type_automation OPT_IN => enables videos from the catalog to surface
    // - video_crop_style AUTO       => "Corte de vídeo automático" (auto-crop when needed)
    // Reference: https://developers.facebook.com/docs/marketing-api/advantage-catalog-ads/dynamic-media/
    const degreesOfFreedomSpec: Record<string, any> = {
      creative_features_spec: {
        media_type_automation: {
          customizations: {
            video_crop_style: 'AUTO',
          },
          enroll_status: 'OPT_IN',
        },
      },
    };

    const creativeParams: Record<string, any> = {
      access_token: accessToken,
      name: `Creative_${name}`,
      object_story_spec: JSON.stringify(objectStorySpec),
      product_set_id: config.productSetId,
      
      // Use page identity for Instagram placements
      use_page_actor_override: 'true',
      
      // "Mídia dinâmica" / "Priorizar vídeo" - enable video priority from catalog
      degrees_of_freedom_spec: JSON.stringify(degreesOfFreedomSpec),
      
      // "Substituir deep links do site do catálogo" - override catalog links with ad destination URL
      // template_url_spec defines the URL templates per platform (web, ios, android)
      // Using only web.url to force all clicks to go to the specified website URL
      // Reference: https://developers.facebook.com/docs/marketing-api/reference/ad-creative-template-url-spec
      template_url_spec: JSON.stringify({
        web: { url: finalDestinationUrl },
      }),
      
      // applink_treatment: web_only ensures app deep links in the feed are ignored
      applink_treatment: 'web_only',
    };

    // Add URL parameters if provided (utm_medium, utm_source, etc.)
    if (urlParams && urlParams.trim()) {
      creativeParams.url_tags = urlParams.trim();
    }

    // Log creative params for debugging
    const logCreativeParams = { ...creativeParams, access_token: '[REDACTED]' };
    console.log(`[process-jobs] Creative params:`, JSON.stringify(logCreativeParams, null, 2));

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
      const fbError = creativeResult.json?.error;
      console.error('[process-jobs] Facebook creative error:', JSON.stringify(fbError ?? creativeResult.json, null, 2));
      
      const msg = fbError?.message || 'Failed to create ad creative';
      const code = fbError?.code;
      const subcode = fbError?.error_subcode;
      const userMsg = fbError?.error_user_msg;
      
      const details = [
        msg,
        code !== undefined ? `code=${code}` : null,
        subcode !== undefined ? `subcode=${subcode}` : null,
        userMsg ? `user_msg=${userMsg}` : null,
      ]
        .filter(Boolean)
        .join(' | ');
      
      return { success: false, error: details };
    }

    const creativeId = creativeResult.json.id;
    console.log(`[process-jobs] Creative created: ${creativeId}`);

    // Create the ad
    const adParams: Record<string, any> = {
      access_token: accessToken,
      name,
      adset_id: adsetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status: config.isPaused ? 'PAUSED' : 'ACTIVE',
    };

    const logAdParams = { ...adParams, access_token: '[REDACTED]' };
    console.log(`[process-jobs] Ad params:`, JSON.stringify(logAdParams, null, 2));

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
      const fbError = json?.error;
      console.error('[process-jobs] Facebook ad error:', JSON.stringify(fbError ?? json, null, 2));
      
      const msg = fbError?.message || 'Failed to create ad';
      const code = fbError?.code;
      const subcode = fbError?.error_subcode;
      const userMsg = fbError?.error_user_msg;
      
      const details = [
        msg,
        code !== undefined ? `code=${code}` : null,
        subcode !== undefined ? `subcode=${subcode}` : null,
        userMsg ? `user_msg=${userMsg}` : null,
      ]
        .filter(Boolean)
        .join(' | ');
      
      return { success: false, error: details };
    }

    console.log(`[process-jobs] Ad created: ${json.id}`);
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

    // Get page ID (and Page access token) for ads
    // Note: config.selectedPages may contain either the database UUID or the Facebook page_id
    // We try to find by database id first, then fallback to page_id
    let pageId = '';
    let pageAccessTokenFromDb: string | null = null;

    if (config.selectedPages && config.selectedPages.length > 0) {
      const selectedPageValue = config.selectedPages[0];

      // First try to find by database UUID
      let { data: page } = await supabase
        .from('facebook_pages')
        .select('page_id, access_token')
        .eq('id', selectedPageValue)
        .single();

      // If not found, try by Facebook page_id directly
      if (!page) {
        const { data: pageByFbId } = await supabase
          .from('facebook_pages')
          .select('page_id, access_token')
          .eq('page_id', selectedPageValue)
          .single();
        page = pageByFbId;
      }

      pageId = page?.page_id || '';
      pageAccessTokenFromDb = page?.access_token || null;
      console.log(`[process-jobs] Resolved pageId: ${pageId} from selectedPages: ${selectedPageValue}`);
    }

    const instagramUserIdForJob = pageId
      ? await resolveInstagramActorIdForPage({
          userAccessToken: accessToken,
          pageId,
          pageAccessTokenFromDb,
        })
      : null;

    // We do NOT force placements. If Meta requires an Instagram identity and we can't resolve it,
    // the creative creation will fail and the error will be reported back to the job.
    if (!instagramUserIdForJob) {
      console.warn(`[process-jobs] No Instagram user id resolved for page ${pageId}.`);
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

      const result = await createFacebookAd(accessToken, adAccount.account_id, parentFbId, config, ad.name, pageId, instagramUserIdForJob);

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
