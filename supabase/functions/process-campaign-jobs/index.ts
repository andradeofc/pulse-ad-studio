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

// Rate limit tracking per ad account
interface RateLimitInfo {
  usagePercent: number;
  lastUpdated: number;
  requestCount: number;
  windowStart: number;
}

const rateLimitTracker = new Map<string, RateLimitInfo>();

// Rate limit constants (Standard Access tier)
const RATE_LIMIT_CONFIG = {
  MAX_USAGE_PERCENT: 85, // Stop if usage exceeds this
  MAX_QPS: 100, // Max 100 requests per second
  MIN_DELAY_MS: 10, // Minimum 10ms between requests (100 QPS)
  BACKOFF_THRESHOLD: 50, // Start slowing down at 50% usage
  WINDOW_MS: 5 * 60 * 1000, // 5 minute window
};

// QPS throttling: track last request time
let lastRequestTime = 0;
let requestsInCurrentSecond = 0;
let currentSecondStart = 0;

async function throttleRequest(): Promise<void> {
  const now = Date.now();
  
  // Reset counter if we're in a new second
  if (now - currentSecondStart >= 1000) {
    currentSecondStart = now;
    requestsInCurrentSecond = 0;
  }
  
  // If we've hit the QPS limit, wait until the next second
  if (requestsInCurrentSecond >= RATE_LIMIT_CONFIG.MAX_QPS) {
    const waitTime = 1000 - (now - currentSecondStart);
    if (waitTime > 0) {
      console.log(`[rate-limit] QPS limit reached, waiting ${waitTime}ms`);
      await sleep(waitTime);
      currentSecondStart = Date.now();
      requestsInCurrentSecond = 0;
    }
  }
  
  // Ensure minimum delay between requests
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_CONFIG.MIN_DELAY_MS) {
    await sleep(RATE_LIMIT_CONFIG.MIN_DELAY_MS - timeSinceLastRequest);
  }
  
  lastRequestTime = Date.now();
  requestsInCurrentSecond++;
}

