/**
 * Naming Variable Resolver
 * Resolves template variables for campaign, adset, and ad naming
 */

interface ResolverContext {
  // Account info
  accountName?: string;
  accountId?: string;
  
  // Page info
  pageName?: string;
  pageNames?: string[];
  
  // Creative info
  creativeName?: string;
  
  // Catalog info
  productSetName?: string;
  catalogName?: string;
  
  // Structure info
  budget?: 'CBO' | 'ABO';
  structure?: string; // e.g., "1-4-1"
  
  // Indices for sequentials
  campaignIndex?: number;
  adsetIndex?: number;
  adIndex?: number;
  
  // Custom variables
  customVariables?: Record<string, string>;
}

/**
 * Extracts the first word (first name) from a full name
 * Example: "Alana Martins Santos" → "Alana"
 */
export function getFirstName(fullName: string): string {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0] || fullName;
}

/**
 * Extracts the first N characters from a string (account code)
 * Example: "SC2-133 - Group Marvin - Topup" → "SC2-133"
 */
export function getAccountCode(accountName: string, length: number = 7): string {
  if (!accountName) return '';
  return accountName.trim().slice(0, length);
}

/**
 * Extracts the sequential start number from a template
 * Example: "{{sequencial:300}}" → 300
 * Example: "{{sequencial:01}}" → 1
 */
export function extractSequentialStart(template: string): number {
  const match = template.match(/\{\{sequencial:(\d+)\}\}/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 1;
}

/**
 * Formats a sequential number with proper padding
 * Preserves leading zeros based on the original format
 */
export function formatSequential(value: number, originalFormat: string): string {
  const match = originalFormat.match(/\{\{sequencial:(\d+)\}\}/);
  if (match) {
    const originalDigits = match[1];
    const padLength = originalDigits.length;
    return String(value).padStart(padLength, '0');
  }
  return String(value).padStart(2, '0');
}

/**
 * Resolves all variables in a template string
 */
export function resolveTemplate(template: string, context: ResolverContext): string {
  let resolved = template;
  const now = new Date();
  
  // Build replacements map
  const replacements: Record<string, string> = {
    // Account variables
    conta_nome: context.accountName || '',
    conta_codigo: getAccountCode(context.accountName || '', 7),
    conta_apelido: context.customVariables?.conta_apelido || '',
    conta_id: context.accountId?.replace('act_', '') || '',
    
    // Page variables
    pagina_nome: context.pageName || (context.pageNames?.[0] || ''),
    pagina_nome1: getFirstName(context.pageName || (context.pageNames?.[0] || '')),
    
    // Creative variables
    criativo: context.creativeName || '',
    
    // Catalog variables
    conjunto_catalogo: context.productSetName || '',
    catalogo: context.catalogName || '',
    
    // Structure variables
    budget: context.budget || 'CBO',
    estrutura: context.structure || '1-1-1',
    
    // Date/time variables
    ano: now.getFullYear().toString(),
    ano2: now.getFullYear().toString().slice(-2),
    mes: String(now.getMonth() + 1).padStart(2, '0'),
    dia: String(now.getDate()).padStart(2, '0'),
    hora: String(now.getHours()).padStart(2, '0'),
    minuto: String(now.getMinutes()).padStart(2, '0'),
  };
  
  // Add custom variables
  if (context.customVariables) {
    Object.entries(context.customVariables).forEach(([key, value]) => {
      if (!replacements[key]) {
        replacements[key] = value;
      }
    });
  }
  
  // Handle sequencial with incrementing - uses the appropriate index based on context
  // Priority: adIndex > adsetIndex > campaignIndex (most specific wins)
  resolved = resolved.replace(/\{\{sequencial(?::(\d+))?\}\}/g, (match, start) => {
    const startNum = start ? parseInt(start, 10) : 1;
    
    // Use the most specific index available
    // For adset names, use adsetIndex; for ad names, use adIndex; for campaigns, use campaignIndex
    let currentIndex = 0;
    if (context.adIndex !== undefined) {
      currentIndex = context.adIndex;
    } else if (context.adsetIndex !== undefined) {
      currentIndex = context.adsetIndex;
    } else if (context.campaignIndex !== undefined) {
      currentIndex = context.campaignIndex;
    }
    
    const value = startNum + currentIndex;
    
    // Preserve padding based on original format
    if (start) {
      return String(value).padStart(start.length, '0');
    }
    return String(value).padStart(2, '0');
  });
  
  // Handle conjunto variable for adset index
  resolved = resolved.replace(/\{\{conjunto\}\}/g, () => {
    return String((context.adsetIndex ?? 0) + 1).padStart(2, '0');
  });
  
  // Replace all other variables
  Object.entries(replacements).forEach(([key, val]) => {
    resolved = resolved.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
  });
  
  return resolved;
}

/**
 * Resolves campaign name with all context
 */
export function resolveCampaignName(
  template: string,
  campaignIndex: number,
  context: Omit<ResolverContext, 'campaignIndex'>
): string {
  return resolveTemplate(template, { ...context, campaignIndex });
}

/**
 * Resolves adset name with all context
 */
export function resolveAdsetName(
  template: string,
  adsetIndex: number,
  context: Omit<ResolverContext, 'adsetIndex'>
): string {
  return resolveTemplate(template, { ...context, adsetIndex });
}

/**
 * Resolves ad name with all context
 */
export function resolveAdName(
  template: string,
  adIndex: number,
  context: Omit<ResolverContext, 'adIndex'>
): string {
  return resolveTemplate(template, { ...context, adIndex });
}
