import { useState, useCallback } from 'react';
import { Sparkles, Shield, Edit3, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCampaignStore } from '@/stores/campaignStore';
import { PageSelector } from '@/components/campaign/PageSelector';
import { NamingModal } from '@/components/campaign/NamingModal';
import { DLOLanguageSection } from '@/components/campaign/DLOLanguageSection';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// CTA options mapped to Facebook API call_to_action.type values
const ctaOptions = [
  { value: 'LEARN_MORE', label: 'Saiba Mais' },
  { value: 'SHOP_NOW', label: 'Comprar Agora' },
  { value: 'SIGN_UP', label: 'Cadastre-se' },
  { value: 'DOWNLOAD', label: 'Baixar' },
  { value: 'SUBSCRIBE', label: 'Inscrever-se' },
  { value: 'WATCH_MORE', label: 'Assistir Mais' },
  { value: 'CONTACT_US', label: 'Fale Conosco' },
  { value: 'APPLY_NOW', label: 'Solicitar Agora' },
  { value: 'GET_OFFER', label: 'Obter Oferta' },
  { value: 'GET_QUOTE', label: 'Solicitar Orçamento' },
  { value: 'BUY_NOW', label: 'Comprar' },
  { value: 'ORDER_NOW', label: 'Pedir Agora' },
  { value: 'BOOK_TRAVEL', label: 'Reservar' },
  { value: 'SEE_MORE', label: 'Ver Mais' },
  { value: 'SEND_MESSAGE', label: 'Enviar Mensagem' },
  { value: 'WHATSAPP_MESSAGE', label: 'WhatsApp' },
  { value: 'CALL_NOW', label: 'Ligar Agora' },
  { value: 'GET_DIRECTIONS', label: 'Como Chegar' },
];

