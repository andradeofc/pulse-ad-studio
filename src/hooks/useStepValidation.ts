import { useMemo } from 'react';
import { useCampaignStore } from '@/stores/campaignStore';

export interface StepValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AllStepsValidation {
  step1: StepValidation;
  step2: StepValidation;
  step3: StepValidation;
  step4: StepValidation;
  step5: StepValidation;
  canProceedToStep: (targetStep: number) => boolean;
  getStepValidation: (step: number) => StepValidation;
}

/**
 * Hook for validating each step of the campaign creation wizard.
 * Provides validation errors and warnings for each step.
 */
export function useStepValidation(): AllStepsValidation {
  const { config, pageLimitError } = useCampaignStore();

  const step1 = useMemo((): StepValidation => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // For catalog mode or DLO mode, creatives are optional (media comes from config)
    const isDLO = config.languageConfig?.enabled && !config.useCatalog;
    if (!config.useCatalog && !isDLO && config.selectedCreatives.length === 0) {
      errors.push('Selecione pelo menos um criativo');
    }
    
    if (config.selectedCreatives.length > 50) {
      warnings.push('Muitos criativos selecionados pode aumentar o tempo de processamento');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }, [config.selectedCreatives, config.useCatalog, config.languageConfig]);

  const step2 = useMemo((): StepValidation => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (config.selectedAccounts.length === 0) {
      errors.push('Selecione pelo menos uma conta de anúncios');
    }

    if (!config.campaignName || config.campaignName.trim() === '') {
      errors.push('Digite um nome para a campanha');
    }

    if (config.useCBO && config.budget <= 0) {
      errors.push('O orçamento da campanha deve ser maior que zero');
    }
    
    if (config.selectedAccounts.length > 10) {
      warnings.push('Criar para muitas contas simultaneamente pode demorar');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }, [config.selectedAccounts, config.campaignName, config.useCBO, config.budget]);

  const step3 = useMemo((): StepValidation => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Pixel is required for SALES objective
    if (config.objective === 'OUTCOME_SALES' && !config.pixelId) {
      errors.push('Selecione um Pixel para o objetivo VENDAS');
    }

    // Catalog mode requires catalog and product set
    if (config.useCatalog) {
      if (!config.catalogId) {
        errors.push('Selecione um catálogo para usar Dynamic Ads');
      }
      if (!config.productSetId) {
        errors.push('Selecione um conjunto de produtos');
      }
    }

    if (!config.adsetName || config.adsetName.trim() === '') {
      errors.push('Digite um nome para o conjunto de anúncios');
    }

    if (!config.useCBO && config.adsetBudget <= 0) {
      errors.push('O orçamento do conjunto deve ser maior que zero');
    }

    // Validate geo targeting
    if (!config.geoLocations.countries || config.geoLocations.countries.length === 0) {
      errors.push('Selecione pelo menos um país para segmentação');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }, [
    config.objective, 
    config.pixelId, 
    config.useCatalog, 
    config.catalogId, 
    config.productSetId,
    config.adsetName,
    config.useCBO,
    config.adsetBudget,
    config.geoLocations
  ]);

  const step4 = useMemo((): StepValidation => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (config.selectedPages.length === 0) {
      errors.push('Selecione pelo menos uma página do Facebook');
    }

    if (!config.adName || config.adName.trim() === '') {
      errors.push('Digite um nome para o anúncio');
    }

    // DLO validation
    if (config.languageConfig?.enabled && !config.useCatalog) {
      const dl = config.languageConfig.defaultLanguage;
      if (!dl.locale || dl.locale === 0) {
        errors.push('DLO: Selecione o idioma padrão');
      }
      if (!dl.primaryText || dl.primaryText.trim() === '') {
        errors.push('DLO: Texto principal do idioma padrão é obrigatório');
      }
      if (!dl.headline || dl.headline.trim() === '') {
        errors.push('DLO: Título do idioma padrão é obrigatório');
      }
      if (!dl.websiteUrl || dl.websiteUrl.trim() === '') {
        errors.push('DLO: URL do idioma padrão é obrigatória');
      }
      if (config.languageConfig.secondaryLanguages.length === 0) {
        errors.push('DLO: Adicione pelo menos 1 idioma secundário');
      }
      
      const usedLocales = new Set<number>();
      if (dl.locale > 0) usedLocales.add(dl.locale);
      
      config.languageConfig.secondaryLanguages.forEach((lang, i) => {
        if (!lang.locale || lang.locale === 0) {
          errors.push(`DLO: Idioma ${i + 2} não tem locale selecionado`);
        } else if (usedLocales.has(lang.locale)) {
          errors.push(`DLO: Idioma ${i + 2} tem locale duplicado`);
        } else {
          usedLocales.add(lang.locale);
        }
        if (!lang.useDefaultMedia && !lang.mediaId) {
          errors.push(`DLO: Idioma ${i + 2} precisa de mídia selecionada`);
        }
      });
    } else {
      // Non-DLO validation: destination URL is required for non-catalog
      if (!config.useCatalog && !config.destinationUrl) {
        errors.push('Digite a URL de destino do anúncio');
      }

      // Validate URL format if provided
      if (config.destinationUrl) {
        try {
          const url = config.destinationUrl.startsWith('http') 
            ? config.destinationUrl 
            : `https://${config.destinationUrl}`;
          new URL(url);
        } catch {
          errors.push('URL de destino inválida');
        }
      }
    }

    // Check page limit validation from store
    if (pageLimitError) {
      errors.push(pageLimitError);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }, [config.selectedPages, config.adName, config.useCatalog, config.destinationUrl, pageLimitError, config.languageConfig]);

  const step5 = useMemo((): StepValidation => {
    // Step 5 is review - just aggregate all previous validations
    const allErrors = [
      ...step1.errors,
      ...step2.errors,
      ...step3.errors,
      ...step4.errors,
    ];
    const allWarnings = [
      ...step1.warnings,
      ...step2.warnings,
      ...step3.warnings,
      ...step4.warnings,
    ];

    return { isValid: allErrors.length === 0, errors: allErrors, warnings: allWarnings };
  }, [step1, step2, step3, step4]);

  const getStepValidation = (step: number): StepValidation => {
    switch (step) {
      case 1: return step1;
      case 2: return step2;
      case 3: return step3;
      case 4: return step4;
      case 5: return step5;
      default: return { isValid: true, errors: [], warnings: [] };
    }
  };

  const canProceedToStep = (targetStep: number): boolean => {
    // Can always go back
    if (targetStep === 1) return true;
    
    // Check all previous steps are valid
    for (let i = 1; i < targetStep; i++) {
      if (!getStepValidation(i).isValid) {
        return false;
      }
    }
    return true;
  };

  return {
    step1,
    step2,
    step3,
    step4,
    step5,
    canProceedToStep,
    getStepValidation,
  };
}
