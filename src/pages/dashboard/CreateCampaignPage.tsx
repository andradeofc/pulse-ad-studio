import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Loader2, AlertTriangle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCampaignStore } from '@/stores/campaignStore';
import { useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useCreateCampaignJob } from '@/hooks/useCampaignJobs';
import { useToast } from '@/hooks/use-toast';
import { estimateRateLimitUsage } from '@/lib/rateLimitCalculator';
import { resolveTemplate } from '@/lib/namingResolver';
import { useStepValidation } from '@/hooks/useStepValidation';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { WizardStepper } from '@/components/campaign/WizardStepper';
import { CampaignSummary } from '@/components/campaign/CampaignSummary';
import { NamingPreview } from '@/components/campaign/NamingPreview';
import { UnsavedChangesDialog } from '@/components/campaign/UnsavedChangesDialog';
import { Step1Creatives } from '@/components/campaign/steps/Step1Creatives';
import { Step2Campaign } from '@/components/campaign/steps/Step2Campaign';
import { Step3Adsets } from '@/components/campaign/steps/Step3Adsets';
import { Step4Ads } from '@/components/campaign/steps/Step4Ads';
import { Step5Review } from '@/components/campaign/steps/Step5Review';

const steps = [
  { number: 1, title: 'Criativos' },
  { number: 2, title: 'Campanha' },
  { number: 3, title: 'Conjuntos' },
  { number: 4, title: 'Anúncios' },
  { number: 5, title: 'Revisão' },
];

