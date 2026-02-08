/**
 * Facebook Marketing API Rate Limit Calculator
 * 
 * Standard Access Tier:
 * - 9,000 points per 5-minute window per ad account
 * - POST operations cost 3 points each
 * - QPS limit: 100 requests per second per account
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
  
  // Safety margin (keep 10% buffer)
  SAFETY_MARGIN: 0.9,
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
  recommendedMaxStructures: number;
  warningLevel: 'safe' | 'warning' | 'danger';
  message: string;
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
  const { STANDARD_ACCESS_POINTS, POINTS_PER_POST, MAX_QPS, SAFETY_MARGIN } = RATE_LIMIT_CONFIG;
  
  const calls = calculateApiCallsForStructure(campaigns, adsetsPerCampaign, adsPerAdset, useCatalog);
  const totalApiCalls = calls.total * accountsCount;
  const totalPoints = totalApiCalls * POINTS_PER_POST;
  
  // Available points after current usage
  const usedPoints = (currentUsagePercent / 100) * STANDARD_ACCESS_POINTS;
  const availablePoints = Math.floor((STANDARD_ACCESS_POINTS * SAFETY_MARGIN) - usedPoints);
  
  const usagePercent = Math.min(100, Math.round(((usedPoints + totalPoints) / STANDARD_ACCESS_POINTS) * 100));
  const isOverLimit = totalPoints > availablePoints;
  
  // Estimate time based on QPS limit
  const estimatedTimeSeconds = Math.ceil(totalApiCalls / MAX_QPS);
  
  // Calculate recommended max structures that fit in available points
  const pointsPerStructure = (1 + adsetsPerCampaign + (adsetsPerCampaign * adsPerAdset) + 
    (useCatalog ? adsetsPerCampaign * adsPerAdset : 0)) * POINTS_PER_POST * accountsCount;
  const recommendedMaxStructures = Math.floor(availablePoints / pointsPerStructure);
  
  // Determine warning level
  let warningLevel: 'safe' | 'warning' | 'danger' = 'safe';
  let message = '';
  
  if (isOverLimit) {
    warningLevel = 'danger';
    message = `⚠️ Limite excedido! Esta operação requer ${totalPoints.toLocaleString()} pontos, mas você tem apenas ${availablePoints.toLocaleString()} disponíveis. Reduza para no máximo ${recommendedMaxStructures} campanha(s).`;
  } else if (usagePercent > 80) {
    warningLevel = 'warning';
    message = `⚡ Uso alto (${usagePercent}%). Você está próximo do limite. Considere aguardar 5 minutos antes de criar mais campanhas.`;
  } else if (usagePercent > 50) {
    warningLevel = 'warning';
    message = `📊 Uso moderado (${usagePercent}%). ${recommendedMaxStructures} estrutura(s) ainda podem ser criadas nesta janela.`;
  } else {
    warningLevel = 'safe';
    message = `✅ Uso seguro (${usagePercent}%). Você pode criar até ${recommendedMaxStructures} estrutura(s) adicionais.`;
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
    recommendedMaxStructures,
    warningLevel,
    message,
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