function parseRateLimitHeader(header: string | null): number {
  if (!header) return 0;
  
  try {
    // Facebook returns JSON like: {"acc_id_util_pct": 15.50, ...}
    const parsed = JSON.parse(header);
    if (parsed.acc_id_util_pct !== undefined) {
      return parseFloat(parsed.acc_id_util_pct);
    }
    // Sometimes it's a simpler format
    const match = header.match(/acc_id_util_pct["\s:]+(\d+(?:\.\d+)?)/);
    if (match) {
      return parseFloat(match[1]);
    }
  } catch {
    // Try regex if JSON parsing fails
    const match = header.match(/acc_id_util_pct["\s:]+(\d+(?:\.\d+)?)/);
    if (match) {
      return parseFloat(match[1]);
    }
  }
  
  return 0;
}

function updateRateLimitInfo(accountId: string, usagePercent: number): void {
  const now = Date.now();
  const existing = rateLimitTracker.get(accountId);
  
  if (existing && now - existing.windowStart < RATE_LIMIT_CONFIG.WINDOW_MS) {
    // Same window, update
    rateLimitTracker.set(accountId, {
      usagePercent: Math.max(existing.usagePercent, usagePercent),
      lastUpdated: now,
      requestCount: existing.requestCount + 1,
      windowStart: existing.windowStart,
    });
  } else {
    // New window
    rateLimitTracker.set(accountId, {
      usagePercent,
      lastUpdated: now,
      requestCount: 1,
      windowStart: now,
    });
  }
}

function shouldPauseForRateLimit(accountId: string): { pause: boolean; usagePercent: number; waitMs: number } {
  const info = rateLimitTracker.get(accountId);
  if (!info) {
    return { pause: false, usagePercent: 0, waitMs: 0 };
  }
  
  // If usage is above threshold, calculate adaptive delay
  if (info.usagePercent >= RATE_LIMIT_CONFIG.MAX_USAGE_PERCENT) {
    // Wait longer when close to limit
    const waitMs = Math.min(30000, Math.round((info.usagePercent - 50) * 200));
    return { pause: true, usagePercent: info.usagePercent, waitMs };
  }
  
  // Adaptive slowdown between 50-85%
  if (info.usagePercent >= RATE_LIMIT_CONFIG.BACKOFF_THRESHOLD) {
    const slowdownFactor = (info.usagePercent - RATE_LIMIT_CONFIG.BACKOFF_THRESHOLD) / 35; // 0-1
    const additionalDelay = Math.round(slowdownFactor * 500); // Up to 500ms extra delay
    return { pause: false, usagePercent: info.usagePercent, waitMs: additionalDelay };
  }
  
  return { pause: false, usagePercent: info.usagePercent, waitMs: 0 };
}

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
  accountId?: string,
): Promise<{ ok: boolean; status: number; json: any; rateLimitPercent: number }> {
  // Apply QPS throttling before each request
  await throttleRequest();
  
  // Check if we should pause for rate limits
  if (accountId) {
    const rateLimitCheck = shouldPauseForRateLimit(accountId);
    if (rateLimitCheck.pause) {
      console.warn(`[rate-limit] Account ${accountId} at ${rateLimitCheck.usagePercent}% usage, waiting ${rateLimitCheck.waitMs}ms`);
      await sleep(rateLimitCheck.waitMs);
    } else if (rateLimitCheck.waitMs > 0) {
      // Adaptive slowdown
      await sleep(rateLimitCheck.waitMs);
    }
  }
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, options);
      const json = await res.json();
      
      // Parse and track rate limit from response header
      const rateLimitHeader = res.headers.get('x-ad-account-usage') || res.headers.get('X-Ad-Account-Usage');
      const rateLimitPercent = parseRateLimitHeader(rateLimitHeader);
      
      if (rateLimitPercent > 0 && accountId) {
        updateRateLimitInfo(accountId, rateLimitPercent);
        if (rateLimitPercent > 50) {
          console.log(`[rate-limit] Account ${accountId} usage: ${rateLimitPercent.toFixed(1)}%`);
        }
      }

      // Rate limit handling - exponential backoff
      if (res.status === 429 || json.error?.code === 17 || json.error?.code === 4 || json.error?.code === 80004) {
        const baseWait = Math.min(30000, 2000 * Math.pow(2, attempt));
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 1000;
        const waitMs = baseWait + jitter;
        
        console.warn(`[rate-limit] Rate limited (code: ${json.error?.code || res.status}), waiting ${Math.round(waitMs)}ms (attempt ${attempt}/${maxAttempts})`);
        await sleep(waitMs);
        continue;
      }

      return { ok: res.ok, status: res.status, json, rateLimitPercent };
    } catch (err: any) {
      if (attempt === maxAttempts) {
        throw err;
      }
      const waitMs = 1000 * attempt + Math.random() * 500;
      console.warn(`[fetch-retry] Network error, retrying in ${Math.round(waitMs)}ms:`, err.message);
      await sleep(waitMs);
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

  const { ok, json } = await fetchWithRetry(
    `${GRAPH_BASE_URL}/${actId}/campaigns`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    },
    3,
    adAccountId,
  );

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

  // Attribution Settings (conversion window)
  // Reference: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign
  const attributionSpec: Array<{ event_type: string; window_days: number }> = [];
  
  // Click-through attribution (1 or 7 days)
  const clickDays = config.attributionClickDays ?? 7;
  attributionSpec.push({ event_type: 'CLICK_THROUGH', window_days: clickDays });
  
  // View-through attribution (0 or 1 day)
  const viewDays = config.attributionViewDays ?? 1;
  if (viewDays > 0) {
    attributionSpec.push({ event_type: 'VIEW_THROUGH', window_days: viewDays });
  }
  
  // Engaged video view attribution (0 or 1 day) - for video ads
  const engagedViewDays = config.attributionEngagedViewDays ?? 1;
  if (engagedViewDays > 0) {
    attributionSpec.push({ event_type: 'ENGAGED_VIDEO_VIEW', window_days: engagedViewDays });
  }
  
  if (attributionSpec.length > 0) {
    params.attribution_spec = JSON.stringify(attributionSpec);
  }

  // Start time (schedule) - User enters time in EST (Eastern Standard Time)
  // Facebook API expects ISO 8601 format with timezone
  if (config.scheduleStart) {
    // Accept both Date objects (from frontend) and ISO strings
    const startDate = typeof config.scheduleStart === 'string' 
      ? new Date(config.scheduleStart) 
      : config.scheduleStart;
    
    if (startDate instanceof Date && !isNaN(startDate.getTime())) {
      // Format the date in EST timezone (America/New_York)
      // Facebook API accepts ISO 8601 with timezone offset
      // EST is UTC-5, EDT is UTC-4 (we use -05:00 for consistency as "EST")
      const year = startDate.getFullYear();
      const month = String(startDate.getMonth() + 1).padStart(2, '0');
      const day = String(startDate.getDate()).padStart(2, '0');
      const hours = String(startDate.getHours()).padStart(2, '0');
      const minutes = String(startDate.getMinutes()).padStart(2, '0');
      const seconds = String(startDate.getSeconds()).padStart(2, '0');
      
      // Format as ISO 8601 with EST offset (-05:00)
      params.start_time = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-05:00`;
      console.log(`[process-jobs] Schedule start time (EST): ${params.start_time}`);
    }
  }

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

  const { ok, json } = await fetchWithRetry(
    `${GRAPH_BASE_URL}/${actId}/adsets`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    },
    3,
    adAccountId,
  );

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

      // Force single image/video format (not carousel) AND prioritize video
      // "single_video" = formato único com priorização de vídeo do catálogo
      format_option: 'single_video',
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

    const creativeResult = await fetchWithRetry(
      `${GRAPH_BASE_URL}/${actId}/adcreatives`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: creativeFormData.toString(),
      },
      3,
      adAccountId,
    );

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

    const { ok, json } = await fetchWithRetry(
      `${GRAPH_BASE_URL}/${actId}/ads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: adFormData.toString(),
      },
      3,
      adAccountId,
    );

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

    // Multi-account mode: process all selected accounts
    const isMultiAccountMode = config.multiAccountMode === true && selectedAccountIds.length > 1;
    console.log(`[process-jobs] Multi-account mode: ${isMultiAccountMode}, accounts: ${selectedAccountIds.length}`);

    // Fetch all selected ad accounts
    const { data: allAdAccounts, error: accError } = await supabase
      .from('facebook_ad_accounts')
      .select('id, account_id, profile_id, name')
      .in('id', selectedAccountIds);

    if (accError || !allAdAccounts || allAdAccounts.length === 0) {
      throw new Error('No ad accounts found');
    }

    console.log(`[process-jobs] Found ${allAdAccounts.length} ad accounts to process`);

    // Get page info (shared across all accounts, resolved once)
    // First we need to get access token from first account's profile for page resolution
    const firstAccountProfileId = allAdAccounts[0].profile_id;
    const { data: firstProfile } = await supabase
      .from('facebook_profiles')
      .select('access_token')
      .eq('id', firstAccountProfileId)
      .eq('user_id', user.id)
      .single();

    const firstAccessToken = firstProfile?.access_token;

    // Get page ID (and Page access token) for ads
    // Note: config.selectedPages may contain either the database UUID or the Facebook page_id
    // We try to find by database id first, then fallback to page_id
    // For Anti-Spy mode, we store all resolved pages for round-robin distribution
    const resolvedPages: Array<{ pageId: string; accessToken: string | null; instagramActorId: string | null }> = [];

    if (config.selectedPages && config.selectedPages.length > 0 && firstAccessToken) {
      for (const selectedPageValue of config.selectedPages) {
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

        if (page?.page_id) {
          const instagramActorId = await resolveInstagramActorIdForPage({
            userAccessToken: firstAccessToken,
            pageId: page.page_id,
            pageAccessTokenFromDb: page.access_token || null,
          });
          
          resolvedPages.push({
            pageId: page.page_id,
            accessToken: page.access_token || null,
            instagramActorId,
          });
          console.log(`[process-jobs] Resolved page: ${page.page_id}, Instagram: ${instagramActorId || 'none'}`);
        }
      }
    }

    // Fallback for backwards compatibility: use first page if available
    const defaultPageId = resolvedPages.length > 0 ? resolvedPages[0].pageId : '';
    const defaultInstagramUserId = resolvedPages.length > 0 ? resolvedPages[0].instagramActorId : null;

    if (resolvedPages.length === 0) {
      console.warn(`[process-jobs] No pages resolved from selectedPages.`);
    } else if (config.antiSpyEnabled && resolvedPages.length > 1) {
      console.log(`[process-jobs] Anti-Spy enabled with ${resolvedPages.length} pages for round-robin distribution`);
    }

    // Get job items (these are templates - will be replicated for each account in multi-account mode)
    const campaigns = items.filter((i) => i.item_type === 'campaign');
    const adsets = items.filter((i) => i.item_type === 'adset');
    const ads = items.filter((i) => i.item_type === 'ad');

    // Calculate total items to process (items × accounts in multi-account mode)
    const accountsToProcess = isMultiAccountMode ? allAdAccounts.length : 1;
    const totalItems = items.length * accountsToProcess;
    let processedItems = 0;
    let hasError = false;
    let lastError = '';

    // Process each account
    for (let accountIndex = 0; accountIndex < accountsToProcess; accountIndex++) {
      const currentAccount = allAdAccounts[accountIndex];
      console.log(`[process-jobs] Processing account ${accountIndex + 1}/${accountsToProcess}: ${currentAccount.name} (${currentAccount.account_id})`);

      // Get access token for this account's profile
      const { data: profile, error: profError } = await supabase
        .from('facebook_profiles')
        .select('access_token')
        .eq('id', currentAccount.profile_id)
        .eq('user_id', user.id)
        .single();

      if (profError || !profile) {
        console.error(`[process-jobs] Profile not found for account ${currentAccount.name}`);
        // Mark all items for this account as failed
        for (const item of items) {
          await supabase
            .from('campaign_job_items')
            .update({ 
              status: 'failed', 
              error_message: `Profile not found for account ${currentAccount.name}` 
            })
            .eq('id', item.id);
          processedItems++;
        }
        hasError = true;
        lastError = `Profile not found for account ${currentAccount.name}`;
        continue;
      }

      const accessToken = profile.access_token;

      // Map of local ID to Facebook ID (per account)
      const idMap = new Map<string, string>();

      // Get account nickname/alias for naming
      const accountNickname = currentAccount.name?.split(' - ')[0] || currentAccount.name || 'Conta';
      const accountId = currentAccount.account_id?.replace('act_', '') || '';

      // Helper to replace all naming variables (including custom ones)
      const replaceNamingVariables = (name: string): string => {
        let result = name
          .replace(/\{\{conta_apelido\}\}/g, accountNickname)
          .replace(/\{\{conta_nome\}\}/g, currentAccount.name || '')
          .replace(/\{\{conta_id\}\}/g, accountId);
        
        // Replace custom naming variables from config
        const customVars = config.customNamingVariables as Record<string, string> || {};
        for (const [key, value] of Object.entries(customVars)) {
          result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        }
        
        // Replace date/time variables
        const now = new Date();
        result = result
          .replace(/\{\{ano\}\}/g, now.getFullYear().toString())
          .replace(/\{\{ano2\}\}/g, now.getFullYear().toString().slice(-2))
          .replace(/\{\{mes\}\}/g, String(now.getMonth() + 1).padStart(2, '0'))
          .replace(/\{\{dia\}\}/g, String(now.getDate()).padStart(2, '0'))
          .replace(/\{\{hora\}\}/g, String(now.getHours()).padStart(2, '0'))
          .replace(/\{\{minuto\}\}/g, String(now.getMinutes()).padStart(2, '0'));
        
        // Replace budget variable
        result = result.replace(/\{\{budget\}\}/g, config.useCBO ? 'CBO' : 'ABO');
        
        // Replace structure variable
        const structure = `${job.total_campaigns}-${config.adsetsPerCampaign || 1}-${config.adsPerAdset || 1}`;
        result = result.replace(/\{\{estrutura\}\}/g, structure);
        
        return result;
      };

      // Process campaigns for this account
      for (const campaign of campaigns) {
        // Replace all variables in campaign name
        let campaignName = replaceNamingVariables(campaign.name);

        console.log(`[process-jobs] Creating campaign: ${campaignName} for account ${currentAccount.name}`);

        // Only update status on first account (to avoid conflicts)
        if (accountIndex === 0) {
          await supabase
            .from('campaign_job_items')
            .update({ status: 'processing' })
            .eq('id', campaign.id);
        }

        const result = await createFacebookCampaign(accessToken, currentAccount.account_id, config, campaignName);

        if (result.success && result.id) {
          idMap.set(campaign.id, result.id);
          
          // Update item status only on last account or if single account
          if (accountIndex === accountsToProcess - 1) {
            await supabase
              .from('campaign_job_items')
              .update({ 
                status: 'completed', 
                facebook_id: isMultiAccountMode ? `${result.id} (+${accountsToProcess - 1})` : result.id 
              })
              .eq('id', campaign.id);
          }
        } else {
          hasError = true;
          lastError = result.error || 'Unknown error';
          
          if (accountIndex === accountsToProcess - 1) {
            await supabase
              .from('campaign_job_items')
              .update({ status: 'failed', error_message: result.error })
              .eq('id', campaign.id);
          }
        }

        processedItems++;
        const progress = Math.round((processedItems / totalItems) * 100);
        await supabase.from('campaign_jobs').update({ progress }).eq('id', jobId);
      }

      // Process adsets for this account
      for (const adset of adsets) {
        const parentFbId = adset.parent_id ? idMap.get(adset.parent_id) : null;

        if (!parentFbId) {
          if (accountIndex === accountsToProcess - 1) {
            await supabase
              .from('campaign_job_items')
              .update({ status: 'failed', error_message: 'Parent campaign failed' })
              .eq('id', adset.id);
          }
          processedItems++;
          hasError = true;
          continue;
        }

        // Replace all variables in adset name
        let adsetName = replaceNamingVariables(adset.name);

        console.log(`[process-jobs] Creating adset: ${adsetName} for account ${currentAccount.name}`);

        if (accountIndex === 0) {
          await supabase
            .from('campaign_job_items')
            .update({ status: 'processing' })
            .eq('id', adset.id);
        }

        const result = await createFacebookAdset(accessToken, currentAccount.account_id, parentFbId, config, adsetName);

        if (result.success && result.id) {
          idMap.set(adset.id, result.id);
          
          if (accountIndex === accountsToProcess - 1) {
            await supabase
              .from('campaign_job_items')
              .update({ 
                status: 'completed', 
                facebook_id: isMultiAccountMode ? `${result.id} (+${accountsToProcess - 1})` : result.id 
              })
              .eq('id', adset.id);
          }
        } else {
          hasError = true;
          lastError = result.error || 'Unknown error';
          
          if (accountIndex === accountsToProcess - 1) {
            await supabase
              .from('campaign_job_items')
              .update({ status: 'failed', error_message: result.error })
              .eq('id', adset.id);
          }
        }

        processedItems++;
        const progress = Math.round((processedItems / totalItems) * 100);
        await supabase.from('campaign_jobs').update({ progress }).eq('id', jobId);
      }

      // Process ads for this account with Anti-Spy round-robin page distribution
      let adIndex = 0;
      for (const ad of ads) {
        const parentFbId = ad.parent_id ? idMap.get(ad.parent_id) : null;

        if (!parentFbId) {
          if (accountIndex === accountsToProcess - 1) {
            await supabase
              .from('campaign_job_items')
              .update({ status: 'failed', error_message: 'Parent adset failed' })
              .eq('id', ad.id);
          }
          processedItems++;
          hasError = true;
          adIndex++;
          continue;
        }

        // Anti-Spy: distribute pages round-robin across ads
        let currentPageId = defaultPageId;
        let currentInstagramUserId = defaultInstagramUserId;
        
        if (config.antiSpyEnabled && resolvedPages.length > 1) {
          // Round-robin: each ad gets a different page
          const pageIndex = adIndex % resolvedPages.length;
          const selectedPage = resolvedPages[pageIndex];
          currentPageId = selectedPage.pageId;
          currentInstagramUserId = selectedPage.instagramActorId;
          console.log(`[process-jobs] Anti-Spy: Ad ${adIndex + 1} using page ${currentPageId} (index ${pageIndex})`);
        }

        if (!currentPageId) {
          if (accountIndex === accountsToProcess - 1) {
            await supabase
              .from('campaign_job_items')
              .update({ status: 'failed', error_message: 'No page selected for ad' })
              .eq('id', ad.id);
          }
          processedItems++;
          hasError = true;
          lastError = 'No page selected';
          adIndex++;
          continue;
        }

        // Replace all variables in ad name
        let adName = replaceNamingVariables(ad.name);

        console.log(`[process-jobs] Creating ad: ${adName} with page: ${currentPageId} for account ${currentAccount.name}`);

        if (accountIndex === 0) {
          await supabase
            .from('campaign_job_items')
            .update({ status: 'processing' })
            .eq('id', ad.id);
        }

        const result = await createFacebookAd(accessToken, currentAccount.account_id, parentFbId, config, adName, currentPageId, currentInstagramUserId);

        if (result.success && result.id) {
          idMap.set(ad.id, result.id);
          
          if (accountIndex === accountsToProcess - 1) {
            await supabase
              .from('campaign_job_items')
              .update({ 
                status: 'completed', 
                facebook_id: isMultiAccountMode ? `${result.id} (+${accountsToProcess - 1})` : result.id 
              })
              .eq('id', ad.id);
          }
        } else {
          hasError = true;
          lastError = result.error || 'Unknown error';
          
          if (accountIndex === accountsToProcess - 1) {
            await supabase
              .from('campaign_job_items')
              .update({ status: 'failed', error_message: result.error })
              .eq('id', ad.id);
          }
        }

        adIndex++;
        processedItems++;
        const progress = Math.round((processedItems / totalItems) * 100);
        await supabase.from('campaign_jobs').update({ progress }).eq('id', jobId);
      }
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

    console.log(`[process-jobs] Job ${jobId} finished with status: ${finalStatus} (${accountsToProcess} accounts processed)`);

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