export default function CreateCampaignPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const { 
    currentStep, 
    setStep,
    nextStep, 
    prevStep, 
    getTotalCampaigns, 
    getTotalAdsets,
    getTotalAds,
    config,
    resetConfig 
  } = useCampaignStore();
  
  // Step validation
  const validation = useStepValidation();
  const currentStepValidation = validation.getStepValidation(currentStep);
  
  const [isCreating, setIsCreating] = useState(false);
  const [showRateLimitWarning, setShowRateLimitWarning] = useState(false);
  const [jobSubmitted, setJobSubmitted] = useState(false); // Prevent double submission
  const createJobMutation = useCreateCampaignJob();

  const totalCampaigns = getTotalCampaigns();
  const totalAdsets = getTotalAdsets();
  const totalAds = getTotalAds();

  // Check if user has started filling the wizard (has unsaved changes)
  const hasUnsavedChanges = useMemo(() => {
    return (
      config.selectedCreatives.length > 0 ||
      config.selectedAccounts.length > 0 ||
      config.selectedPages.length > 0 ||
      config.campaignName !== '' ||
      currentStep > 1
    );
  }, [config.selectedCreatives, config.selectedAccounts, config.selectedPages, config.campaignName, currentStep]);

  // Unsaved changes warning
  const { isBlocked, proceed, reset, message } = useUnsavedChangesWarning({
    hasUnsavedChanges,
    message: 'Você tem uma campanha em criação. Deseja realmente sair?',
  });

  // Calculate rate limit estimate
  const rateLimitEstimate = useMemo(() => {
    const accountsCount = config.selectedAccounts.length || 1;
    return estimateRateLimitUsage(
      totalCampaigns,
      config.adsetsPerCampaign,
      config.adsPerAdset,
      config.useCatalog,
      0,
      accountsCount
    );
  }, [totalCampaigns, config.adsetsPerCampaign, config.adsPerAdset, config.useCatalog, config.selectedAccounts.length]);

  const handleCreate = async () => {
    // CRITICAL: Prevent double submission
    if (isCreating || jobSubmitted || createJobMutation.isPending) {
      console.warn('[CreateCampaignPage] Blocked duplicate submission attempt');
      return;
    }

    const requiresPixel = config.objective === 'OUTCOME_SALES';
    if (requiresPixel && !config.pixelId) {
      toast({
        title: 'Pixel obrigatório',
        description: 'Para o objetivo VENDAS com otimização de conversões no site, selecione um Pixel no Step 3 (Conjuntos).',
        variant: 'destructive',
      });
      setStep(3);
      return;
    }

    // Show info dialog for large jobs (not blocking, just informational)
    if ((rateLimitEstimate.isOverLimit || rateLimitEstimate.warningLevel !== 'safe') && !showRateLimitWarning) {
      setShowRateLimitWarning(true);
      return;
    }

    await proceedWithCreation();
  };

  const proceedWithCreation = async () => {
    // CRITICAL: Mark as submitted immediately to prevent any race conditions
    if (jobSubmitted) {
      console.warn('[CreateCampaignPage] Job already submitted, blocking duplicate');
      return;
    }
    
    setJobSubmitted(true);
    setShowRateLimitWarning(false);
    setIsCreating(true);
    
    try {
      // Fetch account details for all selected accounts
      const { data: accountsData } = await supabase
        .from('facebook_ad_accounts')
        .select('id, account_id, name')
        .in('id', config.selectedAccounts);
      
      const accountsMap = new Map(
        (accountsData || []).map(acc => [acc.id, { accountId: acc.account_id, accountName: acc.name }])
      );
      
      // Build the job items structure
      // For multi-account mode, create separate items for EACH account
      const items: Array<{
        item_type: 'campaign' | 'adset' | 'ad';
        name: string;
        parent_index?: number;
        config?: Record<string, any>;
      }> = [];

      const accountsToProcess = config.selectedAccounts.length || 1;
      
      // IMPORTANT: totalCampaigns/totalAdsets/totalAds are PER ACCOUNT, not global
      // The store returns the structure for ONE account
      const campaignsPerAccount = totalCampaigns;
      const adsetsPerAccount = totalAdsets;
      const adsPerAccount = totalAds;
      
      // Build context for name resolution
      const baseContext = {
        budget: config.useCBO ? 'CBO' as const : 'ABO' as const,
        structure: `${campaignsPerAccount}-${config.adsetsPerCampaign}-${config.adsPerAdset}`,
        productSetName: config.productSetName,
        catalogName: config.catalogName,
        pageNames: config.pageNames,
        pageName: config.pageNames?.[0] || '',
        customVariables: config.customNamingVariables,
      };
      
      let itemIndex = 0;
      
      // For each account (or once if single account)
      for (let accountIdx = 0; accountIdx < accountsToProcess; accountIdx++) {
        const accountDbId = config.selectedAccounts[accountIdx];
        const accountInfo = accountsMap.get(accountDbId) || { accountId: '', accountName: 'Conta' };
        const { accountId, accountName } = accountInfo;
        
        // Generate campaigns, adsets, and ads for THIS account
        // Use campaignsPerAccount (NOT totalCampaigns which could be multiplied elsewhere)
        for (let c = 0; c < campaignsPerAccount; c++) {
          // Resolve campaign name using the naming resolver
          const campaignName = resolveTemplate(config.campaignName, {
            ...baseContext,
            campaignIndex: c,
            accountName: accountName,
          });
          
          const campaignIndex = itemIndex;
          items.push({
            item_type: 'campaign',
            name: campaignName,
            config: { 
              objective: config.objective,
              accountId,
              accountName,
            },
          });
          itemIndex++;

          // Adsets per campaign - calculate correctly based on per-account values
          const adsetsForThisCampaign = Math.ceil(adsetsPerAccount / campaignsPerAccount);
          for (let a = 0; a < adsetsForThisCampaign; a++) {
            const creativeName = config.selectedCreatives[a % config.selectedCreatives.length]?.name || `Criativo${a + 1}`;
            
            // Resolve adset name
            const adsetName = resolveTemplate(config.adsetName, {
              ...baseContext,
              adsetIndex: a,
              creativeName,
            });

            const adsetIndex = itemIndex;
            items.push({
              item_type: 'adset',
              name: adsetName,
              parent_index: campaignIndex,
              config: { 
                pixelId: config.pixelId,
                catalogId: config.catalogId,
                accountId,
                accountName,
              },
            });
            itemIndex++;

            // Ads per adset - calculate correctly based on per-account values
            const adsForThisAdset = Math.ceil(adsPerAccount / adsetsPerAccount);
            for (let ad = 0; ad < adsForThisAdset; ad++) {
              const adCreativeName = config.selectedCreatives[ad % config.selectedCreatives.length]?.name || `Criativo${ad + 1}`;
              
              // Resolve ad name
              const adName = resolveTemplate(config.adName, {
                ...baseContext,
                adIndex: ad,
                creativeName: adCreativeName,
              });

              items.push({
                item_type: 'ad',
                name: adName,
                parent_index: adsetIndex,
                config: {
                  useCatalog: config.useCatalog,
                  creativeId: config.selectedCreatives[ad % config.selectedCreatives.length]?.id,
                  accountId,
                  accountName,
                },
              });
              itemIndex++;
            }
          }
        }
      }

      // Create the job name
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '_');
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', '_');
      const jobName = `[${config.useCatalog ? 'CAT' : 'CRE'}|${config.useCBO ? 'CBO' : 'ABO'}][${totalCampaigns}-${config.adsetsPerCampaign}-${config.adsPerAdset}][${dateStr}][${timeStr}]`;

      // Total counts: per-account values multiplied by number of accounts
      const finalTotalCampaigns = campaignsPerAccount * accountsToProcess;
      const finalTotalAdsets = adsetsPerAccount * accountsToProcess;
      const finalTotalAds = adsPerAccount * accountsToProcess;

      await createJobMutation.mutateAsync({
        name: jobName,
        config: config as any,
        totalCampaigns: finalTotalCampaigns,
        totalAdsets: finalTotalAdsets,
        totalAds: finalTotalAds,
        accountsCount: accountsToProcess,
        items,
      });
      
      resetConfig();
      navigate('/fila-processamento');
    } catch (error) {
      console.error('Error creating campaign job:', error);
      // Reset the submission flag on error so user can retry
      setJobSubmitted(false);
    } finally {
      setIsCreating(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1Creatives />;
      case 2:
        return <Step2Campaign />;
      case 3:
        return <Step3Adsets />;
      case 4:
        return <Step4Ads />;
      case 5:
        return <Step5Review />;
      default:
        return <Step1Creatives />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Criar Nova Campanha</h1>
        <p className="text-muted-foreground">Configure e lance suas campanhas em massa</p>
      </div>

      {/* Stepper */}
      <Card className="glass-card">
        <CardContent className="p-6">
          <WizardStepper currentStep={currentStep} steps={steps} />
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Step Content */}
        <div className="lg:col-span-2">
          <Card className="glass-card">
            <CardContent className="p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {renderStep()}
                </motion.div>
              </AnimatePresence>
            </CardContent>
          </Card>

          {/* Validation Errors */}
          {currentStepValidation.errors.length > 0 && (
            <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">Campos obrigatórios</p>
                  <ul className="text-sm text-destructive/80 space-y-0.5">
                    {currentStepValidation.errors.map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>

            {currentStep < 5 ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button 
                        onClick={() => {
                          if (currentStepValidation.isValid) {
                            nextStep();
                          } else {
                            toast({
                              title: 'Campos obrigatórios',
                              description: currentStepValidation.errors[0],
                              variant: 'destructive',
                            });
                          }
                        }}
                        className="glow-primary"
                        disabled={!currentStepValidation.isValid}
                      >
                        Continuar
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!currentStepValidation.isValid && (
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="font-medium mb-1">Pendências:</p>
                      <ul className="text-xs space-y-0.5">
                        {currentStepValidation.errors.slice(0, 3).map((error, i) => (
                          <li key={i}>• {error}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button 
                onClick={handleCreate}
                disabled={isCreating || jobSubmitted || createJobMutation.isPending || !validation.step5.isValid}
                className="glow-primary bg-ads-success hover:bg-ads-success/90"
              >
                {isCreating || jobSubmitted || createJobMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {jobSubmitted ? 'Enviando...' : 'Criando...'}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Criar {totalCampaigns} Campanha(s)
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Summary Sidebar */}
        <div className="hidden lg:block space-y-4">
          <CampaignSummary />
          
          {/* Dynamic Naming Preview */}
          {currentStep >= 2 && (
            <NamingPreview compact />
          )}
        </div>
      </div>

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        open={isBlocked}
        onCancel={() => reset?.()}
        onConfirm={() => {
          resetConfig();
          proceed?.();
        }}
        message={message}
      />

      {/* Rate Limit Info Dialog */}
      <AlertDialog open={showRateLimitWarning} onOpenChange={setShowRateLimitWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-ads-info" />
              {rateLimitEstimate.isOverLimit ? 'Job Grande Detectado' : 'Informação de Rate Limit'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Esta operação requer <strong>{rateLimitEstimate.totalPoints.toLocaleString()}</strong> pontos 
                  (limite por janela: 9.000).
                </p>
                <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                  <p>• <strong>{rateLimitEstimate.totalApiCalls}</strong> chamadas de API</p>
                  <p>• <strong>{totalCampaigns}</strong> campanhas × <strong>{config.adsetsPerCampaign}</strong> conjuntos × <strong>{config.adsPerAdset}</strong> anúncios</p>
                  <p>• Tempo estimado: <strong>~{Math.ceil(rateLimitEstimate.estimatedTimeSeconds / 60)} minuto(s)</strong></p>
                </div>
                
                {rateLimitEstimate.isOverLimit ? (
                  <div className="bg-ads-info/10 border border-ads-info/30 p-3 rounded-lg text-sm">
                    <p className="font-medium text-ads-info mb-1">🔄 Sistema de Fila Inteligente</p>
                    <p className="text-muted-foreground">
                      O job será processado em lotes automáticos. Quando atingir o limite, 
                      o sistema <strong>pausará automaticamente</strong> e retomará após 5 minutos. 
                      Você pode acompanhar o progresso na fila de processamento.
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Se o limite for atingido durante o processamento, o sistema pausará 
                    automaticamente e retomará quando disponível.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={proceedWithCreation} className="bg-ads-success hover:bg-ads-success/90">
              Enviar para Fila
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
