import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCampaignStore } from '@/stores/campaignStore';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useCreateCampaignJob } from '@/hooks/useCampaignJobs';
import { useToast } from '@/hooks/use-toast';

import { WizardStepper } from '@/components/campaign/WizardStepper';
import { CampaignSummary } from '@/components/campaign/CampaignSummary';
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
  const [isCreating, setIsCreating] = useState(false);
  const createJobMutation = useCreateCampaignJob();

  const totalCampaigns = getTotalCampaigns();
  const totalAdsets = getTotalAdsets();
  const totalAds = getTotalAds();

  const handleCreate = async () => {
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

    setIsCreating(true);
    
    try {
      // Build the job items structure
      const items: Array<{
        item_type: 'campaign' | 'adset' | 'ad';
        name: string;
        parent_index?: number;
        config?: Record<string, any>;
      }> = [];

      let itemIndex = 0;
      
      // Generate campaigns, adsets, and ads based on config
      for (let c = 0; c < totalCampaigns; c++) {
        const campaignName = config.campaignName
          .replace('{{sequencial:01}}', String(c + 1).padStart(2, '0'))
          .replace('{{budget}}', config.useCBO ? 'CBO' : 'ABO')
          .replace('{{estrutura}}', `${totalCampaigns}-${config.adsetsPerCampaign}-${config.adsPerAdset}`)
          .replace('{{conta_apelido}}', 'Conta');
        
        const campaignIndex = itemIndex;
        items.push({
          item_type: 'campaign',
          name: campaignName,
          config: { objective: config.objective },
        });
        itemIndex++;

        // Adsets per campaign
        const adsetsForThisCampaign = Math.ceil(totalAdsets / totalCampaigns);
        for (let a = 0; a < adsetsForThisCampaign; a++) {
          const adsetName = config.adsetName
            .replace('{{criativo}}', config.selectedCreatives[a % config.selectedCreatives.length]?.name || `Criativo${a + 1}`)
            .replace('{{conjunto}}', String(a + 1).padStart(2, '0'));

          const adsetIndex = itemIndex;
          items.push({
            item_type: 'adset',
            name: adsetName,
            parent_index: campaignIndex,
            config: { 
              pixelId: config.pixelId,
              catalogId: config.catalogId,
            },
          });
          itemIndex++;

          // Ads per adset
          const adsForThisAdset = Math.ceil(totalAds / totalAdsets);
          for (let ad = 0; ad < adsForThisAdset; ad++) {
            const adName = config.adName
              .replace('{{criativo}}', config.selectedCreatives[ad % config.selectedCreatives.length]?.name || `Criativo${ad + 1}`);

            items.push({
              item_type: 'ad',
              name: adName,
              parent_index: adsetIndex,
              config: {
                useCatalog: config.useCatalog,
                creativeId: config.selectedCreatives[ad % config.selectedCreatives.length]?.id,
              },
            });
            itemIndex++;
          }
        }
      }

      // Create the job name
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '_');
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', '_');
      const jobName = `[${config.useCatalog ? 'CAT' : 'CRE'}|${config.useCBO ? 'CBO' : 'ABO'}][${totalCampaigns}-${config.adsetsPerCampaign}-${config.adsPerAdset}][${dateStr}][${timeStr}]`;

      await createJobMutation.mutateAsync({
        name: jobName,
        config: config as any,
        totalCampaigns,
        totalAdsets,
        totalAds,
        accountsCount: config.selectedAccounts.length || 1,
        items,
      });
      
      resetConfig();
      navigate('/fila-processamento');
    } catch (error) {
      console.error('Error creating campaign job:', error);
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
              <Button onClick={nextStep} className="glow-primary">
                Continuar
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button 
                onClick={handleCreate}
                disabled={isCreating}
                className="glow-primary bg-ads-success hover:bg-ads-success/90"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Criando...
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
        <div className="hidden lg:block">
          <CampaignSummary />
        </div>
      </div>
    </div>
  );
}
