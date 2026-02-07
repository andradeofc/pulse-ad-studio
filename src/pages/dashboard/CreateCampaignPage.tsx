import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCampaignStore } from '@/stores/campaignStore';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

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
  const { currentStep, nextStep, prevStep, getTotalCampaigns, resetConfig } = useCampaignStore();
  const [isCreating, setIsCreating] = useState(false);

  const totalCampaigns = getTotalCampaigns();

  const handleCreate = async () => {
    setIsCreating(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    toast({
      title: 'Campanhas enviadas para a fila!',
      description: `${totalCampaigns} campanha(s) serão criadas em breve.`,
    });
    
    resetConfig();
    navigate('/fila-processamento');
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
