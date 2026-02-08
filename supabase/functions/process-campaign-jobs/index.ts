import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Batch API Configuration
// Standard Access: 9,000 points per 5-min window per ad account
// Each POST operation = 3 points (based on FB documentation)
// QPS limit: 100 requests/second per account
const BATCH_CONFIG = {
  MAX_BATCH_SIZE: 50, // Facebook hard limit
  CAMPAIGN_BATCH_SIZE: 15, // Campaigns are heavier ops
  ADSET_BATCH_SIZE: 40, // Adsets can be batched more aggressively  
  AD_BATCH_SIZE: 40, // Ads with creatives
  CREATIVE_BATCH_SIZE: 40, // Creatives batch
  BATCH_DELAY_MS: 50, // Minimal delay (QPS allows 100/s)
  DYNAMIC_DELAY_ENABLED: true, // Enable adaptive delays based on usage
};

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

interface BatchRequestItem {
  method: string;
  relative_url: string;
  body?: string;
  name?: string; // For referencing in dependent requests
}

interface BatchResponseItem {
  code: number;
  headers?: Array<{ name: string; value: string }>;
  body: string;
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
// Points: 9,000 per 5 minutes, each POST = ~3 points
// At max speed (100 QPS), theoretical max = 27,000 points/min = far exceeds limit
// Safe target: stay under 80% usage, throttle progressively
const RATE_LIMIT_CONFIG = {
  MAX_USAGE_PERCENT: 80, // Pause at 80% to prevent hard blocks
  HARD_PAUSE_PERCENT: 90, // Full stop at 90%
  BACKOFF_THRESHOLD: 40, // Start slowing down earlier
  WINDOW_MS: 5 * 60 * 1000, // 5 minute window
  BASE_POINTS_PER_REQUEST: 3, // POST operations cost 3 points
  MAX_POINTS_PER_WINDOW: 9000, // Standard access limit
};

function parseRateLimitHeader(header: string | null): number {
  if (!header) return 0;
  
  try {
    const parsed = JSON.parse(header);
    if (parsed.acc_id_util_pct !== undefined) {
      return parseFloat(parsed.acc_id_util_pct);
    }
    const match = header.match(/acc_id_util_pct["\s:]+(\d+(?:\.\d+)?)/);
    if (match) {
      return parseFloat(match[1]);
    }
  } catch {
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
    rateLimitTracker.set(accountId, {
      usagePercent: Math.max(existing.usagePercent, usagePercent),
      lastUpdated: now,
      requestCount: existing.requestCount + 1,
      windowStart: existing.windowStart,
    });
  } else {
    rateLimitTracker.set(accountId, {
      usagePercent,
      lastUpdated: now,
      requestCount: 1,
      windowStart: now,
    });
  }
}

function shouldPauseForRateLimit(accountId: string): { 
  pause: boolean; 
  hardPause: boolean;
  usagePercent: number; 
  waitMs: number;
  batchSizeReduction: number; // Factor to reduce batch size (1 = no reduction)
} {
  const info = rateLimitTracker.get(accountId);
  if (!info) {
    return { pause: false, hardPause: false, usagePercent: 0, waitMs: 0, batchSizeReduction: 1 };
  }
  
  // Hard pause at 90%+ - wait for full window reset
  if (info.usagePercent >= RATE_LIMIT_CONFIG.HARD_PAUSE_PERCENT) {
    const remainingWindow = RATE_LIMIT_CONFIG.WINDOW_MS - (Date.now() - info.windowStart);
    const waitMs = Math.max(30000, Math.min(remainingWindow, 120000)); // 30s to 2min
    console.warn(`[rate-limit] HARD PAUSE at ${info.usagePercent.toFixed(1)}%, waiting ${Math.round(waitMs/1000)}s`);
    return { pause: true, hardPause: true, usagePercent: info.usagePercent, waitMs, batchSizeReduction: 0.25 };
  }
  
  // Soft pause at 80%+ - short pause then continue with reduced batch
  if (info.usagePercent >= RATE_LIMIT_CONFIG.MAX_USAGE_PERCENT) {
    const waitMs = Math.round((info.usagePercent - 70) * 500); // 5s-15s pause
    console.log(`[rate-limit] Soft pause at ${info.usagePercent.toFixed(1)}%, waiting ${Math.round(waitMs/1000)}s`);
    return { pause: true, hardPause: false, usagePercent: info.usagePercent, waitMs, batchSizeReduction: 0.5 };
  }
  
  // Progressive slowdown from 40% to 80%
  if (info.usagePercent >= RATE_LIMIT_CONFIG.BACKOFF_THRESHOLD) {
    const slowdownFactor = (info.usagePercent - RATE_LIMIT_CONFIG.BACKOFF_THRESHOLD) / 40; // 0 to 1
    const additionalDelay = Math.round(slowdownFactor * 200); // 0 to 200ms extra
    const batchReduction = 1 - (slowdownFactor * 0.3); // Reduce batch size up to 30%
    return { pause: false, hardPause: false, usagePercent: info.usagePercent, waitMs: additionalDelay, batchSizeReduction: batchReduction };
  }
  
  // Normal operation - full speed
  return { pause: false, hardPause: false, usagePercent: info.usagePercent, waitMs: 0, batchSizeReduction: 1 };
}

// Get a Page Access Token using the user's access token
async function getPageAccessTokenFromUserToken(
  userAccessToken: string,
  pageId: string,
): Promise<string | null> {
  if (pageTokenCache.has(pageId)) return pageTokenCache.get(pageId) ?? null;

  try {
    let url: string | null = `${GRAPH_BASE_URL}/me/accounts?fields=id,access_token&limit=500&access_token=${userAccessToken}`;

    for (let i = 0; i < 5 && url; i++) {
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok || json?.error) {
        console.warn(`[process-jobs] Could not fetch page tokens: ${json?.error?.message || 'unknown'}`);
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
    console.warn(`[process-jobs] Error fetching page access token:`, err);
    pageTokenCache.set(pageId, null);
    return null;
  }
}

// Resolve Instagram Actor ID for a Page
async function resolveInstagramActorIdForPage(params: {
  userAccessToken: string;
  pageId: string;
  pageAccessTokenFromDb?: string | null;
}): Promise<string | null> {
  const { userAccessToken, pageId, pageAccessTokenFromDb } = params;

  if (igActorIdCache.has(pageId)) return igActorIdCache.get(pageId) ?? null;

  try {
    const pageAccessToken = pageAccessTokenFromDb || (await getPageAccessTokenFromUserToken(userAccessToken, pageId));

    if (pageAccessToken) {
      // Try page_backed_instagram_accounts first
      const pbiaUrl = `${GRAPH_BASE_URL}/${pageId}/page_backed_instagram_accounts?fields=id,username&access_token=${pageAccessToken}`;
      const pbiaRes = await fetch(pbiaUrl);
      const pbiaJson = await pbiaRes.json();

      if (pbiaRes.ok && !pbiaJson?.error && Array.isArray(pbiaJson?.data) && pbiaJson.data.length > 0) {
        const igId = pbiaJson.data[0].id as string;
        console.log(`[process-jobs] Resolved Page-backed Instagram account ${igId}`);
        igActorIdCache.set(pageId, igId);
        return igId;
      }

      // Try instagram_accounts
      const iaUrl = `${GRAPH_BASE_URL}/${pageId}/instagram_accounts?fields=id,username&access_token=${pageAccessToken}`;
      const iaRes = await fetch(iaUrl);
      const iaJson = await iaRes.json();

      if (iaRes.ok && !iaJson?.error && Array.isArray(iaJson?.data) && iaJson.data.length > 0) {
        const igId = iaJson.data[0].id as string;
        igActorIdCache.set(pageId, igId);
        return igId;
      }
    }

    // Fallback: instagram_business_account
    const ibaUrl = `${GRAPH_BASE_URL}/${pageId}?fields=instagram_business_account&access_token=${userAccessToken}`;
    const ibaRes = await fetch(ibaUrl);
    const ibaJson = await ibaRes.json();

    if (ibaRes.ok && !ibaJson?.error && ibaJson?.instagram_business_account?.id) {
      const igId = ibaJson.instagram_business_account.id as string;
      igActorIdCache.set(pageId, igId);
      return igId;
    }

    igActorIdCache.set(pageId, null);
    return null;
  } catch (err) {
    console.error(`[process-jobs] Error resolving Instagram actor:`, err);
    igActorIdCache.set(pageId, null);
    return null;
  }
}

// Execute a batch request to Facebook Graph API with adaptive rate limiting
async function executeBatchRequest(
  accessToken: string,
  batch: BatchRequestItem[],
  accountId?: string,
): Promise<{ results: BatchResponseItem[]; usagePercent: number }> {
  if (batch.length === 0) return { results: [], usagePercent: 0 };
  
  let currentUsage = 0;
  
  // Check rate limits before batch
  if (accountId) {
    const rateLimitCheck = shouldPauseForRateLimit(accountId);
    currentUsage = rateLimitCheck.usagePercent;
    
    if (rateLimitCheck.hardPause) {
      console.warn(`[batch] Account ${accountId} HARD PAUSE at ${rateLimitCheck.usagePercent.toFixed(1)}%, waiting ${Math.round(rateLimitCheck.waitMs/1000)}s`);
      await sleep(rateLimitCheck.waitMs);
      // Reset tracking after hard pause
      rateLimitTracker.delete(accountId);
    } else if (rateLimitCheck.pause) {
      console.warn(`[batch] Account ${accountId} soft pause at ${rateLimitCheck.usagePercent.toFixed(1)}%, waiting ${Math.round(rateLimitCheck.waitMs/1000)}s`);
      await sleep(rateLimitCheck.waitMs);
    } else if (rateLimitCheck.waitMs > 0) {
      await sleep(rateLimitCheck.waitMs);
    }
  }

  const formData = new URLSearchParams();
  formData.append('access_token', accessToken);
  formData.append('batch', JSON.stringify(batch));
  formData.append('include_headers', 'true');

  console.log(`[batch] Executing batch request with ${batch.length} operations`);

  try {
    const res = await fetch(`${GRAPH_BASE_URL}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    // Parse rate limit from response header
    const rateLimitHeader = res.headers.get('x-ad-account-usage') || res.headers.get('X-Ad-Account-Usage');
    const rateLimitPercent = parseRateLimitHeader(rateLimitHeader);
    
    if (rateLimitPercent > 0 && accountId) {
      updateRateLimitInfo(accountId, rateLimitPercent);
      if (rateLimitPercent > 50) {
        console.log(`[batch] Account ${accountId} usage: ${rateLimitPercent.toFixed(1)}%`);
      }
    }

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[batch] Batch request failed with status ${res.status}:`, errorText);
      throw new Error(`Batch request failed: ${res.status}`);
    }

    const results: BatchResponseItem[] = await res.json();
    
    // Log any errors in batch responses
    let errorCount = 0;
    for (let i = 0; i < results.length; i++) {
      if (results[i].code >= 400) {
        errorCount++;
        console.warn(`[batch] Item ${i} failed with code ${results[i].code}`);
      }
    }
    
    if (errorCount > 0) {
      console.log(`[batch] Batch completed: ${results.length - errorCount}/${results.length} succeeded`);
    }

    return { results, usagePercent: rateLimitPercent };
  } catch (err: any) {
    console.error(`[batch] Batch request error:`, err);
    throw err;
  }
}

// Helper to get adaptive batch size based on current rate limit usage
function getAdaptiveBatchSize(baseBatchSize: number, accountId: string): number {
  const rateLimitCheck = shouldPauseForRateLimit(accountId);
  const adaptedSize = Math.max(5, Math.floor(baseBatchSize * rateLimitCheck.batchSizeReduction));
  return adaptedSize;
}

// Helper to chunk array into smaller arrays
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Build campaign creation params
function buildCampaignParams(config: Record<string, any>, name: string): Record<string, string> {
  const specialAdCategory = (config.specialAdCategory || 'NONE') as string;
  const specialAdCategories = [specialAdCategory];

  const params: Record<string, string> = {
    name,
    objective: config.objective || 'OUTCOME_SALES',
    status: config.isPaused ? 'PAUSED' : 'ACTIVE',
    special_ad_categories: JSON.stringify(specialAdCategories),
  };

  if (config.useCatalog && config.catalogId) {
    params.promoted_object = JSON.stringify({
      product_catalog_id: config.catalogId,
    });
  }

  if (config.useCBO) {
    params.daily_budget = String(Math.round((config.budget || 50) * 100));
    params.bid_strategy = config.bidStrategy || 'LOWEST_COST_WITHOUT_CAP';
  } else {
    params.is_adset_budget_sharing_enabled = 'false';
  }

  return params;
}

// Build adset creation params
function buildAdsetParams(
  campaignId: string,
  config: Record<string, any>,
  name: string,
): Record<string, string> {
  const targetingObj: Record<string, any> = {
    geo_locations: config.geoLocations || { countries: ['BR'] },
    age_min: config.ageMin || 18,
    age_max: config.ageMax || 65,
    locales: config.locales || [24],
    targeting_automation: {
      advantage_audience: config.advantagePlus ? 1 : 0,
    },
  };

  const params: Record<string, string> = {
    campaign_id: campaignId,
    name,
    status: 'ACTIVE',
    destination_type: 'WEBSITE',
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    bid_strategy: config.bidStrategy || 'LOWEST_COST_WITHOUT_CAP',
    targeting: JSON.stringify(targetingObj),
  };

  // Attribution settings
  const attributionSpec: Array<{ event_type: string; window_days: number }> = [];
  const clickDays = config.attributionClickDays ?? 7;
  attributionSpec.push({ event_type: 'CLICK_THROUGH', window_days: clickDays });
  
  const viewDays = config.attributionViewDays ?? 1;
  if (viewDays > 0) {
    attributionSpec.push({ event_type: 'VIEW_THROUGH', window_days: viewDays });
  }
  
  const engagedViewDays = config.attributionEngagedViewDays ?? 1;
  if (engagedViewDays > 0) {
    attributionSpec.push({ event_type: 'ENGAGED_VIDEO_VIEW', window_days: engagedViewDays });
  }
  
  if (attributionSpec.length > 0) {
    params.attribution_spec = JSON.stringify(attributionSpec);
  }

  // Schedule
  if (config.scheduleStart) {
    const startDate = typeof config.scheduleStart === 'string' 
      ? new Date(config.scheduleStart) 
      : config.scheduleStart;
    
    if (startDate instanceof Date && !isNaN(startDate.getTime())) {
      const year = startDate.getFullYear();
      const month = String(startDate.getMonth() + 1).padStart(2, '0');
      const day = String(startDate.getDate()).padStart(2, '0');
      const hours = String(startDate.getHours()).padStart(2, '0');
      const minutes = String(startDate.getMinutes()).padStart(2, '0');
      const seconds = String(startDate.getSeconds()).padStart(2, '0');
      params.start_time = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-05:00`;
    }
  }

  // ABO budget
  if (!config.useCBO) {
    params.daily_budget = String(Math.round((config.adsetBudget || 10) * 100));
  }

  // Promoted object
  const promotedObject: Record<string, any> = {};
  
  if (config.pixelId) {
    promotedObject.pixel_id = config.pixelId;
    promotedObject.custom_event_type = 'PURCHASE';
  }

  if (config.useCatalog && config.productSetId) {
    promotedObject.product_set_id = config.productSetId;
  }

  if (Object.keys(promotedObject).length > 0) {
    params.promoted_object = JSON.stringify(promotedObject);
  }

  return params;
}

// Build catalog ad creative params
function buildCatalogCreativeParams(
  config: Record<string, any>,
  name: string,
  pageId: string,
  instagramUserId: string | null,
): Record<string, string> {
  const finalDestinationUrl = config.destinationUrl || 'https://example.com';

  const templateData: Record<string, any> = {
    call_to_action: {
      type: config.ctaType || 'SHOP_NOW',
      value: { link: finalDestinationUrl },
    },
    link: finalDestinationUrl,
    message: config.primaryText || '{{product.name}}',
    name: config.headline || '{{product.name}}',
    description: config.description || '{{product.price}}',
    format_option: 'single_video',
  };

  const objectStorySpec: Record<string, any> = {
    page_id: pageId,
    template_data: templateData,
  };

  if (instagramUserId) {
    objectStorySpec.instagram_user_id = instagramUserId;
  }

  const degreesOfFreedomSpec = {
    creative_features_spec: {
      media_type_automation: {
        customizations: { video_crop_style: 'AUTO' },
        enroll_status: 'OPT_IN',
      },
    },
  };

  const params: Record<string, string> = {
    name: `Creative_${name}`,
    object_story_spec: JSON.stringify(objectStorySpec),
    product_set_id: config.productSetId,
    use_page_actor_override: 'true',
    degrees_of_freedom_spec: JSON.stringify(degreesOfFreedomSpec),
    template_url_spec: JSON.stringify({ web: { url: finalDestinationUrl } }),
    applink_treatment: 'web_only',
    contextual_multi_ads: JSON.stringify({
      enroll_status: config.multiAdvertiser ? 'OPT_IN' : 'OPT_OUT',
    }),
  };

  const urlParams = config.urlParams || '';
  if (urlParams && urlParams.trim()) {
    params.url_tags = urlParams.trim();
  }

  return params;
}

// Build ad params
function buildAdParams(
  adsetId: string,
  creativeId: string,
  name: string,
): Record<string, string> {
  return {
    name,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: 'ACTIVE',
  };
}

// Simple fetch with retry for non-batch operations
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxAttempts = 3,
  accountId?: string,
): Promise<{ ok: boolean; status: number; json: any; rateLimitPercent: number }> {
  if (accountId) {
    const rateLimitCheck = shouldPauseForRateLimit(accountId);
    if (rateLimitCheck.pause) {
      await sleep(rateLimitCheck.waitMs);
    } else if (rateLimitCheck.waitMs > 0) {
      await sleep(rateLimitCheck.waitMs);
    }
  }
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, options);
      const json = await res.json();
      
      const rateLimitHeader = res.headers.get('x-ad-account-usage') || res.headers.get('X-Ad-Account-Usage');
      const rateLimitPercent = parseRateLimitHeader(rateLimitHeader);
      
      if (rateLimitPercent > 0 && accountId) {
        updateRateLimitInfo(accountId, rateLimitPercent);
      }

      // Rate limit handling
      if (res.status === 429 || json.error?.code === 17 || json.error?.code === 4 || json.error?.code === 80004) {
        const waitMs = Math.min(30000, 2000 * Math.pow(2, attempt)) + Math.random() * 1000;
        console.warn(`[rate-limit] Rate limited, waiting ${Math.round(waitMs)}ms (attempt ${attempt}/${maxAttempts})`);
        await sleep(waitMs);
        continue;
      }

      return { ok: res.ok, status: res.status, json, rateLimitPercent };
    } catch (err: any) {
      if (attempt === maxAttempts) throw err;
      const waitMs = 1000 * attempt + Math.random() * 500;
      console.warn(`[fetch-retry] Network error, retrying in ${Math.round(waitMs)}ms:`, err.message);
      await sleep(waitMs);
    }
  }
  throw new Error('Max retries exceeded');
}

// Create campaigns using batch API
async function createCampaignsBatch(
  accessToken: string,
  adAccountId: string,
  campaigns: Array<{ id: string; name: string; config: Record<string, any> }>,
  config: Record<string, any>,
  supabase: any,
): Promise<Map<string, string>> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const idMap = new Map<string, string>();
  
  // Build batch requests
  const batchItems: Array<{ item: typeof campaigns[0]; batchItem: BatchRequestItem }> = [];
  
  for (let i = 0; i < campaigns.length; i++) {
    const campaign = campaigns[i];
    const params = buildCampaignParams(config, campaign.name);
    
    const body = new URLSearchParams(params).toString();
    
    batchItems.push({
      item: campaign,
      batchItem: {
        method: 'POST',
        relative_url: `${actId}/campaigns`,
        body,
        name: `campaign_${i}`,
      },
    });
  }

  // Execute in chunks with adaptive batch sizing
  const batchSize = getAdaptiveBatchSize(BATCH_CONFIG.CAMPAIGN_BATCH_SIZE, adAccountId);
  const chunks = chunkArray(batchItems, batchSize);
  
  console.log(`[batch] Creating ${campaigns.length} campaigns in ${chunks.length} batches (size: ${batchSize})`);
  
  for (const chunk of chunks) {
    const batch = chunk.map(c => c.batchItem);
    
    try {
      const { results } = await executeBatchRequest(accessToken, batch, adAccountId);
      
      // Process results
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const item = chunk[i].item;
        
        let parsedBody: any;
        try {
          parsedBody = JSON.parse(result.body);
        } catch {
          parsedBody = { error: { message: 'Failed to parse response' } };
        }
        
        if (result.code === 200 && parsedBody.id) {
          idMap.set(item.id, parsedBody.id);
          await supabase
            .from('campaign_job_items')
            .update({ status: 'completed', facebook_id: parsedBody.id })
            .eq('id', item.id);
        } else {
          const errorMsg = parsedBody.error?.message || `HTTP ${result.code}`;
          console.error(`[batch] Campaign failed:`, errorMsg);
          await supabase
            .from('campaign_job_items')
            .update({ status: 'failed', error_message: errorMsg })
            .eq('id', item.id);
        }
      }
    } catch (err: any) {
      console.error(`[batch] Campaign batch failed:`, err.message);
      for (const c of chunk) {
        await supabase
          .from('campaign_job_items')
          .update({ status: 'failed', error_message: err.message })
          .eq('id', c.item.id);
      }
    }
    
    await sleep(BATCH_CONFIG.BATCH_DELAY_MS);
  }
  
  return idMap;
}

// Create adsets using batch API
async function createAdsetsBatch(
  accessToken: string,
  adAccountId: string,
  adsets: Array<{ id: string; name: string; parent_id: string | null; config: Record<string, any> }>,
  campaignIdMap: Map<string, string>,
  config: Record<string, any>,
  supabase: any,
): Promise<Map<string, string>> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const idMap = new Map<string, string>();
  
  // Filter adsets with valid parent campaigns
  const validAdsets = adsets.filter(adset => {
    const parentFbId = adset.parent_id ? campaignIdMap.get(adset.parent_id) : null;
    if (!parentFbId) {
      supabase
        .from('campaign_job_items')
        .update({ status: 'failed', error_message: 'Parent campaign failed' })
        .eq('id', adset.id);
      return false;
    }
    return true;
  });
  
  // Build batch requests
  const batchItems: Array<{ item: typeof validAdsets[0]; batchItem: BatchRequestItem; parentFbId: string }> = [];
  
  for (let i = 0; i < validAdsets.length; i++) {
    const adset = validAdsets[i];
    const parentFbId = campaignIdMap.get(adset.parent_id!)!;
    const params = buildAdsetParams(parentFbId, config, adset.name);
    
    const body = new URLSearchParams(params).toString();
    
    batchItems.push({
      item: adset,
      parentFbId,
      batchItem: {
        method: 'POST',
        relative_url: `${actId}/adsets`,
        body,
        name: `adset_${i}`,
      },
    });
  }

  // Execute in chunks with adaptive batch sizing
  const batchSize = getAdaptiveBatchSize(BATCH_CONFIG.ADSET_BATCH_SIZE, adAccountId);
  const chunks = chunkArray(batchItems, batchSize);
  
  console.log(`[batch] Creating ${validAdsets.length} adsets in ${chunks.length} batches (size: ${batchSize})`);
  
  for (const chunk of chunks) {
    const batch = chunk.map(c => c.batchItem);
    
    try {
      const { results } = await executeBatchRequest(accessToken, batch, adAccountId);
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const item = chunk[i].item;
        
        let parsedBody: any;
        try {
          parsedBody = JSON.parse(result.body);
        } catch {
          parsedBody = { error: { message: 'Failed to parse response' } };
        }
        
        if (result.code === 200 && parsedBody.id) {
          idMap.set(item.id, parsedBody.id);
          await supabase
            .from('campaign_job_items')
            .update({ status: 'completed', facebook_id: parsedBody.id })
            .eq('id', item.id);
        } else {
          const errorMsg = parsedBody.error?.message || `HTTP ${result.code}`;
          console.error(`[batch] Adset failed:`, errorMsg);
          await supabase
            .from('campaign_job_items')
            .update({ status: 'failed', error_message: errorMsg })
            .eq('id', item.id);
        }
      }
    } catch (err: any) {
      console.error(`[batch] Adset batch failed:`, err.message);
      for (const c of chunk) {
        await supabase
          .from('campaign_job_items')
          .update({ status: 'failed', error_message: err.message })
          .eq('id', c.item.id);
      }
    }
    
    await sleep(BATCH_CONFIG.BATCH_DELAY_MS);
  }
  
  return idMap;
}

// Create catalog creatives using batch API
async function createCatalogCreativesBatch(
  accessToken: string,
  adAccountId: string,
  ads: Array<{ id: string; name: string; parent_id: string | null; config: Record<string, any> }>,
  config: Record<string, any>,
  pageId: string,
  instagramUserId: string | null,
  supabase: any,
): Promise<Map<string, string>> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const creativeIdMap = new Map<string, string>();
  
  // Build batch requests for creatives
  const batchItems: Array<{ item: typeof ads[0]; batchItem: BatchRequestItem }> = [];
  
  for (let i = 0; i < ads.length; i++) {
    const ad = ads[i];
    const params = buildCatalogCreativeParams(config, ad.name, pageId, instagramUserId);
    
    const body = new URLSearchParams(params).toString();
    
    batchItems.push({
      item: ad,
      batchItem: {
        method: 'POST',
        relative_url: `${actId}/adcreatives`,
        body,
        name: `creative_${i}`,
      },
    });
  }

  // Execute in chunks with adaptive batch sizing
  const batchSize = getAdaptiveBatchSize(BATCH_CONFIG.CREATIVE_BATCH_SIZE || BATCH_CONFIG.AD_BATCH_SIZE, adAccountId);
  const chunks = chunkArray(batchItems, batchSize);
  
  console.log(`[batch] Creating ${ads.length} creatives in ${chunks.length} batches (size: ${batchSize})`);
  
  for (const chunk of chunks) {
    const batch = chunk.map(c => c.batchItem);
    
    try {
      const { results } = await executeBatchRequest(accessToken, batch, adAccountId);
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const item = chunk[i].item;
        
        let parsedBody: any;
        try {
          parsedBody = JSON.parse(result.body);
        } catch {
          parsedBody = { error: { message: 'Failed to parse response' } };
        }
        
        if (result.code === 200 && parsedBody.id) {
          creativeIdMap.set(item.id, parsedBody.id);
        } else {
          const errorMsg = parsedBody.error?.message || `HTTP ${result.code}`;
          console.error(`[batch] Creative failed for ad ${item.id}:`, errorMsg);
          await supabase
            .from('campaign_job_items')
            .update({ status: 'failed', error_message: `Creative: ${errorMsg}` })
            .eq('id', item.id);
        }
      }
    } catch (err: any) {
      console.error(`[batch] Creative batch failed:`, err.message);
      for (const c of chunk) {
        await supabase
          .from('campaign_job_items')
          .update({ status: 'failed', error_message: `Creative batch: ${err.message}` })
          .eq('id', c.item.id);
      }
    }
    
    await sleep(BATCH_CONFIG.BATCH_DELAY_MS);
  }
  
  return creativeIdMap;
}

// Create ads using batch API (for catalog ads)
async function createAdsBatch(
  accessToken: string,
  adAccountId: string,
  ads: Array<{ id: string; name: string; parent_id: string | null; config: Record<string, any> }>,
  adsetIdMap: Map<string, string>,
  creativeIdMap: Map<string, string>,
  supabase: any,
): Promise<number> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  let successCount = 0;
  
  // Filter ads with valid parent adsets and creatives
  const validAds = ads.filter(ad => {
    const parentFbId = ad.parent_id ? adsetIdMap.get(ad.parent_id) : null;
    const creativeId = creativeIdMap.get(ad.id);
    
    if (!parentFbId) {
      supabase
        .from('campaign_job_items')
        .update({ status: 'failed', error_message: 'Parent adset failed' })
        .eq('id', ad.id);
      return false;
    }
    
    if (!creativeId) {
      // Creative already marked as failed, skip
      return false;
    }
    
    return true;
  });
  
  // Build batch requests
  const batchItems: Array<{ item: typeof validAds[0]; batchItem: BatchRequestItem }> = [];
  
  for (let i = 0; i < validAds.length; i++) {
    const ad = validAds[i];
    const parentFbId = adsetIdMap.get(ad.parent_id!)!;
    const creativeId = creativeIdMap.get(ad.id)!;
    const params = buildAdParams(parentFbId, creativeId, ad.name);
    
    const body = new URLSearchParams(params).toString();
    
    batchItems.push({
      item: ad,
      batchItem: {
        method: 'POST',
        relative_url: `${actId}/ads`,
        body,
        name: `ad_${i}`,
      },
    });
  }

  // Execute in chunks with adaptive batch sizing
  const batchSize = getAdaptiveBatchSize(BATCH_CONFIG.AD_BATCH_SIZE, adAccountId);
  const chunks = chunkArray(batchItems, batchSize);
  
  console.log(`[batch] Creating ${validAds.length} ads in ${chunks.length} batches (size: ${batchSize})`);
  
  for (const chunk of chunks) {
    const batch = chunk.map(c => c.batchItem);
    
    try {
      const { results } = await executeBatchRequest(accessToken, batch, adAccountId);
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const item = chunk[i].item;
        
        let parsedBody: any;
        try {
          parsedBody = JSON.parse(result.body);
        } catch {
          parsedBody = { error: { message: 'Failed to parse response' } };
        }
        
        if (result.code === 200 && parsedBody.id) {
          successCount++;
          await supabase
            .from('campaign_job_items')
            .update({ status: 'completed', facebook_id: parsedBody.id })
            .eq('id', item.id);
        } else {
          const errorMsg = parsedBody.error?.message || `HTTP ${result.code}`;
          console.error(`[batch] Ad failed:`, errorMsg);
          await supabase
            .from('campaign_job_items')
            .update({ status: 'failed', error_message: errorMsg })
            .eq('id', item.id);
        }
      }
    } catch (err: any) {
      console.error(`[batch] Ad batch failed:`, err.message);
      for (const c of chunk) {
        await supabase
          .from('campaign_job_items')
          .update({ status: 'failed', error_message: err.message })
          .eq('id', c.item.id);
      }
    }
    
    await sleep(BATCH_CONFIG.BATCH_DELAY_MS);
  }
  
  return successCount;
}

// Create non-catalog ad (video upload + creative + ad) - must be sequential per ad
async function createNonCatalogAd(
  accessToken: string,
  adAccountId: string,
  adsetId: string,
  config: Record<string, any>,
  name: string,
  pageId: string,
  instagramUserId: string | null,
  creative: { id: string; name: string; type: 'video' | 'image'; url: string; thumbnailUrl?: string },
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const finalDestinationUrl = config.destinationUrl || 'https://example.com';
  const urlParams = config.urlParams || '';

  let adCreativeId: string;

  if (creative.type === 'video') {
    // Upload video
    const videoUploadParams = new URLSearchParams({
      access_token: accessToken,
      file_url: creative.url,
      title: creative.name,
    });

    const videoUploadResult = await fetchWithRetry(
      `${GRAPH_BASE_URL}/${actId}/advideos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: videoUploadParams.toString(),
      },
      3,
      adAccountId,
    );

    if (!videoUploadResult.ok || videoUploadResult.json.error) {
      return { success: false, error: videoUploadResult.json?.error?.message || 'Video upload failed' };
    }

    const videoId = videoUploadResult.json.id;

    // Wait for video processing (max 30 seconds)
    for (let attempt = 0; attempt < 15; attempt++) {
      await sleep(2000);
      const statusResult = await fetchWithRetry(
        `${GRAPH_BASE_URL}/${videoId}?fields=status&access_token=${accessToken}`,
        { method: 'GET' },
        3,
        adAccountId,
      );

      if (statusResult.ok && statusResult.json.status?.video_status === 'ready') {
        break;
      }
    }

    // Create video creative
    const videoData: Record<string, any> = {
      video_id: videoId,
      call_to_action: { type: config.ctaType || 'LEARN_MORE', value: { link: finalDestinationUrl } },
      message: config.primaryText || '',
      title: config.headline || '',
      link_description: config.description || '',
      image_url: creative.thumbnailUrl || creative.url,
    };

    const objectStorySpec: Record<string, any> = { page_id: pageId, video_data: videoData };
    if (instagramUserId) objectStorySpec.instagram_user_id = instagramUserId;

    const creativeParams = new URLSearchParams({
      access_token: accessToken,
      name: `Creative_${name}`,
      object_story_spec: JSON.stringify(objectStorySpec),
      contextual_multi_ads: JSON.stringify({ enroll_status: config.multiAdvertiser ? 'OPT_IN' : 'OPT_OUT' }),
    });
    if (urlParams) creativeParams.append('url_tags', urlParams.trim());

    const creativeResult = await fetchWithRetry(
      `${GRAPH_BASE_URL}/${actId}/adcreatives`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: creativeParams.toString(),
      },
      3,
      adAccountId,
    );

    if (!creativeResult.ok || creativeResult.json.error) {
      return { success: false, error: creativeResult.json?.error?.message || 'Video creative failed' };
    }

    adCreativeId = creativeResult.json.id;
  } else {
    // Image creative
    const linkData: Record<string, any> = {
      link: finalDestinationUrl,
      picture: creative.url,
      message: config.primaryText || '',
      name: config.headline || '',
      description: config.description || '',
      call_to_action: { type: config.ctaType || 'LEARN_MORE', value: { link: finalDestinationUrl } },
    };

    const objectStorySpec: Record<string, any> = { page_id: pageId, link_data: linkData };
    if (instagramUserId) objectStorySpec.instagram_user_id = instagramUserId;

    const creativeParams = new URLSearchParams({
      access_token: accessToken,
      name: `Creative_${name}`,
      object_story_spec: JSON.stringify(objectStorySpec),
      contextual_multi_ads: JSON.stringify({ enroll_status: config.multiAdvertiser ? 'OPT_IN' : 'OPT_OUT' }),
    });
    if (urlParams) creativeParams.append('url_tags', urlParams.trim());

    const creativeResult = await fetchWithRetry(
      `${GRAPH_BASE_URL}/${actId}/adcreatives`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: creativeParams.toString(),
      },
      3,
      adAccountId,
    );

    if (!creativeResult.ok || creativeResult.json.error) {
      return { success: false, error: creativeResult.json?.error?.message || 'Image creative failed' };
    }

    adCreativeId = creativeResult.json.id;
  }

