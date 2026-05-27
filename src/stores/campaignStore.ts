import { create } from 'zustand';

export interface Creative {
  id: string;
  name: string;
  type: 'video' | 'image';
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  size: number;
}

export interface DLOLanguage {
  locale: number;        // Facebook locale ID
  label: string;         // Nome legível
  mediaId?: string;      // ID do criativo da biblioteca (opcional)
  mediaType?: 'video' | 'image';
  mediaUrl?: string;
  mediaThumbnailUrl?: string;
  useDefaultMedia: boolean;
  websiteUrl?: string;
  headline?: string;
  primaryText?: string;
  description?: string;
}

export interface LanguageConfig {
  enabled: boolean;
  defaultLanguage: DLOLanguage;
  secondaryLanguages: DLOLanguage[];
}

export interface CampaignConfig {
  // Step 1 - Creatives
  selectedCreatives: Creative[];
  
  // Step 2 - Campaign
  multiAccountMode: boolean;
  selectedAccounts: string[];
  isPaused: boolean;
  campaignName: string;
  objective: 'OUTCOME_SALES' | 'OUTCOME_LEADS' | 'OUTCOME_TRAFFIC' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_AWARENESS' | 'OUTCOME_APP_PROMOTION';
  specialAdCategory: 'NONE' | 'HOUSING' | 'EMPLOYMENT' | 'FINANCIAL_PRODUCTS_SERVICES' | 'ISSUES_ELECTIONS_POLITICS';
  specialAdCategoryCountry: string[]; // ISO country codes for political ad authorization
  useCBO: boolean; // true = Campaign Budget Optimization, false = Ad Set Budget
  useCatalog: boolean; // true = Dynamic Ads with product catalog
  budget: number;
  budgetByCurrency: Record<string, number>; // e.g., { USD: 50, BRL: 200 }
  budgetPeriod: 'daily' | 'lifetime';
  bidStrategy: 'LOWEST_COST_WITHOUT_CAP' | 'COST_CAP' | 'LOWEST_COST_WITH_BID_CAP' | 'LOWEST_COST_WITH_MIN_ROAS';
  costCap: number | null; // For COST_CAP strategy
  bidCap: number | null; // For LOWEST_COST_WITH_BID_CAP strategy
  roasGoal: number | null; // For LOWEST_COST_WITH_MIN_ROAS strategy (e.g., 2.0 = 200% ROAS)
  
  // Step 3 - Ad Sets
  distribution: 'campaign' | 'adset' | 'ad';
  campaignsPerCreative: number;
  adsetsPerCampaign: number;
  adsPerAdset: number;
  adsetBudget: number;
  adsetBudgetByCurrency: Record<string, number>; // ABO budget per currency
  adsetBudgetPeriod: 'daily' | 'lifetime';
  shareAdsetBudget: boolean;
  adsetName: string;
  pixelId: string;
  // Catalog / Dynamic Ads fields - API compatible
  selectedBusinessManagerId: string; // BM from which to fetch catalogs
  selectedBusinessManagerName: string;
  catalogId: string; // Facebook catalog_id (for promoted_object.product_catalog_id)
  catalogDbId: string; // Database UUID for fetching product sets
  catalogName: string; // Catalog name for naming variables
  productSetId: string; // Facebook product_set_id (for adset promoted_object.product_set_id)
  productSetName: string; // Product set name for naming variables ({{conjunto_catalogo}})
  businessManagerId: string;
  catalogImage: string;
  duplicateProducts: number;
  advantagePlus: boolean;
  // Page names for naming variables
  pageNames: string[];
  // Targeting - API compatible fields
  geoLocations: {
    countries: string[]; // ISO country codes: ['BR', 'US', 'PT']
    regions?: { key: string; name: string }[]; // Region targeting
    cities?: { key: string; name: string; radius?: number; distance_unit?: 'mile' | 'kilometer' }[];
  };
  locales: number[]; // Locale IDs from Facebook API (e.g., 24 = Portuguese (Brazil))
  ageMin: number;
  ageMax: number;
  ageRangeSuggestion: [number, number] | null; // Advantage+ age_range suggestion (e.g., [25, 45])
  genders: number[]; // Facebook API: [] = all, [1] = male, [2] = female
  // Detailed targeting
  flexibleSpec: {
    interests?: { id: string; name: string }[];
    behaviors?: { id: string; name: string }[];
    demographics?: { id: string; name: string }[];
  }[];
  exclusions: {
    interests?: { id: string; name: string }[];
    behaviors?: { id: string; name: string }[];
    custom_audiences?: { id: string; name: string }[];
  };
  customAudiences: { id: string; name: string }[];
  excludedCustomAudiences: { id: string; name: string }[];
  autoPlacement: boolean;
  publisherPlatforms: ('facebook' | 'instagram' | 'messenger' | 'audience_network')[];
  scheduleStart: Date | null;
  scheduleEnd: Date | null;
  
