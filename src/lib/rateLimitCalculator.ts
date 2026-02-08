/**
 * Facebook Marketing API Rate Limit Calculator
 * 
 * Standard Access Tier:
 * - 9,000 points per 5-minute window per ad account
 * - POST operations cost ~3 points each
 * - Batch API: up to 50 requests per batch (each counts individually)
 * - QPS limit: 100 requests per second per account
 * 
 * Our Implementation:
 * - Adaptive batch sizes (15-40 items per batch)
 * - Progressive throttling starting at 40% usage
 * - Soft pause at 80%, hard pause at 90%
 * - Expected throughput: ~30-50 items/second under normal conditions
 * - With rate limiting: ~10-20 items/second average
 * 
 * Reference: https://developers.facebook.com/docs/marketing-api/overview/rate-limiting
 */

export const RATE_LIMIT_CONFIG = {
  // Standard Access tier limits
  STANDARD_ACCESS_POINTS: 9000,
  WINDOW_MINUTES: 5,
  
  // Points per operation type
  POINTS_PER_POST: 3, // POST operations (create)
  POINTS_PER_GET: 1,  // GET operations (read)
  
  // QPS limit
  MAX_QPS: 100,
  
  // Batch configuration (matching edge function)
  BATCH_SIZE_CAMPAIGNS: 15,
  BATCH_SIZE_ADSETS: 40,
  BATCH_SIZE_ADS: 40,
  BATCH_SIZE_CREATIVES: 40,
  
  // Safety margin (keep 20% buffer due to adaptive throttling)
  SAFETY_MARGIN: 0.8,
  
  // Realistic throughput estimates (items per second)
  THROUGHPUT_NORMAL: 35, // When under 40% usage
  THROUGHPUT_THROTTLED: 15, // When 40-80% usage
  THROUGHPUT_PAUSED: 5, // When pausing and resuming
};

export interface RateLimitEstimate {
  totalCampaigns: number;
  totalAdsets: number;
  totalAds: number;
  totalCreatives: number; // For catalog ads, creative is created with ad
  totalApiCalls: number;
  totalPoints: number;
  availablePoints: number;
  usagePercent: number;
  isOverLimit: boolean;
  estimatedTimeSeconds: number;
  estimatedTimeFormatted: string;
  recommendedMaxStructures: number;
  warningLevel: 'safe' | 'warning' | 'danger';
  message: string;
  pausesExpected: number;
}

/**
 * Calculate API calls needed for a campaign structure
 * Each campaign structure (1-X-Y) requires:
 * - 1 campaign call
 * - X adset calls
 * - X * Y ad calls (each ad also creates a creative for catalog ads)
 */
export function calculateApiCallsForStructure(
  campaigns: number,
  adsetsPerCampaign: number,
  adsPerAdset: number,
  useCatalog: boolean = true
): { campaigns: number; adsets: number; ads: number; creatives: number; total: number } {
  const totalAdsets = campaigns * adsetsPerCampaign;
  const totalAds = totalAdsets * adsPerAdset;
  // For catalog ads, each ad creates a creative first
  const totalCreatives = useCatalog ? totalAds : 0;
  
  return {
    campaigns,
    adsets: totalAdsets,
    ads: totalAds,
    creatives: totalCreatives,
    total: campaigns + totalAdsets + totalAds + totalCreatives,
  };
}

/**
 * Calculate rate limit usage and provide recommendations
 */
