// Currency utility functions for consistent formatting across the app

/**
 * Currency configuration with symbols and minimum budgets
 */
export const currencyConfig: Record<string, { symbol: string; minBudget: number; locale: string }> = {
  BRL: { symbol: 'R$', minBudget: 6, locale: 'pt-BR' },
  USD: { symbol: '$', minBudget: 1, locale: 'en-US' },
  EUR: { symbol: '€', minBudget: 1, locale: 'de-DE' },
  GBP: { symbol: '£', minBudget: 1, locale: 'en-GB' },
  ARS: { symbol: 'ARS$', minBudget: 1, locale: 'es-AR' },
  MXN: { symbol: 'MX$', minBudget: 1, locale: 'es-MX' },
  CLP: { symbol: 'CLP$', minBudget: 1, locale: 'es-CL' },
  COP: { symbol: 'COP$', minBudget: 1, locale: 'es-CO' },
  PEN: { symbol: 'S/', minBudget: 1, locale: 'es-PE' },
};

/**
 * Format a value with the correct currency
 * @param value - The numeric value to format
 * @param currency - The currency code (e.g., 'BRL', 'USD')
 * @returns Formatted currency string
 */
export function formatCurrency(value: number, currency: string = 'BRL'): string {
  const config = currencyConfig[currency];
  
  if (config) {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: currency,
    }).format(value);
  }
  
  // Fallback for unknown currencies
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(value);
}

/**
 * Format multiple currency budgets into a readable string
 * @param budgetByCurrency - Object with currency codes as keys and amounts as values
 * @returns Formatted string with all currencies
 */
export function formatMultiCurrencyBudget(budgetByCurrency: Record<string, number>): string {
  const entries = Object.entries(budgetByCurrency).filter(([_, value]) => value > 0);
  
  if (entries.length === 0) return 'Não definido';
  
  return entries
    .map(([currency, value]) => formatCurrency(value, currency))
    .join(' / ');
}

/**
 * Get the primary currency from selected accounts or budget configuration
 * @param budgetByCurrency - Budget per currency object
 * @param defaultCurrency - Default currency to return if none found
 * @returns The primary currency code
 */
export function getPrimaryCurrency(
  budgetByCurrency: Record<string, number>,
  defaultCurrency: string = 'BRL'
): string {
  const currencies = Object.keys(budgetByCurrency).filter(c => budgetByCurrency[c] > 0);
  return currencies[0] || defaultCurrency;
}

/**
 * Check if configuration has multiple currencies
 * @param budgetByCurrency - Budget per currency object
 * @returns True if more than one currency is configured
 */
export function hasMultipleCurrencies(budgetByCurrency: Record<string, number>): boolean {
  const activeCurrencies = Object.keys(budgetByCurrency).filter(c => budgetByCurrency[c] > 0);
  return activeCurrencies.length > 1;
}

/**
 * Get currency symbol for a currency code
 * @param currency - Currency code (e.g., 'USD', 'BRL')
 * @returns Currency symbol
 */
export function getCurrencySymbol(currency: string): string {
  return currencyConfig[currency]?.symbol || currency;
}