  // Create the ad
  const adParams = new URLSearchParams({
    access_token: accessToken,
    name,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: adCreativeId }),
    status: 'ACTIVE',
  });

  const adResult = await fetchWithRetry(
    `${GRAPH_BASE_URL}/${actId}/ads`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: adParams.toString(),
    },
    3,
    adAccountId,
  );

  if (!adResult.ok || adResult.json.error) {
    return { success: false, error: adResult.json?.error?.message || 'Ad creation failed' };
  }

  return { success: true, id: adResult.json.id };
}

// Naming variable replacer
function createNamingReplacer(
  account: { name: string; account_id: string },
  config: Record<string, any>,
  resolvedPages: Array<{ pageId: string }>,
  job: { total_campaigns: number },
) {
  const accountNickname = account.name?.split(' - ')[0] || account.name || 'Conta';
  const accountId = account.account_id?.replace('act_', '') || '';
  const productSetName = config.productSetName || '';
  const firstPageName = resolvedPages.length > 0 ? (config.pageNames?.[0] || resolvedPages[0]?.pageId || '') : '';

  const getFirstName = (fullName: string): string => fullName ? fullName.trim().split(/\s+/)[0] || fullName : '';
  const getAccountCode = (accountName: string): string => accountName ? accountName.trim().slice(0, 7) : '';

  return (name: string, context: { campaignIndex?: number; adsetIndex?: number; adIndex?: number; creativeName?: string } = {}): string => {
    let result = name;
    
    // Account variables
    result = result
      .replace(/\{\{conta_apelido\}\}/g, accountNickname)
      .replace(/\{\{conta_nome\}\}/g, account.name || '')
      .replace(/\{\{conta_codigo\}\}/g, getAccountCode(account.name || ''))
      .replace(/\{\{conta_id\}\}/g, accountId);
    
    // Page variables
    result = result
      .replace(/\{\{pagina_nome\}\}/g, firstPageName)
      .replace(/\{\{pagina_nome1\}\}/g, getFirstName(firstPageName));
    
    // Catalog variables
    result = result.replace(/\{\{conjunto_catalogo\}\}/g, productSetName);
    result = result.replace(/\{\{catalogo\}\}/g, (config.catalogName as string) || '');
    
    // Creative variables
    if (context.creativeName) {
      result = result.replace(/\{\{criativo\}\}/g, context.creativeName);
    }
    
    // Custom variables
    const customVars = config.customNamingVariables as Record<string, string> || {};
    for (const [key, value] of Object.entries(customVars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    
    // Date/time variables
    const now = new Date();
    result = result
      .replace(/\{\{ano\}\}/g, now.getFullYear().toString())
      .replace(/\{\{ano2\}\}/g, now.getFullYear().toString().slice(-2))
      .replace(/\{\{mes\}\}/g, String(now.getMonth() + 1).padStart(2, '0'))
      .replace(/\{\{dia\}\}/g, String(now.getDate()).padStart(2, '0'))
      .replace(/\{\{hora\}\}/g, String(now.getHours()).padStart(2, '0'))
      .replace(/\{\{minuto\}\}/g, String(now.getMinutes()).padStart(2, '0'));
    
    // Budget variable
    result = result.replace(/\{\{budget\}\}/g, config.useCBO ? 'CBO' : 'ABO');
    
    // Structure variable
    const structure = `${job.total_campaigns}-${config.adsetsPerCampaign || 1}-${config.adsPerAdset || 1}`;
    result = result.replace(/\{\{estrutura\}\}/g, structure);
    
    // Sequential variable
    result = result.replace(/\{\{sequencial(?::(\d+))?\}\}/g, (match, start) => {
      const startNum = start ? parseInt(start, 10) : 1;
      const currentIndex = context.campaignIndex ?? 0;
      const value = startNum + currentIndex;
      return start ? String(value).padStart(start.length, '0') : String(value).padStart(2, '0');
    });
    
    // Adset variable
    result = result.replace(/\{\{conjunto\}\}/g, () => String((context.adsetIndex ?? 0) + 1).padStart(2, '0'));
    
    return result;
  };
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

    // Parse job_id
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

    // Determine whether job items are already partitioned per ad account
    // (newer jobs include item.config.accountId for every campaign/adset/ad)
    const itemsHaveAccountId = items.some((i: any) => {
      const accountId = (i?.config as any)?.accountId;
      return typeof accountId === 'string' && accountId.trim().length > 0;
    });

    // Count ads to create (for usage limit check)
    const adsToCreate = items.filter((i) => i.item_type === 'ad').length;
    const accountsCount = job.accounts_count || 1;

    // If items already include per-account entries, do NOT multiply again.
    const totalAdsToCreate = itemsHaveAccountId ? adsToCreate : adsToCreate * accountsCount;

    // Check ad limits
    const { data: limitCheck } = await supabase
      .rpc('can_create_ads', { check_user_id: user.id, ads_to_create: totalAdsToCreate });

    const limitResult = limitCheck?.[0];
    if (limitResult && !limitResult.allowed && !limitResult.is_unlimited) {
      await supabase
        .from('campaign_jobs')
        .update({ status: 'failed', error_message: limitResult.message, completed_at: new Date().toISOString() })
        .eq('id', jobId);

      return new Response(JSON.stringify({ error: 'Ad limit exceeded', message: limitResult.message }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[process-jobs] Ad limit check passed. Creating ${totalAdsToCreate} ads.`);

    // Get config and accounts
    const config = job.config as Record<string, any>;
    const selectedAccountIds = config.selectedAccounts || [];

    if (selectedAccountIds.length === 0) {
      throw new Error('No ad accounts selected');
    }

    // Fetch ad accounts
    const { data: allAdAccounts, error: accError } = await supabase
      .from('facebook_ad_accounts')
      .select('id, account_id, profile_id, name')
      .in('id', selectedAccountIds);

    if (accError || !allAdAccounts || allAdAccounts.length === 0) {
      throw new Error('No ad accounts found');
    }

    console.log(`[process-jobs] Found ${allAdAccounts.length} ad accounts`);

    // Get first account's token for page resolution
    const firstAccountProfileId = allAdAccounts[0].profile_id;
    
    const { data: credentials } = await supabase
      .from('facebook_credentials')
      .select('access_token')
      .eq('profile_id', firstAccountProfileId)
      .single();

    let firstAccessToken: string | null = credentials?.access_token || null;
    if (!firstAccessToken) {
      const { data: fallbackProfile } = await supabase
        .from('facebook_profiles')
        .select('access_token')
        .eq('id', firstAccountProfileId)
        .single();
      firstAccessToken = fallbackProfile?.access_token || null;
    }

    // Resolve pages
    const resolvedPages: Array<{ pageId: string; accessToken: string | null; instagramActorId: string | null }> = [];

    if (config.selectedPages && config.selectedPages.length > 0 && firstAccessToken) {
      for (const selectedPageValue of config.selectedPages) {
        let { data: page } = await supabase
          .from('facebook_pages')
          .select('page_id, access_token')
          .eq('id', selectedPageValue)
          .single();

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
        }
      }
    }

    const defaultPageId = resolvedPages.length > 0 ? resolvedPages[0].pageId : '';
    const defaultInstagramUserId = resolvedPages.length > 0 ? resolvedPages[0].instagramActorId : null;

    // Separate items by type
    const campaigns = items.filter((i) => i.item_type === 'campaign');
    const adsets = items.filter((i) => i.item_type === 'adset');
    const ads = items.filter((i) => i.item_type === 'ad');

    const normalizeAccountId = (value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      return value.replace(/^act_/, '').trim();
    };

    const getItemAccountId = (item: any): string | null => {
      const raw = (item?.config as any)?.accountId;
      return normalizeAccountId(raw);
    };

    console.log(`[process-jobs] Processing ${campaigns.length} campaigns, ${adsets.length} adsets, ${ads.length} ads`);
    console.log(`[process-jobs] Using BATCH API for optimized processing`);

    const startTime = Date.now();
    let hasError = false;
    let lastError = '';
    let totalAdsCreated = 0;

    // Process each account
    for (let accountIndex = 0; accountIndex < allAdAccounts.length; accountIndex++) {
      const currentAccount = allAdAccounts[accountIndex];
      console.log(`[process-jobs] Processing account ${accountIndex + 1}/${allAdAccounts.length}: ${currentAccount.name}`);

      // Get access token
      const { data: accCredentials } = await supabase
        .from('facebook_credentials')
        .select('access_token')
        .eq('profile_id', currentAccount.profile_id)
        .single();

      let accessToken: string | null = accCredentials?.access_token || null;
      if (!accessToken) {
        const { data: fallbackProfile } = await supabase
          .from('facebook_profiles')
          .select('access_token')
          .eq('id', currentAccount.profile_id)
          .single();
        accessToken = fallbackProfile?.access_token || null;
      }

      if (!accessToken) {
        console.error(`[process-jobs] No access token for account ${currentAccount.name}`);
        hasError = true;
        lastError = `No access token for ${currentAccount.name}`;
        continue;
      }

      // Create naming replacer
      const replaceNamingVariables = createNamingReplacer(currentAccount, config, resolvedPages, job);

      const currentAccountId = normalizeAccountId(currentAccount.account_id);

      const campaignsForAccount =
        itemsHaveAccountId && currentAccountId
          ? campaigns.filter((c) => getItemAccountId(c) === currentAccountId)
          : campaigns;

      const adsetsForAccount =
        itemsHaveAccountId && currentAccountId
          ? adsets.filter((a) => getItemAccountId(a) === currentAccountId)
          : adsets;

      const adsForAccount =
        itemsHaveAccountId && currentAccountId
          ? ads.filter((a) => getItemAccountId(a) === currentAccountId)
          : ads;

      console.log(
        `[process-jobs] Account ${currentAccount.name}: ${campaignsForAccount.length} campaigns, ${adsetsForAccount.length} adsets, ${adsForAccount.length} ads`,
      );

      // Prepare campaigns with resolved names
      const campaignsWithNames = campaignsForAccount.map((c, i) => ({
        id: c.id,
        name: replaceNamingVariables(c.name, { campaignIndex: i }),
        config: c.config as Record<string, any>,
      }));

      // Create campaigns in batch
      console.log(`[process-jobs] Creating ${campaignsWithNames.length} campaigns via batch API...`);
      const campaignIdMap = await createCampaignsBatch(
        accessToken,
        currentAccount.account_id,
        campaignsWithNames,
        config,
        supabase,
      );
      console.log(`[process-jobs] Created ${campaignIdMap.size}/${campaignsWithNames.length} campaigns`);

      // Prepare adsets with resolved names
      const adsetsWithNames = adsetsForAccount.map((a, i) => ({
        id: a.id,
        name: replaceNamingVariables(a.name, { adsetIndex: i }),
        parent_id: a.parent_id,
        config: a.config as Record<string, any>,
      }));

      // Create adsets in batch
      console.log(`[process-jobs] Creating ${adsetsWithNames.length} adsets via batch API...`);
      const adsetIdMap = await createAdsetsBatch(
        accessToken,
        currentAccount.account_id,
        adsetsWithNames,
        campaignIdMap,
        config,
        supabase,
      );
      console.log(`[process-jobs] Created ${adsetIdMap.size}/${adsetsWithNames.length} adsets`);

      // Prepare ads with resolved names
      const adsWithNames = adsForAccount.map((a, i) => ({
        id: a.id,
        name: replaceNamingVariables(a.name, { adIndex: i }),
        parent_id: a.parent_id,
        config: a.config as Record<string, any>,
      }));

      // Create ads based on type (catalog vs non-catalog)
      if (config.useCatalog) {
        // Catalog ads: use batch API for creatives and ads
        console.log(`[process-jobs] Creating ${adsWithNames.length} catalog creatives via batch API...`);
        const creativeIdMap = await createCatalogCreativesBatch(
          accessToken,
          currentAccount.account_id,
          adsWithNames,
          config,
          defaultPageId,
          defaultInstagramUserId,
          supabase,
        );
        console.log(`[process-jobs] Created ${creativeIdMap.size}/${adsWithNames.length} creatives`);

        console.log(`[process-jobs] Creating ${adsWithNames.length} ads via batch API...`);
        const adsCreated = await createAdsBatch(
          accessToken,
          currentAccount.account_id,
          adsWithNames,
          adsetIdMap,
          creativeIdMap,
          supabase,
        );
        totalAdsCreated += adsCreated;
        console.log(`[process-jobs] Created ${adsCreated}/${adsWithNames.length} ads`);
      } else {
        // Non-catalog ads: sequential processing (video upload required)
        const selectedCreatives = config.selectedCreatives || [];
        console.log(`[process-jobs] Creating ${adsWithNames.length} non-catalog ads (sequential for video upload)...`);
        
        for (let adIndex = 0; adIndex < adsWithNames.length; adIndex++) {
          const ad = adsWithNames[adIndex];
          const parentFbId = ad.parent_id ? adsetIdMap.get(ad.parent_id) : null;

          if (!parentFbId) {
            await supabase
              .from('campaign_job_items')
              .update({ status: 'failed', error_message: 'Parent adset failed' })
              .eq('id', ad.id);
            continue;
          }

          // Get creative for this ad
          const creativeIndex = adIndex % selectedCreatives.length;
          const creative = selectedCreatives[creativeIndex];

          if (!creative) {
            await supabase
              .from('campaign_job_items')
              .update({ status: 'failed', error_message: 'No creative available' })
              .eq('id', ad.id);
            continue;
          }

          // Anti-spy page rotation
          let currentPageId = defaultPageId;
          let currentInstagramUserId = defaultInstagramUserId;
          
          if (config.antiSpyEnabled && resolvedPages.length > 1) {
            const pageIndex = adIndex % resolvedPages.length;
            currentPageId = resolvedPages[pageIndex].pageId;
            currentInstagramUserId = resolvedPages[pageIndex].instagramActorId;
          }

          const result = await createNonCatalogAd(
            accessToken,
            currentAccount.account_id,
            parentFbId,
            config,
            ad.name,
            currentPageId,
            currentInstagramUserId,
            creative,
          );

          if (result.success && result.id) {
            totalAdsCreated++;
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

          // Update progress
          const progress = Math.round(((adIndex + 1) / adsWithNames.length) * 100);
          await supabase.from('campaign_jobs').update({ progress }).eq('id', jobId);
        }
      }
    }

    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`[process-jobs] Job completed in ${elapsedSeconds} seconds. Created ${totalAdsCreated} ads total.`);

    // Increment ad usage
    if (totalAdsCreated > 0) {
      try {
        await supabase.rpc('increment_ad_usage', {
          p_user_id: user.id,
          p_ads_count: totalAdsCreated,
        });
      } catch (usageError) {
        console.error('[process-jobs] Failed to increment ad usage:', usageError);
      }
    }

    // Final status
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
        adsCreated: totalAdsCreated,
        elapsedSeconds,
        error: hasError ? lastError : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('[process-jobs] Fatal error:', error);

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