export function estimateRateLimitUsage(
  campaigns: number,
  adsetsPerCampaign: number,
  adsPerAdset: number,
  useCatalog: boolean = true,
  currentUsagePercent: number = 0,
  accountsCount: number = 1
): RateLimitEstimate {
  const { STANDARD_ACCESS_POINTS, POINTS_PER_POST, SAFETY_MARGIN, WINDOW_MINUTES } = RATE_LIMIT_CONFIG;
  
  const calls = calculateApiCallsForStructure(campaigns, adsetsPerCampaign, adsPerAdset, useCatalog);
  const totalApiCalls = calls.total * accountsCount;
  const totalPoints = totalApiCalls * POINTS_PER_POST;
  
  // Available points after current usage (per account)
  const usedPoints = (currentUsagePercent / 100) * STANDARD_ACCESS_POINTS;
  const availablePointsPerWindow = Math.floor((STANDARD_ACCESS_POINTS * SAFETY_MARGIN) - usedPoints);
  const availablePoints = availablePointsPerWindow * accountsCount;
  
  const usagePercent = Math.min(100, Math.round(((usedPoints + totalPoints / accountsCount) / STANDARD_ACCESS_POINTS) * 100));
  const isOverLimit = (totalPoints / accountsCount) > availablePointsPerWindow;
  
  // Calculate number of pause cycles needed
  const pointsPerAccount = totalPoints / accountsCount;
  const pausesExpected = Math.max(0, Math.ceil(pointsPerAccount / (STANDARD_ACCESS_POINTS * SAFETY_MARGIN)) - 1);
  
  // Estimate time more realistically based on expected throughput
  let estimatedTimeSeconds: number;
  if (pausesExpected === 0) {
    // No pauses needed - use normal throughput
    estimatedTimeSeconds = Math.ceil(totalApiCalls / RATE_LIMIT_CONFIG.THROUGHPUT_NORMAL);
  } else if (pausesExpected <= 2) {
    // Some throttling expected
    estimatedTimeSeconds = Math.ceil(totalApiCalls / RATE_LIMIT_CONFIG.THROUGHPUT_THROTTLED) + (pausesExpected * 60);
  } else {
    // Many pauses expected - add pause time (up to 5 min per pause)
    const processingTime = Math.ceil(totalApiCalls / RATE_LIMIT_CONFIG.THROUGHPUT_PAUSED);
    const pauseTime = pausesExpected * (WINDOW_MINUTES * 60 * 0.5); // Assume 50% of window for pause
    estimatedTimeSeconds = processingTime + pauseTime;
  }
  
  // Calculate recommended max structures that fit in available points
  const pointsPerStructure = (1 + adsetsPerCampaign + (adsetsPerCampaign * adsPerAdset) + 
    (useCatalog ? adsetsPerCampaign * adsPerAdset : 0)) * POINTS_PER_POST * accountsCount;
  const recommendedMaxStructures = Math.floor(availablePointsPerWindow / (pointsPerStructure / accountsCount));
  
  // Determine warning level and message
  let warningLevel: 'safe' | 'warning' | 'danger' = 'safe';
  let message = '';
  
  if (pausesExpected >= 3) {
    warningLevel = 'danger';
    message = `⏳ Job muito grande (${pausesExpected + 1} ciclos). Tempo estimado: ${formatEstimatedTime(estimatedTimeSeconds)}. O sistema pausará automaticamente para respeitar os limites.`;
  } else if (pausesExpected > 0) {
    warningLevel = 'warning';
    message = `📊 Job médio (${pausesExpected + 1} ciclos). Tempo estimado: ${formatEstimatedTime(estimatedTimeSeconds)}. Pode haver pausas automáticas.`;
  } else if (usagePercent > 60) {
    warningLevel = 'warning';
    message = `⚡ Uso moderado (${usagePercent}%). Tempo estimado: ${formatEstimatedTime(estimatedTimeSeconds)}.`;
  } else {
    warningLevel = 'safe';
    message = `✅ Dentro do limite. Tempo estimado: ${formatEstimatedTime(estimatedTimeSeconds)}.`;
  }
  
  return {
    totalCampaigns: calls.campaigns * accountsCount,
    totalAdsets: calls.adsets * accountsCount,
    totalAds: calls.ads * accountsCount,
    totalCreatives: calls.creatives * accountsCount,
    totalApiCalls,
    totalPoints,
    availablePoints,
    usagePercent,
    isOverLimit,
    estimatedTimeSeconds,
    estimatedTimeFormatted: formatEstimatedTime(estimatedTimeSeconds),
    recommendedMaxStructures,
    warningLevel,
    message,
    pausesExpected,
  };
}

/**
 * Format estimated time for display
 */
export function formatEstimatedTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} segundos`;
  } else if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);
    return `~${minutes} minuto(s)`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    return `~${hours}h ${minutes}m`;
  }
}

/**
 * Parse X-Ad-Account-Usage header from Facebook API
 * Header format: \"acc_id_util_pct=X.XX\"
 */
export function parseRateLimitHeader(header: string | null): number {
  if (!header) return 0;
  
  try {
    // Format: \"acc_id_util_pct=15.50\" or similar
    const match = header.match(/acc_id_util_pct=(\d+(?:\.\d+)?)/);
    if (match) {
      return parseFloat(match[1]);
    }
    
    // Try parsing as JSON if it's in a different format
    const parsed = JSON.parse(header);
    if (parsed.acc_id_util_pct !== undefined) {
      return parseFloat(parsed.acc_id_util_pct);
    }
  } catch {
    // Ignore parse errors
  }
  
  return 0;
}