  // Attribution Settings (adset level)
  attributionClickDays: 1 | 7; // Click-through attribution window
  attributionViewDays: 0 | 1; // View-through attribution window
  attributionEngagedViewDays: 0 | 1; // Engaged video view attribution window (videos only)
  
  // Step 4 - Ads
  antiSpyEnabled: boolean;
  autoRetryOnFailure: boolean;
  selectedPoolId: string | null;
  selectedPages: string[];
  adName: string;
  multiAdvertiser: boolean;
  primaryText: string;
  headline: string;
  description: string;
  destinationUrl: string;
  ctaType: string;
  urlParams: string;
  
  // DLO - Dynamic Language Optimization
  languageConfig: LanguageConfig;
  
  // Custom naming variables for nomenclature system
  customNamingVariables: Record<string, string>;
}

interface CampaignState {
  currentStep: number;
  config: CampaignConfig;
  pageLimitError: string | null; // Track page limit validation errors
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateConfig: (updates: Partial<CampaignConfig>) => void;
  resetConfig: () => void;
  setPageLimitError: (error: string | null) => void;
  
  // Computed values
  getTotalCampaigns: () => number;
  getTotalAdsets: () => number;
  getTotalAds: () => number;
  getTotalBudget: () => number;
  getBudgetsByCurrency: () => Record<string, number>;
}

const defaultConfig: CampaignConfig = {
  selectedCreatives: [],
  multiAccountMode: false,
  selectedAccounts: [],
  isPaused: true,
  campaignName: '[CP{{sequencial:01}}][{{budget}}][{{estrutura}}][{{conta_apelido}}]',
  objective: 'OUTCOME_SALES',
  specialAdCategory: 'NONE',
  specialAdCategoryCountry: [],
  useCBO: true,
  useCatalog: false,
  budget: 50,
  budgetByCurrency: {},
  budgetPeriod: 'daily',
  bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
  costCap: null,
  bidCap: null,
  roasGoal: null,
  distribution: 'campaign',
  campaignsPerCreative: 1,
  adsetsPerCampaign: 1,
  adsPerAdset: 1,
  adsetBudget: 10,
  adsetBudgetByCurrency: {},
  adsetBudgetPeriod: 'daily',
  shareAdsetBudget: false,
  adsetName: '{{criativo}}_CJ{{conjunto}}',
  pixelId: '',
  selectedBusinessManagerId: '',
  selectedBusinessManagerName: '',
  catalogId: '',
  catalogDbId: '',
  catalogName: '',
  productSetId: '',
  productSetName: '',
  businessManagerId: '',
  catalogImage: '',
  duplicateProducts: 5,
  pageNames: [],
  advantagePlus: true,
  geoLocations: {
    countries: ['BR'], // ISO codes
  },
  locales: [24], // Portuguese (Brazil)
  ageMin: 18,
  ageMax: 65,
  ageRangeSuggestion: null,
  genders: [], // All genders
  flexibleSpec: [],
  exclusions: {},
  customAudiences: [],
  excludedCustomAudiences: [],
  autoPlacement: true,
  publisherPlatforms: ['facebook', 'instagram', 'messenger', 'audience_network'],
  scheduleStart: null,
  scheduleEnd: null,
  attributionClickDays: 7,
  attributionViewDays: 1,
  attributionEngagedViewDays: 1,
  antiSpyEnabled: false,
  autoRetryOnFailure: false,
  selectedPoolId: null,
  selectedPages: [],
  adName: '{{criativo}}',
  multiAdvertiser: false,
  primaryText: '',
  headline: '',
  description: '',
  destinationUrl: '',
  ctaType: 'LEARN_MORE',
  urlParams: 'utm_medium={{adset.name}}',
  languageConfig: {
    enabled: false,
    defaultLanguage: {
      locale: 0,
      label: '',
      useDefaultMedia: true,
      websiteUrl: '',
      headline: '',
      primaryText: '',
      description: '',
    },
    secondaryLanguages: [],
  },
  customNamingVariables: {},
};