export function Step4Ads() {
  const { config, updateConfig, getTotalAds, setPageLimitError } = useCampaignStore();
  const totalAds = getTotalAds();
  const accountsCount = config.selectedAccounts.length || 1;
  const totalAdsAllAccounts = totalAds * accountsCount;
  const [namingModalOpen, setNamingModalOpen] = useState(false);

  const handleApplyNaming = (template: string) => {
    updateConfig({ adName: template });
  };

  // Handle page limit validation callback - update store
  const handlePageValidation = useCallback((isValid: boolean, error?: string) => {
    setPageLimitError(isValid ? null : (error || 'Limite de páginas excedido'));
  }, [setPageLimitError]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Configuração dos Anúncios</h2>
        <p className="text-muted-foreground">
          Defina o conteúdo, página e rastreamento dos anúncios
        </p>
      </div>

      {/* Anti-Spy Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Sistema Anti-Spy
          </h3>
          <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">Add-on ativo</Badge>
        </div>

        <Card className={config.antiSpyEnabled ? "border-primary/50 bg-primary/5" : "border-border"}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <Label className="text-foreground">Ativar Anti-Spy</Label>
                  <p className="text-sm text-muted-foreground">
                    Distribui automaticamente seus anúncios em várias páginas
                  </p>
                </div>
              </div>
              <Switch
                checked={config.antiSpyEnabled}
                onCheckedChange={(checked) => {
                  updateConfig({ antiSpyEnabled: checked });
                  if (!checked) {
                    // Reset to single page mode
                    updateConfig({ selectedPages: config.selectedPages.slice(0, 1) });
                  }
                }}
              />
            </div>

            <div className="pt-4 border-t border-border">
              {config.antiSpyEnabled ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">
                      {totalAdsAllAccounts.toLocaleString('pt-BR')} anúncios a criar
                      {accountsCount > 1 && (
                        <span className="text-xs ml-1">({totalAds} × {accountsCount} contas)</span>
                      )}
                    </span>
                  </div>
                  <PageSelector
                    selectedPages={config.selectedPages}
                    onSelectionChange={(pages, pageNames) => updateConfig({ selectedPages: pages, pageNames })}
                    multiSelect={true}
                    totalAdsToCreate={totalAdsAllAccounts}
                    onValidationChange={handlePageValidation}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Warning for single page mode when ads exceed limit */}
                  {totalAdsAllAccounts > 250 && (
                    <Alert className="border-ads-warning/30 bg-ads-warning/10">
                      <AlertTriangle className="h-4 w-4 text-ads-warning" />
                      <AlertTitle className="text-ads-warning">Ative o Anti-Spy</AlertTitle>
                      <AlertDescription className="text-ads-warning/80">
                        Você está criando <strong>{totalAdsAllAccounts.toLocaleString('pt-BR')}</strong> anúncios. 
                        Uma única página suporta no máximo 250 anúncios ativos. 
                        Ative o Anti-Spy para distribuir entre múltiplas páginas.
                      </AlertDescription>
                    </Alert>
                  )}
                  <PageSelector
                    selectedPages={config.selectedPages}
                    onSelectionChange={(pages, pageNames) => updateConfig({ selectedPages: pages, pageNames })}
                    multiSelect={false}
                    totalAdsToCreate={totalAdsAllAccounts}
                    onValidationChange={handlePageValidation}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Ad Name Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Nome do Anúncio
        </h3>

        <div className="flex gap-2">
          <div 
            className="flex-1 relative cursor-pointer group"
            onClick={() => setNamingModalOpen(true)}
          >
            <Input
              value={config.adName}
              readOnly
              placeholder="Clique para configurar nomenclatura..."
              className="bg-secondary/50 font-mono text-sm cursor-pointer pr-10 hover:border-primary/50 transition-colors"
            />
            <Edit3 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <Button variant="outline" onClick={() => setNamingModalOpen(true)}>
            <Sparkles className="w-4 h-4 mr-2" />
            Configurar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Clique no campo ou no botão para abrir o editor de nomenclatura com variáveis dinâmicas
        </p>
      </section>

      {/* Naming Modal */}
      <NamingModal
        open={namingModalOpen}
        onOpenChange={setNamingModalOpen}
        context="ad"
        value={config.adName}
        onApply={handleApplyNaming}
      />

      {/* Multi-Advertiser Section */}
      {/* API: contextual_multi_ads.enroll_status = OPT_IN | OPT_OUT */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Multi-Advertiser Ads
          </h3>
          <Badge variant="outline" className="text-xs font-mono">
            contextual_multi_ads
          </Badge>
        </div>

        <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <div>
              <Label className="text-foreground">Ativar Multi-Advertiser Ads</Label>
              <p className="text-sm text-muted-foreground">
                Permite que o Facebook exiba seu anúncio junto com outros anunciantes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge 
              variant="outline" 
              className={`text-xs font-mono ${config.multiAdvertiser ? 'bg-ads-success/20 text-ads-success border-ads-success/30' : 'bg-destructive/20 text-destructive border-destructive/30'}`}
            >
              {config.multiAdvertiser ? 'OPT_IN' : 'OPT_OUT'}
            </Badge>
            <Switch
              checked={config.multiAdvertiser}
              onCheckedChange={(checked) => updateConfig({ multiAdvertiser: checked })}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          A partir de Agosto 2024, o padrão da API é OPT_IN. Recomendamos manter desativado para controle total.
        </p>
      </section>

      {/* DLO Language Section - only for non-catalog campaigns */}
      {!config.useCatalog && (
        <DLOLanguageSection />
      )}

      {/* Ad Content Section */}
      {/* API: object_story_spec.link_data fields */}
      {/* Hidden when DLO is enabled (content comes from language config) */}
      {(!config.languageConfig.enabled || config.useCatalog) && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Conteúdo do Anúncio
            </h3>
            <Badge variant="outline" className="text-xs font-mono">
              link_data
            </Badge>
          </div>

          <div className="space-y-4">
            {/* Primary Text - API: message */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Texto Principal</Label>
                <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                  message
                </Badge>
              </div>
              <Textarea
                value={config.primaryText}
                onChange={(e) => updateConfig({ primaryText: e.target.value })}
                placeholder="Descubra o segredo para uma pele radiante! 🌟 Nosso sérum revolucionário..."
                className="bg-secondary/50 min-h-[100px] resize-none"
                maxLength={2200}
              />
              <p className="text-xs text-muted-foreground">
                O texto principal aparece acima da mídia do anúncio (recomendado: até 125 caracteres · máx: 2.200)
              </p>
            </div>

            {/* Headline - API: name */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Título (Headline)</Label>
                <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                  name
                </Badge>
              </div>
              <Input
                value={config.headline}
                onChange={(e) => updateConfig({ headline: e.target.value })}
                placeholder="Transforme sua pele em 7 dias"
                className="bg-secondary/50"
                maxLength={40}
              />
              <p className="text-xs text-muted-foreground">
                Aparece em destaque abaixo da mídia (máx. 40 caracteres)
              </p>
            </div>

            {/* Description - API: description */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Descrição</Label>
                <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                  description
                </Badge>
              </div>
              <Input
                value={config.description}
                onChange={(e) => updateConfig({ description: e.target.value })}
                placeholder="Frete grátis para todo Brasil"
                className="bg-secondary/50"
                maxLength={90}
              />
              <p className="text-xs text-muted-foreground">
                Texto adicional abaixo do título (nem sempre visível, máx. 90 caracteres)
              </p>
            </div>
          </div>

          {/* Dynamic Variables Info */}
          <div className="p-4 bg-ads-warning/10 rounded-lg border border-ads-warning/20">
            <p className="text-sm text-ads-warning">
              Use {`{{conta_nome}}`}, {`{{conta_apelido}}`}, {`{{criativo}}`} nos textos para personalização dinâmica por conta/anúncio
            </p>
          </div>
        </section>
      )}

      {/* Link and CTA Section */}
      {/* API: link_data.link, link_data.call_to_action */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Link e Ação
          </h3>
          <Badge variant="outline" className="text-xs font-mono">
            call_to_action
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Destination URL - API: link (hidden when DLO enabled) */}
          {(!config.languageConfig.enabled || config.useCatalog) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>URL de Destino</Label>
                <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                  link
                </Badge>
              </div>
              <Input
                type="url"
                value={config.destinationUrl}
                onChange={(e) => updateConfig({ destinationUrl: e.target.value })}
                placeholder="https://seusite.com/oferta"
                className="bg-secondary/50"
              />
              <p className="text-xs text-muted-foreground">
                Link de destino do anúncio (obrigatório)
              </p>
            </div>
          )}
          
          {/* CTA Button - API: call_to_action.type */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Botão de Ação (CTA)</Label>
              <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                type
              </Badge>
            </div>
            <Select
              value={config.ctaType}
              onValueChange={(value) => updateConfig({ ctaType: value })}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ctaOptions.map((cta) => (
                  <SelectItem key={cta.value} value={cta.value}>
                    <div className="flex items-center gap-2">
                      <span>{cta.label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {cta.value}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Tracking Section */}
      {/* API: url_tags */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Rastreamento
          </h3>
          <Badge variant="outline" className="text-xs font-mono">
            url_tags
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>Parâmetros de URL</Label>
            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
              url_tags
            </Badge>
          </div>
          <Textarea
            value={config.urlParams}
            onChange={(e) => updateConfig({ urlParams: e.target.value })}
            placeholder="utm_source=facebook&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}"
            className="bg-secondary/50 font-mono text-sm min-h-[80px] resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Parâmetros adicionados automaticamente à URL de destino (não incluir "?" inicial)
          </p>
        </div>

        <div className="p-4 bg-secondary/30 rounded-lg space-y-2">
          <p className="text-xs font-medium text-foreground">Variáveis Dinâmicas do Facebook (suportadas na API):</p>
          <p className="text-xs text-muted-foreground font-mono">
            {`{{campaign.name}}`}, {`{{campaign.id}}`}, {`{{adset.name}}`}, {`{{adset.id}}`}, {`{{ad.name}}`}, {`{{ad.id}}`}, {`{{placement}}`}, {`{{site_source_name}}`}
          </p>
          <p className="text-xs font-medium text-foreground mt-3">Variáveis Personalizadas (substituídas antes do envio):</p>
          <p className="text-xs text-muted-foreground font-mono">
            {`{{conta_nome}}`}, {`{{conta_apelido}}`}, {`{{conta_id}}`}, {`{{criativo}}`}
          </p>
        </div>
      </section>
    </div>
  );
}
