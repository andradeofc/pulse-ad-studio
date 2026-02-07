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

export interface CampaignConfig {
  // Step 1 - Creatives
  selectedCreatives: Creative[];
  
  // Step 2 - Campaign
  multiAccountMode: boolean;
  selectedAccounts: string[];
  isPaused: boolean;
  campaignName: string;
  objective: string;
  campaignType: 'cbo' | 'abo' | 'catalog';
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
  adsetBudgetPeriod: 'daily' | 'lifetime';
  shareAdsetBudget: boolean;
  adsetName: string;
  pixelId: string;
  catalogId: string;
  businessManagerId: string;
  catalogImage: string;
  duplicateProducts: number;
  advantagePlus: boolean;
  locations: string[];
  ageMin: number;
  ageMax: number;
  gender: 'all' | 'male' | 'female';
  languages: string[];
  autoPlacement: boolean;
  scheduleStart: Date | null;
  scheduleEnd: Date | null;
  
  // Step 4 - Ads
  antiSpyEnabled: boolean;
  selectedPages: string[];
  adName: string;
  multiAdvertiser: boolean;
  primaryText: string;
  headline: string;
  description: string;
  destinationUrl: string;
  ctaType: string;
  urlParams: string;
}

interface CampaignState {
  currentStep: number;
  config: CampaignConfig;
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateConfig: (updates: Partial<CampaignConfig>) => void;
  resetConfig: () => void;
  
  // Computed values
  getTotalCampaigns: () => number;
  getTotalAdsets: () => number;
  getTotalAds: () => number;
  getTotalBudget: () => number;
}

const defaultConfig: CampaignConfig = {
  selectedCreatives: [],
  multiAccountMode: false,
  selectedAccounts: [],
  isPaused: true,
  campaignName: '[CP{{sequencial:01}}][{{budget}}][{{estrutura}}][{{conta_apelido}}]',
  objective: 'sales',
  campaignType: 'cbo',
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
  adsetBudgetPeriod: 'daily',
  shareAdsetBudget: false,
  adsetName: '{{criativo}}_CJ{{conjunto}}',
  pixelId: '',
  catalogId: '',
  businessManagerId: '',
  catalogImage: '',
  duplicateProducts: 5,
  advantagePlus: true,
  locations: ['Brasil'],
  ageMin: 18,
  ageMax: 65,
  gender: 'all',
  languages: ['Português (Brasil)'],
  autoPlacement: true,
  scheduleStart: null,
  scheduleEnd: null,
  antiSpyEnabled: false,
  selectedPages: [],
  adName: '{{criativo}}',
  multiAdvertiser: false,
  primaryText: '',
  headline: '',
  description: '',
  destinationUrl: '',
  ctaType: 'LEARN_MORE',
  urlParams: 'utm_medium={{adset.name}}',
};

export const useCampaignStore = create<CampaignState>((set, get) => ({
  currentStep: 1,
  config: { ...defaultConfig },
  
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
    config: { ...defaultConfig } 
  }),
  
  getTotalCampaigns: () => {
    const { config } = get();
    const creativeCount = config.selectedCreatives.length || 1;
    
    switch (config.distribution) {
      case 'campaign':
        return creativeCount * config.campaignsPerCreative;
      case 'adset':
      case 'ad':
        return config.campaignsPerCreative;
      default:
        return 1;
    }
  },
  
  getTotalAdsets: () => {
    const { config } = get();
    const totalCampaigns = get().getTotalCampaigns();
    return totalCampaigns * config.adsetsPerCampaign;
  },
  
  getTotalAds: () => {
    const { config } = get();
    const totalAdsets = get().getTotalAdsets();
    return totalAdsets * config.adsPerAdset;
  },
  
  getTotalBudget: () => {
    const { config } = get();
    const totalCampaigns = get().getTotalCampaigns();
    
    if (config.campaignType === 'abo') {
      const totalAdsets = get().getTotalAdsets();
      return totalAdsets * config.adsetBudget;
    }
    
    return totalCampaigns * config.budget;
  },
}));
