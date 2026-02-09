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
  ADSET_BATCH_SIZE: 30, // Reduced to avoid timeouts  
  AD_BATCH_SIZE: 30, // Reduced to avoid timeouts
  CREATIVE_BATCH_SIZE: 20, // Reduced for catalog creatives (heavy operations)
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
// Strategy: 1) Check existing PBIA/IG accounts 2) Check instagram_business_account 3) Create PBIA
// If all fail, return null — the creative will be created without instagram_user_id,
// relying on use_page_actor_override + page_id in object_story_spec
async function resolveInstagramActorIdForPage(params: {
  userAccessToken: string;
  pageId: string;
  pageAccessTokenFromDb?: string | null;
}): Promise<string | null> {
  const { userAccessToken, pageId, pageAccessTokenFromDb } = params;

  if (igActorIdCache.has(pageId)) return igActorIdCache.get(pageId) ?? null;

  try {
    // Collect all available tokens to try
    const pageAccessToken = pageAccessTokenFromDb || (await getPageAccessTokenFromUserToken(userAccessToken, pageId));
    const tokensToTry = [pageAccessToken, userAccessToken].filter(Boolean) as string[];

    // Step 1: Check for existing Instagram accounts (PBIA, linked IG, business IG)
    for (const token of tokensToTry) {
      // Try page_backed_instagram_accounts
      try {
        const pbiaUrl = `${GRAPH_BASE_URL}/${pageId}/page_backed_instagram_accounts?fields=id,username&access_token=${token}`;
        const pbiaRes = await fetch(pbiaUrl);
        const pbiaJson = await pbiaRes.json();
        if (pbiaRes.ok && !pbiaJson?.error && Array.isArray(pbiaJson?.data) && pbiaJson.data.length > 0) {
          const igId = pbiaJson.data[0].id as string;
          console.log(`[process-jobs] Resolved existing PBIA ${igId} for page ${pageId}`);
          igActorIdCache.set(pageId, igId);
          return igId;
        }
      } catch (e) { /* continue */ }

      // Try instagram_accounts (linked via page settings)
      try {
        const iaUrl = `${GRAPH_BASE_URL}/${pageId}/instagram_accounts?fields=id,username&access_token=${token}`;
        const iaRes = await fetch(iaUrl);
        const iaJson = await iaRes.json();
        if (iaRes.ok && !iaJson?.error && Array.isArray(iaJson?.data) && iaJson.data.length > 0) {
          const igId = iaJson.data[0].id as string;
          console.log(`[process-jobs] Resolved linked Instagram account ${igId} for page ${pageId}`);
          igActorIdCache.set(pageId, igId);
          return igId;
        }
      } catch (e) { /* continue */ }
    }

    // Step 2: Try instagram_business_account via page fields
    try {
      const ibaUrl = `${GRAPH_BASE_URL}/${pageId}?fields=instagram_business_account&access_token=${userAccessToken}`;
      const ibaRes = await fetch(ibaUrl);
      const ibaJson = await ibaRes.json();
      if (ibaRes.ok && !ibaJson?.error && ibaJson?.instagram_business_account?.id) {
        const igId = ibaJson.instagram_business_account.id as string;
        console.log(`[process-jobs] Resolved Instagram Business Account ${igId} for page ${pageId}`);
        igActorIdCache.set(pageId, igId);
        return igId;
      }
    } catch (e) { /* continue */ }

    // Step 3: Create PBIA — try with each available token
    for (const token of tokensToTry) {
      try {
        console.log(`[process-jobs] Creating PBIA for page ${pageId}...`);
        const createUrl = `${GRAPH_BASE_URL}/${pageId}/page_backed_instagram_accounts?access_token=${token}`;
        const createRes = await fetch(createUrl, { method: 'POST' });
        const createJson = await createRes.json();

        if (createRes.ok && !createJson?.error && createJson?.id) {
          const igId = createJson.id as string;
          console.log(`[process-jobs] Created PBIA ${igId} for page ${pageId}`);
          igActorIdCache.set(pageId, igId);
          return igId;
        }

        // If PBIA creation returns data array (some API versions), check it
        if (createRes.ok && Array.isArray(createJson?.data) && createJson.data.length > 0 && createJson.data[0]?.id) {
          const igId = createJson.data[0].id as string;
          console.log(`[process-jobs] Created PBIA (array response) ${igId} for page ${pageId}`);
          igActorIdCache.set(pageId, igId);
          return igId;
        }

        console.warn(`[process-jobs] PBIA creation attempt failed for page ${pageId}:`, JSON.stringify(createJson?.error || createJson).substring(0, 300));
      } catch (e) {
        console.warn(`[process-jobs] PBIA creation exception for page ${pageId}:`, e);
      }
    }

    // Step 4: After creating PBIA, re-check if it now exists (some APIs have eventual consistency)
    if (pageAccessToken) {
      try {
        const recheckUrl = `${GRAPH_BASE_URL}/${pageId}/page_backed_instagram_accounts?fields=id&access_token=${pageAccessToken}`;
        const recheckRes = await fetch(recheckUrl);
        const recheckJson = await recheckRes.json();
        if (recheckRes.ok && Array.isArray(recheckJson?.data) && recheckJson.data.length > 0) {
          const igId = recheckJson.data[0].id as string;
          console.log(`[process-jobs] Found PBIA ${igId} on recheck for page ${pageId}`);
          igActorIdCache.set(pageId, igId);
          return igId;
        }
      } catch (e) { /* continue */ }
    }

    console.warn(`[process-jobs] Could not resolve Instagram identity for page ${pageId}. Creative will use page_id + use_page_actor_override only.`);
    igActorIdCache.set(pageId, null);
    return null;
  } catch (err) {
    console.error(`[process-jobs] Error resolving Instagram actor for page ${pageId}:`, err);
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
        let errDetail = '';
        try { const b = JSON.parse(results[i].body); errDetail = JSON.stringify(b.error || b).substring(0, 500); } catch { errDetail = String(results[i].body).substring(0, 300); }
        console.warn(`[batch] Item ${i} failed with code ${results[i].code}: ${errDetail}`);
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

// Page capacity tracking for smart distribution
interface PageWithCapacity {
  pageId: string;
  accessToken: string | null;
  instagramActorId: string | null;
  adsRunning: number;
  adsLimit: number;
  availableSlots: number;
  assignedAds: number; // Track how many ads we've assigned to this page
}

/**
 * Smart page distribution that respects individual page limits.
 * Pre-calculates which page each ad should go to, ensuring no page exceeds its limit.
 * Returns an array of page assignments matching the ads array indices.
 */
function calculateSmartPageDistribution(
  adsCount: number,
  pages: PageWithCapacity[],
): Array<{ pageId: string; instagramActorId: string | null }> {
  if (pages.length === 0 || adsCount === 0) {
    return [];
  }

  // Single page - simple assignment
  if (pages.length === 1) {
    const page = pages[0];
    return Array(adsCount).fill({ 
      pageId: page.pageId, 
      instagramActorId: page.instagramActorId 
    });
  }

  // Reset assigned ads counter for this distribution
  const pagesWithTracking = pages.map(p => ({ ...p, assignedAds: 0 }));
  
  const assignments: Array<{ pageId: string; instagramActorId: string | null }> = [];
  
  // Sort pages by available capacity (descending) for better initial distribution
  const sortedPages = [...pagesWithTracking].sort((a, b) => b.availableSlots - a.availableSlots);
  
  // Calculate total available capacity
  const totalCapacity = sortedPages.reduce((sum, p) => sum + p.availableSlots, 0);
  
  console.log(`[smart-distribution] Distributing ${adsCount} ads across ${pages.length} pages (total capacity: ${totalCapacity})`);
  
  // Warn if we don't have enough capacity (shouldn't happen if frontend validates)
  if (adsCount > totalCapacity) {
    console.warn(`[smart-distribution] WARNING: Requested ${adsCount} ads but only ${totalCapacity} slots available!`);
  }
  
  // Use round-robin with capacity checking
  let pageIndex = 0;
  let consecutiveSkips = 0;
  
  for (let i = 0; i < adsCount; i++) {
    // Find a page with available capacity
    let attempts = 0;
    let assigned = false;
    
    while (attempts < sortedPages.length && !assigned) {
      const page = sortedPages[pageIndex];
      const remainingCapacity = page.availableSlots - page.assignedAds;
      
      if (remainingCapacity > 0) {
        // Assign to this page
        assignments.push({
          pageId: page.pageId,
          instagramActorId: page.instagramActorId,
        });
        page.assignedAds++;
        assigned = true;
        consecutiveSkips = 0;
      } else {
        consecutiveSkips++;
      }
      
      // Move to next page (round-robin)
      pageIndex = (pageIndex + 1) % sortedPages.length;
      attempts++;
    }
    
    // If no page had capacity (shouldn't happen if validated), use first page anyway
    if (!assigned) {
      const fallbackPage = sortedPages[0];
      console.warn(`[smart-distribution] No capacity available for ad ${i}, using fallback page ${fallbackPage.pageId}`);
      assignments.push({
        pageId: fallbackPage.pageId,
        instagramActorId: fallbackPage.instagramActorId,
      });
      fallbackPage.assignedAds++;
    }
  }
  
  // Log distribution summary
  const distributionSummary = sortedPages
    .filter(p => p.assignedAds > 0)
    .map(p => `${p.pageId}: ${p.assignedAds}/${p.availableSlots}`)
    .join(', ');
  console.log(`[smart-distribution] Distribution: ${distributionSummary}`);
  
  return assignments;
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

  // DLO with asset_customization_rules requires is_dynamic_creative = false
  // (Dynamic Creative = true is for mix-and-match; Asset Customization Rules = false)
  if (config.languageConfig?.enabled && !config.useCatalog) {
    params.is_dynamic_creative = 'false';
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
// CRITICAL: This function now checks for existing facebook_id to prevent duplicates on re-execution
async function createCampaignsBatch(
  accessToken: string,
  adAccountId: string,
  campaigns: Array<{ id: string; name: string; config: Record<string, any>; facebook_id?: string | null }>,
  config: Record<string, any>,
  supabase: any,
  shouldYield?: () => boolean,
): Promise<Map<string, string>> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const idMap = new Map<string, string>();
  
  // CRITICAL: Check for campaigns that already have facebook_id (from previous execution)
  // This prevents creating duplicate campaigns when job resumes after timeout
  const campaignsNeedingCreation: typeof campaigns = [];
  
  for (const campaign of campaigns) {
    // Check both facebook_id from DB and savedFacebookId in config
    const existingFbId = campaign.facebook_id || (campaign.config as any)?.savedFacebookId;
    if (existingFbId) {
      // Campaign already created in previous execution, reuse it
      idMap.set(campaign.id, existingFbId);
      console.log(`[batch] Reusing existing campaign ${existingFbId} for item ${campaign.id}`);
      
      // Ensure it's marked as completed
      await supabase
        .from('campaign_job_items')
        .update({ status: 'completed', facebook_id: existingFbId })
        .eq('id', campaign.id);
    } else {
      campaignsNeedingCreation.push(campaign);
    }
  }
  
  if (campaignsNeedingCreation.length === 0) {
    console.log(`[batch] All ${campaigns.length} campaigns already exist, skipping creation`);
    return idMap;
  }
  
  console.log(`[batch] Creating ${campaignsNeedingCreation.length} campaigns (${campaigns.length - campaignsNeedingCreation.length} already exist)`);
  
  // Build batch requests
  const batchItems: Array<{ item: typeof campaignsNeedingCreation[0]; batchItem: BatchRequestItem }> = [];
  
  for (let i = 0; i < campaignsNeedingCreation.length; i++) {
    const campaign = campaignsNeedingCreation[i];
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
  
  console.log(`[batch] Creating ${campaignsNeedingCreation.length} campaigns in ${chunks.length} batches (size: ${batchSize})`);
  
  for (const chunk of chunks) {
    if (shouldYield?.()) {
      console.log(`[batch] Time limit approaching, yielding after ${idMap.size} campaigns`);
      break;
    }
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
          
          // CRITICAL: Save facebook_id to both column AND config for redundancy
          const updatedConfig = { ...item.config, savedFacebookId: parsedBody.id };
          await supabase
            .from('campaign_job_items')
            .update({ status: 'completed', facebook_id: parsedBody.id, config: updatedConfig })
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
// CRITICAL: This function now checks for existing facebook_id to prevent duplicates on re-execution
async function createAdsetsBatch(
  accessToken: string,
  adAccountId: string,
  adsets: Array<{ id: string; name: string; parent_id: string | null; config: Record<string, any>; facebook_id?: string | null }>,
  campaignIdMap: Map<string, string>,
  config: Record<string, any>,
  supabase: any,
  shouldYield?: () => boolean,
): Promise<Map<string, string>> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const idMap = new Map<string, string>();
  
  // CRITICAL: Check for adsets that already have facebook_id (from previous execution)
  // This prevents creating duplicate adsets when job resumes after timeout
  const adsetsNeedingCreation: typeof adsets = [];
  
  for (const adset of adsets) {
    // Check both facebook_id from DB and savedFacebookId in config
    const existingFbId = adset.facebook_id || (adset.config as any)?.savedFacebookId;
    if (existingFbId) {
      // Adset already created in previous execution, reuse it
      idMap.set(adset.id, existingFbId);
      console.log(`[batch] Reusing existing adset ${existingFbId} for item ${adset.id}`);
      
      // Ensure it's marked as completed
      await supabase
        .from('campaign_job_items')
        .update({ status: 'completed', facebook_id: existingFbId })
        .eq('id', adset.id);
    } else {
      adsetsNeedingCreation.push(adset);
    }
  }
  
  if (adsetsNeedingCreation.length === 0) {
    console.log(`[batch] All ${adsets.length} adsets already exist, skipping creation`);
    return idMap;
  }
  
  console.log(`[batch] Creating ${adsetsNeedingCreation.length} adsets (${adsets.length - adsetsNeedingCreation.length} already exist)`);
  
  // Filter adsets with valid parent campaigns
  const validAdsets = adsetsNeedingCreation.filter(adset => {
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
    if (shouldYield?.()) {
      console.log(`[batch] Time limit approaching, yielding after ${idMap.size} adsets`);
      break;
    }
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
          
          // CRITICAL: Save facebook_id to both column AND config for redundancy
          const updatedConfig = { ...item.config, savedFacebookId: parsedBody.id };
          await supabase
            .from('campaign_job_items')
            .update({ status: 'completed', facebook_id: parsedBody.id, config: updatedConfig })
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

// Create catalog creatives using batch API with smart page distribution
// CRITICAL: This function now checks for existing creative_id in config to prevent duplicates on re-execution
async function createCatalogCreativesBatch(
  accessToken: string,
  adAccountId: string,
  ads: Array<{ id: string; name: string; parent_id: string | null; config: Record<string, any> }>,
  config: Record<string, any>,
  resolvedPages: PageWithCapacity[],
  defaultPageId: string,
  defaultInstagramUserId: string | null,
  supabase: any,
  shouldYield?: () => boolean,
): Promise<Map<string, string>> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const creativeIdMap = new Map<string, string>();
  
  // CRITICAL: Check for ads that already have a creative_id saved (from previous execution)
  // This prevents creating duplicate creatives when job resumes after timeout
  const adsNeedingCreatives: typeof ads = [];
  
  for (const ad of ads) {
    const existingCreativeId = ad.config?.savedCreativeId;
    if (existingCreativeId) {
      // Creative already created in previous execution, reuse it
      creativeIdMap.set(ad.id, existingCreativeId);
      console.log(`[batch] Reusing existing creative ${existingCreativeId} for ad ${ad.id}`);
    } else {
      adsNeedingCreatives.push(ad);
    }
  }
  
  if (adsNeedingCreatives.length === 0) {
    console.log(`[batch] All ${ads.length} ads already have creatives, skipping creation`);
    return creativeIdMap;
  }
  
  console.log(`[batch] Creating creatives for ${adsNeedingCreatives.length} ads (${ads.length - adsNeedingCreatives.length} already have creatives)`);
  
  // Calculate smart page distribution if anti-spy is enabled
  let pageAssignments: Array<{ pageId: string; instagramActorId: string | null }> = [];
  
  if (config.antiSpyEnabled && resolvedPages.length > 1) {
    pageAssignments = calculateSmartPageDistribution(adsNeedingCreatives.length, resolvedPages);
  }
  
  // Build batch requests for creatives with smart page distribution
  const batchItems: Array<{ item: typeof adsNeedingCreatives[0]; batchItem: BatchRequestItem }> = [];
  
  for (let i = 0; i < adsNeedingCreatives.length; i++) {
    const ad = adsNeedingCreatives[i];
    
    // Use smart distribution if available, otherwise use default
    let currentPageId = defaultPageId;
    let currentInstagramUserId = defaultInstagramUserId;
    
    if (pageAssignments.length > 0 && pageAssignments[i]) {
      currentPageId = pageAssignments[i].pageId;
      currentInstagramUserId = pageAssignments[i].instagramActorId;
    }
    
    const params = buildCatalogCreativeParams(config, ad.name, currentPageId, currentInstagramUserId);
    
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
  
  console.log(`[batch] Creating ${adsNeedingCreatives.length} creatives in ${chunks.length} batches (size: ${batchSize})`);
  
  for (const chunk of chunks) {
    if (shouldYield?.()) {
      console.log(`[batch] Time limit approaching, yielding after ${creativeIdMap.size} creatives`);
      break;
    }
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
          
          // CRITICAL: Save the creative_id to config so we can reuse it if job restarts
          // This prevents duplicate creatives on re-execution after timeout
          const updatedConfig = { ...item.config, savedCreativeId: parsedBody.id };
          await supabase
            .from('campaign_job_items')
            .update({ config: updatedConfig })
            .eq('id', item.id);
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
// CRITICAL: This function now checks for existing facebook_id to prevent duplicates on re-execution
async function createAdsBatch(
  accessToken: string,
  adAccountId: string,
  ads: Array<{ id: string; name: string; parent_id: string | null; config: Record<string, any>; facebook_id?: string | null; status?: string }>,
  adsetIdMap: Map<string, string>,
  creativeIdMap: Map<string, string>,
  supabase: any,
  retryContext?: {
    config: Record<string, any>;
    defaultPageId: string;
    resolvedPages: PageWithCapacity[];
  },
  shouldYield?: () => boolean,
): Promise<number> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  let successCount = 0;
  
  // CRITICAL IDEMPOTENCY CHECK: Check for ads that already have facebook_id (from previous execution)
  const adsNeedingCreation: typeof ads = [];
  
  for (const ad of ads) {
    const existingFbId = ad.facebook_id || (ad.config as any)?.savedAdId;
    if (existingFbId || ad.status === 'completed') {
      successCount++;
      console.log(`[batch] SKIPPING existing ad ${existingFbId || 'completed'} for item ${ad.id}`);
      if (existingFbId) {
        await supabase
          .from('campaign_job_items')
          .update({ status: 'completed', facebook_id: existingFbId })
          .eq('id', ad.id);
      }
      continue;
    }
    adsNeedingCreation.push(ad);
  }
  
  if (adsNeedingCreation.length === 0) {
    console.log(`[batch] All ${ads.length} ads already exist, skipping creation`);
    return successCount;
  }
  
  console.log(`[batch] Creating ${adsNeedingCreation.length} NEW ads (${ads.length - adsNeedingCreation.length} already exist)`);
  
  // Filter ads with valid parent adsets and creatives
  const validAds = adsNeedingCreation.filter(ad => {
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
  
  // Track ads that failed due to missing Instagram identity for retry
  const instagramRetryAds: typeof validAds = [];
  
  for (const chunk of chunks) {
    if (shouldYield?.()) {
      console.log(`[batch] Time limit approaching, yielding after ${successCount} ads`);
      break;
    }
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
          const updatedConfig = { ...item.config, savedAdId: parsedBody.id };
          await supabase
            .from('campaign_job_items')
            .update({ status: 'completed', facebook_id: parsedBody.id, config: updatedConfig })
            .eq('id', item.id);
        } else {
          const errorSubcode = parsedBody.error?.error_subcode;
          const errorCode = parsedBody.error?.code;
          
          // Check if this is an Instagram identity error (1772103) — eligible for PBIA retry
          if ((errorSubcode === 1772103 || (errorCode === 100 && errorSubcode === 1772103)) && retryContext) {
            console.warn(`[batch] Ad ${item.id} failed with Instagram identity error, queuing for PBIA retry`);
            instagramRetryAds.push(item);
          } else {
            const errorMsg = parsedBody.error?.message || `HTTP ${result.code}`;
            const errorDetail = parsedBody.error?.error_user_title 
              ? `${parsedBody.error.error_user_title}: ${parsedBody.error.error_user_msg || errorMsg}`
              : errorMsg;
            const fullError = JSON.stringify(parsedBody.error || parsedBody).substring(0, 500);
            console.error(`[batch] Ad failed for item ${item.id}:`, fullError);
            console.error(`[batch] Ad request body was:`, JSON.stringify(chunk[i].batchItem.body).substring(0, 500));
            await supabase
              .from('campaign_job_items')
              .update({ status: 'failed', error_message: errorDetail })
              .eq('id', item.id);
          }
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
  
  // RETRY: Handle Instagram identity errors by resolving PBIA and recreating creative + ad
  if (instagramRetryAds.length > 0 && retryContext) {
    console.log(`[batch] Retrying ${instagramRetryAds.length} ads with Instagram identity resolution (PBIA)...`);
    
    const { config, defaultPageId, resolvedPages } = retryContext;
    
    // Clear Instagram actor cache to force re-resolution
    igActorIdCache.delete(defaultPageId);
    for (const page of resolvedPages) {
      igActorIdCache.delete(page.pageId);
    }
    
    // Re-resolve Instagram actor IDs — this will create PBIAs if needed
    for (const page of resolvedPages) {
      const newIgId = await resolveInstagramActorIdForPage({
        userAccessToken: accessToken,
        pageId: page.pageId,
        pageAccessTokenFromDb: page.accessToken,
      });
      page.instagramActorId = newIgId;
      console.log(`[batch] Re-resolved Instagram for page ${page.pageId}: ${newIgId || 'null'}`);
    }
    
    const retryDefaultIgId = resolvedPages.length > 0 ? resolvedPages[0].instagramActorId : null;
    
    if (retryDefaultIgId) {
      // Recreate creatives WITH instagram_user_id for the retry ads
      const retryCreativeMap = await createCatalogCreativesBatch(
        accessToken,
        adAccountId,
        instagramRetryAds.map(ad => ({
          ...ad,
          config: { ...ad.config, savedCreativeId: undefined }, // Force new creative
        })),
        config,
        resolvedPages,
        defaultPageId,
        retryDefaultIgId,
        supabase,
      );
      
      // Retry ad creation with new creatives
      for (const ad of instagramRetryAds) {
        const newCreativeId = retryCreativeMap.get(ad.id);
        if (!newCreativeId) {
          await supabase
            .from('campaign_job_items')
            .update({ status: 'failed', error_message: 'Retry: falha ao recriar criativo com identidade Instagram (PBIA)' })
            .eq('id', ad.id);
          continue;
        }
        
        const parentFbId = ad.parent_id ? adsetIdMap.get(ad.parent_id) : null;
        if (!parentFbId) continue;
        
        const adParams = buildAdParams(parentFbId, newCreativeId, ad.name);
        const adBody = new URLSearchParams(adParams).toString();
        
        try {
          const { results } = await executeBatchRequest(accessToken, [{
            method: 'POST',
            relative_url: `${actId}/ads`,
            body: adBody,
            name: `ad_retry_${ad.id}`,
          }], adAccountId);
          
          const res = results[0];
          let body: any;
          try { body = JSON.parse(res.body); } catch { body = {}; }
          
          if (res.code === 200 && body.id) {
            successCount++;
            const updatedConfig = { ...ad.config, savedAdId: body.id, savedCreativeId: newCreativeId };
            await supabase
              .from('campaign_job_items')
              .update({ status: 'completed', facebook_id: body.id, config: updatedConfig })
              .eq('id', ad.id);
            console.log(`[batch] RETRY SUCCESS: Ad ${body.id} created for item ${ad.id}`);
          } else {
            const errMsg = body.error?.error_user_title 
              ? `${body.error.error_user_title}: ${body.error.error_user_msg || body.error?.message}`
              : (body.error?.message || `HTTP ${res.code}`);
            console.error(`[batch] RETRY FAILED for ad ${ad.id}:`, JSON.stringify(body.error || body).substring(0, 300));
            await supabase
              .from('campaign_job_items')
              .update({ status: 'failed', error_message: `Retry: ${errMsg}` })
              .eq('id', ad.id);
          }
        } catch (retryErr: any) {
          console.error(`[batch] RETRY exception for ad ${ad.id}:`, retryErr.message);
          await supabase
            .from('campaign_job_items')
            .update({ status: 'failed', error_message: `Retry: ${retryErr.message}` })
            .eq('id', ad.id);
        }
      }
    } else {
      // Could not resolve Instagram even after retry — mark all as failed with clear error
      console.error(`[batch] PBIA retry failed: could not resolve any Instagram identity`);
      for (const ad of instagramRetryAds) {
        await supabase
          .from('campaign_job_items')
          .update({ 
            status: 'failed', 
            error_message: 'Não foi possível resolver identidade Instagram. Verifique se a Página tem permissão para criar Page-Backed Instagram Account.' 
          })
          .eq('id', ad.id);
      }
    }
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

// Upload DLO media once per ad account (shared across all ads)
// Returns a map of locale -> video_id or image_hash
async function uploadDLOMediaForAccount(
  accessToken: string,
  adAccountId: string,
  config: Record<string, any>,
  savedMediaIds: Record<string, string>,
): Promise<{
  mediaMap: Record<string, string>;
  mediaType: 'video' | 'image';
}> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const languageConfig = config.languageConfig;
  const defaultLang = languageConfig.defaultLanguage;
  const secondaryLangs: any[] = languageConfig.secondaryLanguages || [];
  const allLangs = [defaultLang, ...secondaryLangs];

  const firstCreative = (config.selectedCreatives || [])[0];
  const isVideo = defaultLang.mediaType === 'video' || firstCreative?.type === 'video';

  const mediaMap: Record<string, string> = { ...savedMediaIds };

  for (const lang of allLangs) {
    const localeKey = String(lang.locale);

    // Idempotency: already uploaded?
    if (mediaMap[localeKey]) continue;

    // Determine media URL (own or fallback to default)
    const mediaUrl = lang.mediaUrl || defaultLang.mediaUrl || firstCreative?.url;
    if (!mediaUrl) continue;

    // OPTIMIZATION: If this locale uses the same URL as default, reuse the already-uploaded ID
    const defaultLocaleKey = String(defaultLang.locale);
    const defaultUrl = defaultLang.mediaUrl || firstCreative?.url;
    if (localeKey !== defaultLocaleKey && mediaUrl === defaultUrl && mediaMap[defaultLocaleKey]) {
      mediaMap[localeKey] = mediaMap[defaultLocaleKey];
      console.log(`[DLO] Locale ${localeKey} reusing default media: ${mediaMap[localeKey]}`);
      continue;
    }

    if (isVideo) {
      const uploadParams = new URLSearchParams({
        access_token: accessToken,
        file_url: mediaUrl,
        title: `DLO_${localeKey}`,
      });

      const result = await fetchWithRetry(
        `${GRAPH_BASE_URL}/${actId}/advideos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: uploadParams.toString(),
        },
        3,
        adAccountId,
      );

      if (!result.ok || result.json.error || !result.json.id) {
        throw new Error(`Video upload failed for locale ${localeKey}: ${result.json?.error?.message || 'unknown'}`);
      }

      const videoId = result.json.id;

      // Wait for video to be ready
      for (let attempt = 0; attempt < 30; attempt++) {
        await sleep(2000);
        const statusRes = await fetch(
          `${GRAPH_BASE_URL}/${videoId}?fields=status&access_token=${accessToken}`,
        );
        const statusJson = await statusRes.json();
        if (statusJson?.status?.video_status === 'ready') break;
        if (statusJson?.status?.video_status === 'error') {
          throw new Error(`Video processing error for locale ${localeKey}`);
        }
      }

      mediaMap[localeKey] = videoId;
      console.log(`[DLO] Uploaded video for locale ${localeKey}: ${videoId}`);
    } else {
      // Download image from storage and upload via multipart FormData
      // (avoids error #3 from url param AND download failures from direct URL)
      const imgResponse = await fetch(mediaUrl);
      if (!imgResponse.ok) {
        throw new Error(`Failed to download image for locale ${localeKey}: HTTP ${imgResponse.status}`);
      }
      const imgBlob = await imgResponse.blob();

      const formData = new FormData();
      formData.append('access_token', accessToken);
      formData.append('filename', `dlo_${localeKey}.jpg`);
      formData.append('file', imgBlob, `dlo_${localeKey}.jpg`);

      const result = await fetchWithRetry(
        `${GRAPH_BASE_URL}/${actId}/adimages`,
        {
          method: 'POST',
          body: formData,
          // No Content-Type header — FormData sets it with boundary automatically
        },
        3,
        adAccountId,
      );

      if (!result.ok || result.json.error) {
        throw new Error(`Image upload failed for locale ${localeKey}: ${result.json?.error?.message || 'unknown'}`);
      }

      const imagesObj = result.json?.images;
      if (imagesObj) {
        const firstKey = Object.keys(imagesObj)[0];
        if (firstKey && imagesObj[firstKey]?.hash) {
          mediaMap[localeKey] = imagesObj[firstKey].hash;
        }
      }

      if (!mediaMap[localeKey]) {
        throw new Error(`Image upload returned no hash for locale ${localeKey}`);
      }

      console.log(`[DLO] Uploaded image for locale ${localeKey}: ${mediaMap[localeKey]}`);
    }
  }

  return { mediaMap, mediaType: isVideo ? 'video' : 'image' };
}

// Build a single reusable DLO creative with asset_feed_spec (shared across all ads in an account)
async function buildDLOCreative(
  accessToken: string,
  adAccountId: string,
  config: Record<string, any>,
  mediaMap: Record<string, string>,
  mediaType: 'video' | 'image',
  pageId: string,
  name: string,
  instagramUserId: string | null,
): Promise<string> {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const languageConfig = config.languageConfig;
  const defaultLang = languageConfig.defaultLanguage;
  const secondaryLangs: any[] = languageConfig.secondaryLanguages || [];
  const allLangs = [defaultLang, ...secondaryLangs];
  const urlParams = config.urlParams || '';
  const firstCreative = (config.selectedCreatives || [])[0];

  const bodies: any[] = [];
  const titles: any[] = [];
  const linkUrls: any[] = [];
  const descriptions: any[] = [];
  const mediaAssets: any[] = [];
  const customizationRules: any[] = [];

  for (const lang of allLangs) {
    const localeKey = String(lang.locale);
    const prefix = `locale_${localeKey}`;

    const bodyText = lang.primaryText || defaultLang.primaryText || '';
    const titleText = lang.headline || defaultLang.headline || '';
    const descText = lang.description || defaultLang.description || '';
    const url = lang.websiteUrl || defaultLang.websiteUrl || config.destinationUrl || '';

    if (bodyText) bodies.push({ text: bodyText, adlabels: [{ name: `${prefix}_body` }] });
    if (titleText) titles.push({ text: titleText, adlabels: [{ name: `${prefix}_title` }] });
    if (descText) descriptions.push({ text: descText, adlabels: [{ name: `${prefix}_desc` }] });
    if (url) linkUrls.push({ website_url: url, adlabels: [{ name: `${prefix}_url` }] });

    const mediaId = mediaMap[localeKey] || mediaMap[String(defaultLang.locale)];
    if (mediaType === 'video' && mediaId) {
      const thumbnailUrl = lang.mediaThumbnailUrl || defaultLang.mediaThumbnailUrl || firstCreative?.thumbnailUrl || '';
      mediaAssets.push({
        video_id: mediaId,
        thumbnail_url: thumbnailUrl,
        adlabels: [{ name: `${prefix}_media` }],
      });
    } else if (mediaType === 'image' && mediaId) {
      mediaAssets.push({
        hash: mediaId, // mediaId contains the image_hash from /adimages upload
        adlabels: [{ name: `${prefix}_media` }],
      });
    }

    const rule: any = {
      customization_spec: { locales: [lang.locale] },
    };
    if (bodyText) rule.body_label = { name: `${prefix}_body` };
    if (titleText) rule.title_label = { name: `${prefix}_title` };
    if (descText) rule.description_label = { name: `${prefix}_desc` };
    if (url) rule.link_url_label = { name: `${prefix}_url` };
    rule[mediaType === 'video' ? 'video_label' : 'image_label'] = { name: `${prefix}_media` };

    customizationRules.push(rule);
  }

  // CRITICAL: Facebook requires a default rule (without locales filter) as fallback
  // Use the default language assets for this rule
  const defaultPrefix = `locale_${String(defaultLang.locale)}`;
  const defaultRule: any = {
    customization_spec: {},
  };
  const defaultBody = defaultLang.primaryText || '';
  const defaultTitle = defaultLang.headline || '';
  const defaultDesc = defaultLang.description || '';
  const defaultUrl = defaultLang.websiteUrl || config.destinationUrl || '';
  if (defaultBody) defaultRule.body_label = { name: `${defaultPrefix}_body` };
  if (defaultTitle) defaultRule.title_label = { name: `${defaultPrefix}_title` };
  if (defaultDesc) defaultRule.description_label = { name: `${defaultPrefix}_desc` };
  if (defaultUrl) defaultRule.link_url_label = { name: `${defaultPrefix}_url` };
  defaultRule[mediaType === 'video' ? 'video_label' : 'image_label'] = { name: `${defaultPrefix}_media` };
  defaultRule.is_default = true;
  customizationRules.push(defaultRule);

  const assetFeedSpec: any = {
    bodies,
    titles,
    link_urls: linkUrls,
    call_to_action_types: [config.ctaType || 'LEARN_MORE'],
    ad_formats: [mediaType === 'video' ? 'SINGLE_VIDEO' : 'SINGLE_IMAGE'],
    asset_customization_rules: customizationRules,
  };

  if (mediaType === 'video' && mediaAssets.length > 0) assetFeedSpec.videos = mediaAssets;
  else if (mediaAssets.length > 0) assetFeedSpec.images = mediaAssets;
  if (descriptions.length > 0) assetFeedSpec.descriptions = descriptions;

  // DLO creatives: include instagram_user_id (same pattern as catalog creatives)
  const objectStorySpec: any = { page_id: pageId };
  if (instagramUserId) {
    objectStorySpec.instagram_user_id = instagramUserId;
  }

  // DLO creatives with asset_customization_rules: follow Meta docs exactly
  // Do NOT include use_page_actor_override or contextual_multi_ads — they cause
  // "Invalid parameter" (2446485) at ad creation when combined with asset_customization_rules
  const creativeParams = new URLSearchParams({
    access_token: accessToken,
    name: `DLO_Creative_${name}`,
    asset_feed_spec: JSON.stringify(assetFeedSpec),
    object_story_spec: JSON.stringify(objectStorySpec),
  });
  if (urlParams) creativeParams.append('url_tags', urlParams.trim());

  console.log(`[DLO] Creating shared creative with ${allLangs.length} languages`);

  const result = await fetchWithRetry(
    `${GRAPH_BASE_URL}/${actId}/adcreatives`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: creativeParams.toString(),
    },
    3,
    adAccountId,
  );

  if (!result.ok || result.json.error) {
    const err = result.json?.error?.message || 'DLO creative creation failed';
    console.error(`[DLO] Creative error:`, JSON.stringify(result.json?.error || {}).substring(0, 500));
    throw new Error(err);
  }

  console.log(`[DLO] Created shared creative ${result.json.id} for ${allLangs.length} languages`);
  return result.json.id;
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
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Parse body first to get job_id
    let jobId: string | null = null;
    let batchMode = false;
    let batchSize = 25;
    
    try {
      const body = await req.json();
      jobId = body.job_id;
      batchMode = body.batch_mode === true;
      batchSize = body.batch_size || 25;
    } catch {
      // No body
    }

    if (!jobId) {
      return new Response(JSON.stringify({ error: 'job_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auth check - support both user tokens AND service role calls from queue-processor
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    let isServiceRoleCall = false;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      
      // Check if this is the service role key (internal call from queue-processor)
      if (token === supabaseServiceKey) {
        isServiceRoleCall = true;
        console.log(`[process-jobs] Service role call for job ${jobId}`);
        
        // Get job to find user_id
        const { data: jobForUser } = await supabase
          .from('campaign_jobs')
          .select('user_id')
          .eq('id', jobId)
          .single();
        
        if (jobForUser) {
          userId = jobForUser.user_id;
        }
      } else if (token === supabaseAnonKey) {
        // Anon key call from queue-processor via functions.invoke
        isServiceRoleCall = true;
        console.log(`[process-jobs] Anon key call for job ${jobId}`);
        
        // Get job to find user_id
        const { data: jobForUser } = await supabase
          .from('campaign_jobs')
          .select('user_id')
          .eq('id', jobId)
          .single();
        
        if (jobForUser) {
          userId = jobForUser.user_id;
        }
      } else {
        // Regular user token
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        
        if (!userError && user) {
          userId = user.id;
        }
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized - no valid user' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a fake user object for compatibility
    const user = { id: userId };

    // Note: jobId was already validated above

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

    // ATOMIC LOCK: Only proceed if we can atomically transition from queued/paused to processing
    // This prevents race conditions when both queue-processor and manual trigger fire simultaneously
    // By using .in('status', [...]) we ensure only ONE instance can claim the job
    const { data: lockResult, error: lockError } = await supabase
      .from('campaign_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', jobId)
      .in('status', ['queued', 'paused'])
      .select('id');

    if (lockError || !lockResult || lockResult.length === 0) {
      // Another instance already claimed this job OR it's already processing
      console.log(`[process-jobs] Job ${jobId} already being processed by another instance (status: ${job.status}), skipping`);
      return new Response(JSON.stringify({ 
        error: 'Job already being processed by another instance', 
        skipped: true,
        currentStatus: job.status,
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[process-jobs] Successfully acquired lock for job ${jobId}`);

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

// Resolve pages with capacity info
    const resolvedPages: Array<{ 
      pageId: string; 
      accessToken: string | null; 
      instagramActorId: string | null;
      adsRunning: number;
      adsLimit: number;
      availableSlots: number;
    }> = [];

    if (config.selectedPages && config.selectedPages.length > 0 && firstAccessToken) {
      for (const selectedPageValue of config.selectedPages) {
        // Check if the value is a valid UUID format before querying
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedPageValue);
        
        let page = null;
        
        if (isUuid) {
          // It's a UUID - query by id (database primary key)
          const { data } = await supabase
            .from('facebook_pages')
            .select('page_id, access_token, ads_running, ads_limit')
            .eq('id', selectedPageValue)
            .single();
          page = data;
        }
        
        // If not found by UUID or value is not a UUID, try by Facebook page_id
        if (!page) {
          const { data: pageByFbId } = await supabase
            .from('facebook_pages')
            .select('page_id, access_token, ads_running, ads_limit')
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
          
          const adsRunning = page.ads_running || 0;
          const adsLimit = page.ads_limit || 250;
          const availableSlots = Math.max(0, adsLimit - adsRunning);
          
          resolvedPages.push({
            pageId: page.page_id,
            accessToken: page.access_token || null,
            instagramActorId,
            adsRunning,
            adsLimit,
            availableSlots,
          });
        }
      }
    }

    // Log page capacity info for debugging
    if (config.antiSpyEnabled && resolvedPages.length > 1) {
      console.log(`[process-jobs] Anti-spy enabled with ${resolvedPages.length} pages:`);
      resolvedPages.forEach(p => {
        console.log(`  - Page ${p.pageId}: ${p.availableSlots} slots available (${p.adsRunning}/${p.adsLimit})`);
      });
    }

    const defaultPageId = resolvedPages.length > 0 ? resolvedPages[0].pageId : '';
    const defaultInstagramUserId = resolvedPages.length > 0 ? resolvedPages[0].instagramActorId : null;

    // Separate items by type - ONLY process pending items to prevent duplicates on re-execution
    // This is critical: if a job times out and is re-triggered, we must not re-create items that already have facebook_id
    // ALSO check for savedAdId/savedFacebookId in config for items created but not properly updated
    // Check if an item has been saved (created in Facebook) - for campaigns and adsets
    const hasSavedId = (item: any): boolean => {
      const config = item.config || {};
      // IMPORTANT: savedCreativeId is NOT included here because it means the creative was created,
      // but the AD itself may not have been created yet. We need savedAdId or savedFacebookId for ads.
      return !!(config.savedAdId || config.savedFacebookId);
    };
    
    // Check if an ad specifically has been created (must have savedAdId, not just savedCreativeId)
    const adHasBeenCreated = (item: any): boolean => {
      const config = item.config || {};
      // An ad is considered created ONLY if it has savedAdId or savedFacebookId
      // savedCreativeId alone means the creative was uploaded but the ad entity was NOT created
      return !!(config.savedAdId || config.savedFacebookId);
    };
    
    const campaigns = items.filter((i) => i.item_type === 'campaign' && i.status === 'pending' && !i.facebook_id && !hasSavedId(i));
    const adsets = items.filter((i) => i.item_type === 'adset' && i.status === 'pending' && !i.facebook_id && !hasSavedId(i));
    // CRITICAL: For ads, use adHasBeenCreated() which does NOT consider savedCreativeId as "created"
    const ads = items.filter((i) => i.item_type === 'ad' && i.status === 'pending' && !i.facebook_id && !adHasBeenCreated(i));
    
    // CRITICAL: Collect items with facebook_id regardless of status (completed OR failed with facebook_id)
    // This handles the case where an item was created successfully but marked as failed due to timeout
    // We need their facebook_ids to properly reference them as parents for child items
    const completedCampaigns = items.filter((i) => i.item_type === 'campaign' && (i.facebook_id || hasSavedId(i)));
    const completedAdsets = items.filter((i) => i.item_type === 'adset' && (i.facebook_id || hasSavedId(i)));
    // CRITICAL: For ads, use adHasBeenCreated() - savedCreativeId alone does NOT mean the ad was created
    const completedAds = items.filter((i) => i.item_type === 'ad' && (i.facebook_id || adHasBeenCreated(i)));
    
    // Fix incorrectly failed/pending items that have facebook_id or savedId - they were actually created successfully
    // IMPORTANT: For ads, only fix if they have savedAdId/savedFacebookId, NOT just savedCreativeId
    const itemsNeedingFix = items.filter((i) => {
      const needsFix = (i.status === 'failed' || i.status === 'pending') && i.facebook_id;
      const hasSaved = hasSavedId(i);
      // For ads, we also need to check adHasBeenCreated specifically
      if (i.item_type === 'ad') {
        return needsFix || ((i.status === 'failed' || i.status === 'pending') && adHasBeenCreated(i));
      }
      return needsFix || ((i.status === 'failed' || i.status === 'pending') && hasSaved);
    });
    
    if (itemsNeedingFix.length > 0) {
      console.log(`[process-jobs] Fixing ${itemsNeedingFix.length} items that have facebook_id/savedId but wrong status`);
      
      for (const item of itemsNeedingFix) {
        const savedId = item.facebook_id || 
          (item.config as any)?.savedAdId || 
          (item.config as any)?.savedFacebookId;
        
        if (savedId) {
          await supabase
            .from('campaign_job_items')
            .update({ status: 'completed', error_message: null, facebook_id: savedId })
            .eq('id', item.id);
          console.log(`[process-jobs] Fixed item ${item.id} with facebook_id ${savedId}`);
        }
      }
    }
    
    console.log(`[process-jobs] Already completed: ${completedCampaigns.length} campaigns, ${completedAdsets.length} adsets, ${completedAds.length} ads`);

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

    // ============= CHUNKED PROCESSING =============
    // Edge Functions have a ~150s timeout. We yield at ~90s to save progress
    // and let queue-processor resume us in the next cycle.
    // The existing idempotency system (facebook_id, savedAdId, savedCreativeId)
    // ensures no duplicates when the job resumes.
    const CHUNK_TIME_LIMIT_MS = 90_000; // 90s work limit, ~60s buffer
    const shouldYield = (): boolean => (Date.now() - startTime) >= CHUNK_TIME_LIMIT_MS;

    // Yield helper: saves progress, sets job back to queued, returns response
    const yieldChunk = async (reason: string): Promise<Response> => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[process-jobs] CHUNK YIELD after ${elapsed}s: ${reason}`);

      // Increment ad usage for ads created in this chunk
      if (totalAdsCreated > 0) {
        try {
          await supabase.rpc('increment_ad_usage', {
            p_user_id: user.id,
            p_ads_count: totalAdsCreated,
          });
        } catch (usageError) {
          console.error('[process-jobs] Failed to increment ad usage on yield:', usageError);
        }
      }

      // Calculate overall progress based on completed items
      const { count: completedCount } = await supabase
        .from('campaign_job_items')
        .select('*', { count: 'exact', head: true })
        .eq('job_id', jobId)
        .in('status', ['completed', 'failed']);

      const totalItems = items.length;
      const progress = totalItems > 0 ? Math.round(((completedCount || 0) / totalItems) * 100) : 0;

      // Set job back to queued so queue-processor picks it up in the next cycle
      await supabase
        .from('campaign_jobs')
        .update({
          status: 'queued',
          progress,
          processed_items: (job.processed_items || 0) + totalAdsCreated,
        })
        .eq('id', jobId);

      console.log(`[process-jobs] Job ${jobId} yielded at ${progress}% progress, will resume automatically`);

      return new Response(JSON.stringify({
        success: true,
        status: 'chunked',
        message: `Yielded after ${elapsed}s: ${reason}`,
        adsCreated: totalAdsCreated,
        progress,
        elapsedSeconds: elapsed,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    };

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

      // ============= CRITICAL DEBUG: FILTER DIAGNOSIS =============
      console.log(`\n[DEBUG-FILTER] ==========================================`);
      console.log(`[DEBUG-FILTER] Account: ${currentAccount.account_id}`);
      console.log(`[DEBUG-FILTER] currentAccountId normalized: "${currentAccountId}"`);
      console.log(`[DEBUG-FILTER] Total campaigns in pool: ${campaigns.length}`);
      console.log(`[DEBUG-FILTER] Total adsets in pool: ${adsets.length}`);
      console.log(`[DEBUG-FILTER] Total ads in pool: ${ads.length}`);
      console.log(`[DEBUG-FILTER] itemsHaveAccountId: ${itemsHaveAccountId}`);

      // Log ALL campaign accountIds to diagnose filter mismatch
      const campaignAccountIds = campaigns.map(c => ({
        id: c.id.substring(0, 8),
        rawAccountId: (c.config as any)?.accountId,
        normalized: getItemAccountId(c),
        matches: getItemAccountId(c) === currentAccountId
      }));
      console.log(`[DEBUG-FILTER] Campaign accountIds breakdown:`);
      campaignAccountIds.forEach(ca => {
        console.log(`  - ${ca.id}: raw="${ca.rawAccountId}" norm="${ca.normalized}" matches=${ca.matches}`);
      });

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

      console.log(`[DEBUG-FILTER] AFTER FILTER:`);
      console.log(`[DEBUG-FILTER] campaignsForAccount count: ${campaignsForAccount.length}`);
      console.log(`[DEBUG-FILTER] adsetsForAccount count: ${adsetsForAccount.length}`);
      console.log(`[DEBUG-FILTER] adsForAccount count: ${adsForAccount.length}`);
      console.log(`[DEBUG-FILTER] ==========================================\n`);

      // ============= DETAILED LOGGING FOR DEBUGGING =============
      console.log(`\n========================================`);
      console.log(`[ACCOUNT ${accountIndex + 1}/${allAdAccounts.length}] ${currentAccount.name}`);
      console.log(`  Account ID: ${currentAccount.account_id}`);
      console.log(`  Normalized ID: ${currentAccountId}`);
      console.log(`  Items have accountId: ${itemsHaveAccountId}`);
      console.log(`----------------------------------------`);
      console.log(`  Pending campaigns to create: ${campaignsForAccount.length}`);
      console.log(`  Pending adsets to create: ${adsetsForAccount.length}`);
      console.log(`  Pending ads to create: ${adsForAccount.length}`);
      
      // Log the first few items for each type to verify accountId matching
      if (campaignsForAccount.length > 0) {
        console.log(`  Sample campaign accountIds: ${campaignsForAccount.slice(0, 3).map(c => (c.config as any)?.accountId).join(', ')}`);
      }
      if (adsetsForAccount.length > 0) {
        console.log(`  Sample adset accountIds: ${adsetsForAccount.slice(0, 3).map(a => (a.config as any)?.accountId).join(', ')}`);
      }
      if (adsForAccount.length > 0) {
        console.log(`  Sample ad accountIds: ${adsForAccount.slice(0, 3).map(a => (a.config as any)?.accountId).join(', ')}`);
      }
      console.log(`========================================\n`);

      // Prepare campaigns with resolved names
      // CRITICAL: Include facebook_id so batch functions can detect already-created items
      const campaignsWithNames = campaignsForAccount.map((c, i) => ({
        id: c.id,
        name: replaceNamingVariables(c.name, { campaignIndex: i }),
        config: c.config as Record<string, any>,
        facebook_id: c.facebook_id, // Include for idempotency check
      }));

      // Pre-populate campaign ID map with already completed campaigns
      // This is essential for resuming jobs - adsets need to reference parent campaign facebook_ids
      const campaignIdMap = new Map<string, string>();
      const completedCampaignsForAccount = 
        itemsHaveAccountId && currentAccountId
          ? completedCampaigns.filter((c) => getItemAccountId(c) === currentAccountId)
          : completedCampaigns;
      
      for (const completed of completedCampaignsForAccount) {
        if (completed.facebook_id) {
          campaignIdMap.set(completed.id, completed.facebook_id);
        }
      }
      console.log(`[process-jobs] Pre-loaded ${campaignIdMap.size} completed campaign IDs for resumption`);
      
      // Create NEW campaigns in batch (only pending ones)
      if (campaignsWithNames.length > 0) {
        console.log(`[process-jobs] Creating ${campaignsWithNames.length} NEW campaigns via batch API...`);
        console.log(`  Campaign names: ${campaignsWithNames.map(c => c.name).join(', ')}`);
        
        const newCampaignIdMap = await createCampaignsBatch(
          accessToken,
          currentAccount.account_id,
          campaignsWithNames,
          config,
          supabase,
          shouldYield,
        );
        // Merge new IDs into the map
        for (const [k, v] of newCampaignIdMap) {
          campaignIdMap.set(k, v);
        }
        console.log(`[process-jobs] Created ${newCampaignIdMap.size}/${campaignsWithNames.length} new campaigns`);
        
        // Log created campaign IDs for verification
        for (const [itemId, fbId] of newCampaignIdMap) {
          console.log(`  ✓ Campaign ${fbId} created`);
        }
      } else {
        console.log(`[process-jobs] No new campaigns to create (all already processed)`);
      }

      // CHUNK CHECK: yield after campaigns if time is running out
      if (shouldYield()) {
        return yieldChunk(`Completed campaigns for account ${accountIndex + 1}/${allAdAccounts.length}`);
      }

      // CRITICAL: Include facebook_id so batch functions can detect already-created items
      const adsetsWithNames = adsetsForAccount.map((a, i) => ({
        id: a.id,
        name: replaceNamingVariables(a.name, { adsetIndex: i }),
        parent_id: a.parent_id,
        config: a.config as Record<string, any>,
        facebook_id: a.facebook_id, // Include for idempotency check
      }));

      // Pre-populate adset ID map with already completed adsets
      const adsetIdMap = new Map<string, string>();
      const completedAdsetsForAccount = 
        itemsHaveAccountId && currentAccountId
          ? completedAdsets.filter((a) => getItemAccountId(a) === currentAccountId)
          : completedAdsets;
      
      for (const completed of completedAdsetsForAccount) {
        if (completed.facebook_id) {
          adsetIdMap.set(completed.id, completed.facebook_id);
        }
      }
      console.log(`[process-jobs] Pre-loaded ${adsetIdMap.size} completed adset IDs for resumption`);
      
      // Create NEW adsets in batch (only pending ones)
      if (adsetsWithNames.length > 0) {
        console.log(`[process-jobs] Creating ${adsetsWithNames.length} NEW adsets via batch API...`);
        
        // Log parent campaign distribution for debugging
        const parentDistribution = new Map<string, number>();
        for (const adset of adsetsWithNames) {
          const parentId = adset.parent_id || 'no-parent';
          parentDistribution.set(parentId, (parentDistribution.get(parentId) || 0) + 1);
        }
        console.log(`[process-jobs] Adset parent distribution:`);
        for (const [parentId, count] of parentDistribution) {
          const fbCampaignId = campaignIdMap.get(parentId) || 'unknown';
          console.log(`    Parent ${parentId} (FB: ${fbCampaignId}): ${count} adsets`);
        }
        
        const newAdsetIdMap = await createAdsetsBatch(
          accessToken,
          currentAccount.account_id,
          adsetsWithNames,
          campaignIdMap,
          config,
          supabase,
          shouldYield,
        );
        // Merge new IDs into the map
        for (const [k, v] of newAdsetIdMap) {
          adsetIdMap.set(k, v);
        }
        console.log(`[process-jobs] Created ${newAdsetIdMap.size}/${adsetsWithNames.length} new adsets`);
        
        // ============= VERIFICATION: Query Facebook to confirm adset counts =============
        console.log(`\n[VERIFICATION] Checking adset counts in Facebook...`);
        for (const [parentId, expectedCount] of parentDistribution) {
          const fbCampaignId = campaignIdMap.get(parentId);
          if (fbCampaignId) {
            try {
              const verifyUrl = `${GRAPH_BASE_URL}/${fbCampaignId}/adsets?fields=id,name&limit=500&access_token=${accessToken}`;
              const verifyResp = await fetch(verifyUrl);
              const verifyData = await verifyResp.json();
              const actualCount = verifyData.data?.length || 0;
              
              if (actualCount !== expectedCount) {
                console.error(`[VERIFICATION ERROR] Campaign ${fbCampaignId}: Expected ${expectedCount} adsets, found ${actualCount}`);
              } else {
                console.log(`[VERIFICATION OK] Campaign ${fbCampaignId}: ${actualCount} adsets ✓`);
              }
            } catch (verifyErr: any) {
              console.error(`[VERIFICATION] Failed to verify campaign ${fbCampaignId}:`, verifyErr.message);
            }
          }
        }
        console.log(`[VERIFICATION] Adset verification complete\n`);
      } else {
        console.log(`[process-jobs] No new adsets to create (all already processed)`);
      }

      // CHUNK CHECK: yield after adsets if time is running out
      if (shouldYield()) {
        return yieldChunk(`Completed adsets for account ${accountIndex + 1}/${allAdAccounts.length}`);
      }

      // Prepare ads with resolved names
      // CRITICAL: Include facebook_id and status so batch functions can detect already-created items
      const adsWithNames = adsForAccount.map((a, i) => ({
        id: a.id,
        name: replaceNamingVariables(a.name, { adIndex: i }),
        parent_id: a.parent_id,
        config: a.config as Record<string, any>,
        facebook_id: a.facebook_id, // Include for idempotency check
        status: a.status, // Include to detect completed ads
      }));

      // Create ads based on type (catalog vs non-catalog)
      // Only process if there are pending ads
      if (adsWithNames.length === 0) {
        console.log(`[process-jobs] No new ads to create for this account (all already processed)`);
      } else if (config.useCatalog) {
        // Log ad parent distribution for debugging
        const adParentDistribution = new Map<string, number>();
        for (const ad of adsWithNames) {
          const parentId = ad.parent_id || 'no-parent';
          adParentDistribution.set(parentId, (adParentDistribution.get(parentId) || 0) + 1);
        }
        console.log(`[process-jobs] Ad parent distribution (expected per adset):`);
        for (const [parentId, count] of Array.from(adParentDistribution.entries()).slice(0, 5)) {
          const fbAdsetId = adsetIdMap.get(parentId) || 'unknown';
          console.log(`    Parent ${parentId} (FB: ${fbAdsetId}): ${count} ads`);
        }
        if (adParentDistribution.size > 5) {
          console.log(`    ... and ${adParentDistribution.size - 5} more adsets`);
        }
        
        // Catalog ads: use batch API for creatives and ads
        console.log(`[process-jobs] Creating ${adsWithNames.length} NEW catalog creatives via batch API...`);
        const creativeIdMap = await createCatalogCreativesBatch(
          accessToken,
          currentAccount.account_id,
          adsWithNames,
          config,
          resolvedPages,
          defaultPageId,
          defaultInstagramUserId,
          supabase,
          shouldYield,
        );
        console.log(`[process-jobs] Created ${creativeIdMap.size}/${adsWithNames.length} creatives`);

        // YIELD CHECK: if creatives batch was partial, yield before attempting ads
        if (shouldYield() && creativeIdMap.size < adsWithNames.length) {
          console.log(`[process-jobs] Yielding after partial creatives (${creativeIdMap.size}/${adsWithNames.length})`);
          return yieldChunk(`Partial creatives: ${creativeIdMap.size}/${adsWithNames.length} for account ${accountIndex + 1}`);
        }

        console.log(`[process-jobs] Creating ${adsWithNames.length} NEW ads via batch API...`);
        const adsCreated = await createAdsBatch(
          accessToken,
          currentAccount.account_id,
          adsWithNames,
          adsetIdMap,
          creativeIdMap,
          supabase,
          {
            config,
            defaultPageId,
            resolvedPages,
          },
          shouldYield,
        );
        totalAdsCreated += adsCreated;
        console.log(`[process-jobs] Created ${adsCreated}/${adsWithNames.length} new ads`);

        // YIELD CHECK: if ads batch was partial, yield before verification/completion
        if (shouldYield() && adsCreated < adsWithNames.length) {
          console.log(`[process-jobs] Yielding after partial ads (${adsCreated}/${adsWithNames.length})`);
          return yieldChunk(`Partial ads: ${adsCreated}/${adsWithNames.length} for account ${accountIndex + 1}`);
        }
        
        // ============= VERIFICATION: Query Facebook to confirm ad counts =============
        console.log(`\n[VERIFICATION] Checking ad counts in Facebook (sampling first 3 adsets)...`);
        let sampleCount = 0;
        for (const [parentId, expectedCount] of adParentDistribution) {
          if (sampleCount >= 3) break;
          const fbAdsetId = adsetIdMap.get(parentId);
          if (fbAdsetId) {
            try {
              const verifyUrl = `${GRAPH_BASE_URL}/${fbAdsetId}/ads?fields=id,name&limit=100&access_token=${accessToken}`;
              const verifyResp = await fetch(verifyUrl);
              const verifyData = await verifyResp.json();
              const actualCount = verifyData.data?.length || 0;
              
              if (actualCount !== expectedCount) {
                console.error(`[VERIFICATION ERROR] Adset ${fbAdsetId}: Expected ${expectedCount} ads, found ${actualCount}`);
              } else {
                console.log(`[VERIFICATION OK] Adset ${fbAdsetId}: ${actualCount} ads ✓`);
              }
              sampleCount++;
            } catch (verifyErr: any) {
              console.error(`[VERIFICATION] Failed to verify adset ${fbAdsetId}:`, verifyErr.message);
            }
          }
        }
        console.log(`[VERIFICATION] Ad verification complete\n`);
      } else if (adsWithNames.length > 0) {
        // Non-catalog ads
        const selectedCreatives = config.selectedCreatives || [];
        const isDLO = config.languageConfig?.enabled === true;
        console.log(`[process-jobs] Creating ${adsWithNames.length} NEW non-catalog ads${isDLO ? ' (DLO mode)' : ''}...`);

        if (isDLO) {
          // ====== DLO OPTIMIZED FLOW: Upload 1x → Shared Creative → Batch Ads ======
          try {
            // Phase 1: Upload media (1x per locale per account)
            const savedDLOMedia: Record<string, string> = (job.config as any)?.savedDLOMedia?.[currentAccountId] || {};
            const savedMediaType = (job.config as any)?.savedDLOMediaType?.[currentAccountId];
            let dloMediaMap: Record<string, string>;
            let dloMediaType: 'video' | 'image';

            if (Object.keys(savedDLOMedia).length > 0 && savedMediaType) {
              dloMediaMap = savedDLOMedia;
              dloMediaType = savedMediaType;
              console.log(`[DLO] Reusing ${Object.keys(dloMediaMap).length} previously uploaded media`);
            } else {
              const uploadResult = await uploadDLOMediaForAccount(
                accessToken, currentAccount.account_id, config, {},
              );
              dloMediaMap = uploadResult.mediaMap;
              dloMediaType = uploadResult.mediaType;

              // Save for idempotency
              const updatedJobConfig = {
                ...(job.config as any),
                savedDLOMedia: {
                  ...((job.config as any)?.savedDLOMedia || {}),
                  [currentAccountId]: dloMediaMap,
                },
                savedDLOMediaType: {
                  ...((job.config as any)?.savedDLOMediaType || {}),
                  [currentAccountId]: dloMediaType,
                },
              };
              await supabase.from('campaign_jobs').update({ config: updatedJobConfig }).eq('id', jobId);
              // Re-read job config for subsequent idempotency saves
              (job as any).config = updatedJobConfig;
            }

            // YIELD CHECK after media upload
            if (shouldYield()) {
              return yieldChunk(`DLO media uploaded for account ${accountIndex + 1}`);
            }

            // Phase 2: Create 1 shared creative (1x per account)
            let dloCreativeId: string | undefined = (job.config as any)?.savedDLOCreativeIds?.[currentAccountId];

            if (!dloCreativeId) {
              // DLO creative uses page_id + instagram_user_id (same pattern as catalog creatives)
              dloCreativeId = await buildDLOCreative(
                accessToken, currentAccount.account_id, config,
                dloMediaMap, dloMediaType, defaultPageId,
                `${currentAccount.name}_DLO`, defaultInstagramUserId,
              );

              const updatedJobConfig = {
                ...(job.config as any),
                savedDLOCreativeIds: {
                  ...((job.config as any)?.savedDLOCreativeIds || {}),
                  [currentAccountId]: dloCreativeId,
                },
              };
              await supabase.from('campaign_jobs').update({ config: updatedJobConfig }).eq('id', jobId);
              (job as any).config = updatedJobConfig;
            } else {
              console.log(`[DLO] Reusing existing creative ${dloCreativeId}`);
            }

            // Phase 3: Create all ads via BATCH API (reusing the SAME creative_id)
            const actId = currentAccount.account_id.startsWith('act_')
              ? currentAccount.account_id : `act_${currentAccount.account_id}`;

            const adBatchItems: Array<{ item: typeof adsWithNames[0]; batchItem: BatchRequestItem }> = [];

            for (let i = 0; i < adsWithNames.length; i++) {
              const ad = adsWithNames[i];

              // Idempotency: already created?
              if (ad.facebook_id || (ad.config as any)?.savedAdId) {
                totalAdsCreated++;
                continue;
              }

              const parentFbId = ad.parent_id ? adsetIdMap.get(ad.parent_id) : null;
              if (!parentFbId) {
                await supabase.from('campaign_job_items')
                  .update({ status: 'failed', error_message: 'Parent adset failed' })
                  .eq('id', ad.id);
                continue;
              }

              const body = new URLSearchParams({
                name: ad.name,
                adset_id: parentFbId,
                creative: JSON.stringify({ creative_id: dloCreativeId }),
                status: 'ACTIVE',
              }).toString();

              adBatchItems.push({
                item: ad,
                batchItem: { method: 'POST', relative_url: `${actId}/ads`, body, name: `dlo_ad_${i}` },
              });
            }

            // Execute in batches
            const batchSize = getAdaptiveBatchSize(BATCH_CONFIG.AD_BATCH_SIZE, currentAccount.account_id);
            const chunks = chunkArray(adBatchItems, batchSize);
            console.log(`[DLO] Creating ${adBatchItems.length} ads in ${chunks.length} batches of ~${batchSize}`);

            for (const chunk of chunks) {
              if (shouldYield()) {
                return yieldChunk(`DLO partial ads for account ${accountIndex + 1}`);
              }

              const { results } = await executeBatchRequest(
                accessToken, chunk.map(c => c.batchItem), currentAccount.account_id,
              );

              for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const item = chunk[i].item;
                let parsedBody: any;
                try { parsedBody = JSON.parse(result.body); } catch { parsedBody = {}; }

                if (result.code === 200 && parsedBody.id) {
                  totalAdsCreated++;
                  await supabase.from('campaign_job_items')
                    .update({
                      status: 'completed',
                      facebook_id: parsedBody.id,
                      config: { ...(item.config as any), savedAdId: parsedBody.id },
                    })
                    .eq('id', item.id);
                } else {
                  const errMsg = parsedBody.error?.message || `HTTP ${result.code}`;
                  const blameFields = parsedBody.error?.error_data?.blame_field_specs 
                    ? JSON.stringify(parsedBody.error.error_data.blame_field_specs)
                    : 'none';
                  console.error(`[DLO] Ad creation failed: ${errMsg} | subcode: ${parsedBody.error?.error_subcode} | blame_fields: ${blameFields} | full_error: ${JSON.stringify(parsedBody.error).substring(0, 800)}`);
                  hasError = true;
                  lastError = errMsg;
                  await supabase.from('campaign_job_items')
                    .update({ status: 'failed', error_message: errMsg })
                    .eq('id', item.id);
                }
              }

              await sleep(BATCH_CONFIG.BATCH_DELAY_MS);
            }

            console.log(`[DLO] Created ${totalAdsCreated} ads using shared creative ${dloCreativeId}`);
          } catch (dloErr: any) {
            console.error(`[DLO] Fatal error:`, dloErr.message);
            hasError = true;
            lastError = dloErr.message;
            // Mark all pending DLO ads as failed
            for (const ad of adsWithNames) {
              if (!ad.facebook_id && !(ad.config as any)?.savedAdId) {
                await supabase.from('campaign_job_items')
                  .update({ status: 'failed', error_message: `DLO error: ${dloErr.message}` })
                  .eq('id', ad.id);
              }
            }
          }
        } else {
          // Standard non-catalog sequential flow
          let pageAssignments: Array<{ pageId: string; instagramActorId: string | null }> = [];
          if (config.antiSpyEnabled && resolvedPages.length > 1) {
            pageAssignments = calculateSmartPageDistribution(adsWithNames.length, resolvedPages);
          }

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

            let currentPageId = defaultPageId;
            let currentInstagramUserId = defaultInstagramUserId;
            if (pageAssignments.length > 0 && pageAssignments[adIndex]) {
              currentPageId = pageAssignments[adIndex].pageId;
              currentInstagramUserId = pageAssignments[adIndex].instagramActorId;
            }

            const creativeIndex = adIndex % selectedCreatives.length;
            const creative = selectedCreatives[creativeIndex];

            if (!creative) {
              await supabase
                .from('campaign_job_items')
                .update({ status: 'failed', error_message: 'No creative available' })
                .eq('id', ad.id);
              continue;
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

            const progress = Math.round(((adIndex + 1) / adsWithNames.length) * 100);
            await supabase.from('campaign_jobs').update({ progress }).eq('id', jobId);
          }
        }
      }

      // CHUNK CHECK: yield after processing an account if time is running out
      if (shouldYield()) {
        const reason = accountIndex < allAdAccounts.length - 1
          ? `Completed account ${accountIndex + 1}/${allAdAccounts.length}, more accounts remain`
          : `Time limit reached on last account ${accountIndex + 1}/${allAdAccounts.length}`;
        return yieldChunk(reason);
      }
    }

    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    
    // ============= FINAL SUMMARY =============
    console.log(`\n========================================`);
    console.log(`[JOB SUMMARY] Job ${jobId} completed`);
    console.log(`----------------------------------------`);
    console.log(`  Duration: ${elapsedSeconds} seconds`);
    console.log(`  Accounts processed: ${allAdAccounts.length}`);
    console.log(`  Total campaigns created: ${campaigns.length}`);
    console.log(`  Total adsets created: ${adsets.length}`);
    console.log(`  Total ads created: ${totalAdsCreated}`);
    console.log(`  Errors encountered: ${hasError ? 'YES' : 'NO'}`);
    if (hasError) {
      console.log(`  Last error: ${lastError}`);
    }
    console.log(`========================================\n`);

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