export const useCampaignStore = create<CampaignState>((set, get) => ({
  currentStep: 1,
  config: { ...defaultConfig },
  pageLimitError: null,
  
  setStep: (step) => set({ currentStep: step }),
  
  nextStep: () => set((state) => ({ 
    currentStep: Math.min(state.currentStep + 1, 5) 
  })),
  
  prevStep: () => set((state) => ({ 
    currentStep: Math.max(state.currentStep - 1, 1) 
  })),
  
  updateConfig: (updates) => set((state) => ({
    config: { ...state.config, ...updates }
  })),
  
  resetConfig: () => set({ 
    currentStep: 1, 
    config: { ...defaultConfig },
    pageLimitError: null,
  }),
  
  setPageLimitError: (error) => set({ pageLimitError: error }),
  
  getTotalCampaigns: () => {
    const { config } = get();
    // When DLO is enabled, media comes from language config, not Step 1 creatives
    const isDLO = config.languageConfig?.enabled && !config.useCatalog;
    const creativeCount = isDLO ? 1 : (config.selectedCreatives.length || 1);
    
    switch (config.distribution) {
      case 'campaign':
        // Criativos são distribuídos a nível de campanha
        // Mínimo = número de criativos (1 criativo por campanha)
        return Math.max(creativeCount, config.campaignsPerCreative);
      case 'adset':
      case 'ad':
        // Criativos são distribuídos em níveis inferiores
        return config.campaignsPerCreative;
      default:
        return 1;
    }
  },
  
  getTotalAdsets: () => {
    const { config } = get();
    const isDLO = config.languageConfig?.enabled && !config.useCatalog;
    const creativeCount = isDLO ? 1 : (config.selectedCreatives.length || 1);
    const totalCampaigns = get().getTotalCampaigns();
    
    if (config.distribution === 'adset') {
      // Criativos são distribuídos a nível de conjunto
      // Cada campanha precisa ter pelo menos X conjuntos para acomodar criativos
      const adsetsNeeded = Math.max(creativeCount, config.adsetsPerCampaign);
      return totalCampaigns * adsetsNeeded;
    }
    
    return totalCampaigns * config.adsetsPerCampaign;
  },
  
  getTotalAds: () => {
    const { config } = get();
    const isDLO = config.languageConfig?.enabled && !config.useCatalog;
    const creativeCount = isDLO ? 1 : (config.selectedCreatives.length || 1);
    const totalAdsets = get().getTotalAdsets();
    
    if (config.distribution === 'ad') {
      // Criativos são distribuídos a nível de anúncio
      // Cada conjunto tem todos os criativos como anúncios
      return totalAdsets * Math.max(creativeCount, config.adsPerAdset);
    }
    
    return totalAdsets * config.adsPerAdset;
  },
  
  getTotalBudget: () => {
    const { config } = get();
    const totalCampaigns = get().getTotalCampaigns();
    
    // Check if we have multi-currency budgets configured
    const budgetConfig = config.useCBO ? config.budgetByCurrency : config.adsetBudgetByCurrency;
    const hasMultiCurrency = Object.keys(budgetConfig).some(c => budgetConfig[c] > 0);
    
    if (hasMultiCurrency) {
      // Return sum of all currency budgets (for display purposes only)
      // Note: This is a simplified total - actual per-currency totals should use getBudgetsByCurrency
      const multiplier = config.useCBO ? totalCampaigns : get().getTotalAdsets();
      return Object.values(budgetConfig).reduce((sum, v) => sum + (v * multiplier), 0);
    }
    
    if (!config.useCBO) {
      // ABO mode: budget is per ad set
      const totalAdsets = get().getTotalAdsets();
      return totalAdsets * config.adsetBudget;
    }
    
    // CBO mode: budget is per campaign
    return totalCampaigns * config.budget;
  },
  
  /**
   * Get total budgets per currency for multi-currency campaigns
   * Returns an object like { "BRL": 5000, "USD": 1000 }
   */
  getBudgetsByCurrency: () => {
    const { config } = get();
    const totalCampaigns = get().getTotalCampaigns();
    const totalAdsets = get().getTotalAdsets();
    
    const budgetConfig = config.useCBO ? config.budgetByCurrency : config.adsetBudgetByCurrency;
    const multiplier = config.useCBO ? totalCampaigns : totalAdsets;
    const baseBudget = config.useCBO ? config.budget : config.adsetBudget;
    
    // Check if we have specific currency budgets
    const hasMultiCurrency = Object.keys(budgetConfig).some(c => budgetConfig[c] > 0);
    
    if (hasMultiCurrency) {
      const result: Record<string, number> = {};
      for (const [currency, value] of Object.entries(budgetConfig)) {
        if (value > 0) {
          result[currency] = value * multiplier;
        }
      }
      return result;
    }
    
    // Fallback to single default budget (BRL as default)
    return { 'BRL': baseBudget * multiplier };
  },
}));
