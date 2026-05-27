import { useState } from 'react';
import { Edit3, Sparkles, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useCampaignStore } from '@/stores/campaignStore';
import { NamingModal } from '../NamingModal';
import { PixelSelector } from '../PixelSelector';
import { ProductSetSelector } from '../ProductSetSelector';

// Import sub-components
import { Step3DistributionSection } from './Step3DistributionSection';
import { Step3BudgetSection } from './Step3BudgetSection';
import { Step3AudienceSection } from './Step3AudienceSection';
import { Step3PlacementsSection } from './Step3PlacementsSection';
import { Step3AttributionSection } from './Step3AttributionSection';
import { Step3ScheduleSection } from './Step3ScheduleSection';

export function Step3Adsets() {
  const { config, updateConfig } = useCampaignStore();
  const [adsetNamingModalOpen, setAdsetNamingModalOpen] = useState(false);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Configuração da Estrutura</h2>
        <p className="text-muted-foreground">
          Defina quantas Campanhas, Conjuntos e Anúncios criar
        </p>
      </div>

      {/* Distribution & Quantities */}
      <Step3DistributionSection />

      {/* Adset Budget (if ABO) */}
      <Step3BudgetSection />

      {/* Adset Name */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Nome do Conjunto
        </h3>

        <div className="space-y-2">
          <div className="flex gap-2">
            <div 
              className="flex-1 relative cursor-pointer group"
              onClick={() => setAdsetNamingModalOpen(true)}
            >
              <Input
                value={config.adsetName}
                readOnly
                placeholder="Clique para configurar nomenclatura..."
                className="bg-secondary/50 font-mono text-sm cursor-pointer pr-10 hover:border-primary/50 transition-colors"
              />
              <Edit3 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <Button variant="outline" onClick={() => setAdsetNamingModalOpen(true)}>
              <Sparkles className="w-4 h-4 mr-2" />
              Configurar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Clique no campo ou no botão para abrir o editor de nomenclatura com variáveis dinâmicas
          </p>
        </div>
      </section>

      {/* Adset Naming Modal */}
      <NamingModal
        open={adsetNamingModalOpen}
        onOpenChange={setAdsetNamingModalOpen}
        context="adset"
        value={config.adsetName}
        onApply={(template) => updateConfig({ adsetName: template })}
      />

      {/* Pixel Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Pixel de Conversão
          </h3>
          {config.objective === 'OUTCOME_SALES' && (
            <Badge variant="destructive" className="text-xs">Obrigatório</Badge>
          )}
        </div>

        <PixelSelector
          value={config.pixelId}
          onChange={(pixelId) => updateConfig({ pixelId })}
        />
        
        <p className="text-xs text-muted-foreground">
          Busque pelo nome ou ID do pixel. Clique no botão de sincronizar para atualizar a lista do Facebook.
        </p>
      </section>

      {/* Product Set Section - Shown when Dynamic Ads is enabled */}
      {config.useCatalog && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Conjunto de Produtos
            </h3>
            <Badge variant="secondary" className="text-xs bg-pink-500/20 text-pink-400 border-pink-500/30">
              DPA
            </Badge>
            <Badge variant="outline" className="text-xs font-mono">
              product_set_id
            </Badge>
          </div>

          <div className="p-4 bg-secondary/30 rounded-lg border border-border space-y-4">
            {config.catalogId ? (
              <>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Layers className="w-4 h-4" />
                  <span>Catálogo selecionado: <strong className="text-foreground">{config.catalogId}</strong></span>
                </div>



                <ProductSetSelector
                  catalogDbId={config.catalogDbId}
                  catalogId={config.catalogId}
                  value={config.productSetId}
                  onChange={(productSetId, productSetName) => updateConfig({ productSetId, productSetName })}
                />
              </>
            ) : (
              <div className="text-center py-4">
                <Layers className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Selecione um catálogo na etapa anterior (Campanha) para escolher o conjunto de produtos.
                </p>
              </div>
            )}
          </div>
          
          <p className="text-xs text-muted-foreground">
            {config.catalogScope === 'ad'
              ? <>O <code className="px-1 py-0.5 bg-secondary rounded">product_set_id</code> será enviado <strong>apenas no anúncio</strong> (adcreative). O conjunto de anúncios receberá só o <code className="px-1 py-0.5 bg-secondary rounded">product_catalog_id</code>.</>
              : <>Será enviado como <code className="px-1 py-0.5 bg-secondary rounded">promoted_object.product_set_id</code> no conjunto de anúncios.</>}
          </p>
        </section>
      )}

      {/* Audience Section */}
      <Step3AudienceSection />

      {/* Placements Section */}
      <Step3PlacementsSection />

      {/* Attribution Settings */}
      <Step3AttributionSection />

      {/* Schedule */}
      <Step3ScheduleSection />
    </div>
  );
}
