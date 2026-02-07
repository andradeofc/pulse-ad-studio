import { motion } from 'framer-motion';
import { RefreshCw, Shield, Facebook, ExternalLink } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useCampaignStore } from '@/stores/campaignStore';

const ctaOptions = [
  { value: 'LEARN_MORE', label: 'Saiba Mais' },
  { value: 'SHOP_NOW', label: 'Comprar Agora' },
  { value: 'SIGN_UP', label: 'Cadastre-se' },
  { value: 'DOWNLOAD', label: 'Baixar' },
  { value: 'SUBSCRIBE', label: 'Inscrever-se' },
  { value: 'WATCH_MORE', label: 'Assistir Mais' },
  { value: 'CONTACT_US', label: 'Fale Conosco' },
  { value: 'APPLY_NOW', label: 'Solicitar Agora' },
];

// Mock pages
const mockPages = [
  { id: '1', name: 'Página Principal', slots: 15 },
  { id: '2', name: 'Marca Secundária', slots: 8 },
  { id: '3', name: 'Landing Page Offers', slots: 12 },
  { id: '4', name: 'Promo Store', slots: 5 },
];

export function Step4Ads() {
  const { config, updateConfig, getTotalAds } = useCampaignStore();
  const totalAds = getTotalAds();
  const availablePages = mockPages.filter((p) => p.slots > 0);

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
                onCheckedChange={(checked) => updateConfig({ antiSpyEnabled: checked })}
              />
            </div>

            {config.antiSpyEnabled ? (
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {totalAds} anúncios · {availablePages.length} páginas disponíveis
                  </span>
                  <Button variant="link" size="sm" className="text-primary p-0 h-auto">
                    Gerenciar páginas
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {availablePages.slice(0, 3).map((page) => (
                    <div
                      key={page.id}
                      className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Facebook className="w-5 h-5 text-ads-info" />
                        <span className="text-sm text-foreground">{page.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {Math.ceil(totalAds / availablePages.length)} anúncio(s)
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {page.slots} slots
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                
                {availablePages.length > 3 && (
                  <Button variant="link" size="sm" className="text-muted-foreground p-0 h-auto">
                    Ver todas as {availablePages.length} páginas →
                  </Button>
                )}
              </div>
            ) : (
              <div className="pt-4 border-t border-border">
                <Label className="text-sm">Página do Facebook</Label>
                <Select>
                  <SelectTrigger className="bg-secondary/50 mt-2">
                    <SelectValue placeholder="Selecione uma página" />
                  </SelectTrigger>
                  <SelectContent>
                    {mockPages.map((page) => (
                      <SelectItem key={page.id} value={page.id}>
                        <div className="flex items-center gap-2">
                          <Facebook className="w-4 h-4" />
                          {page.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Ad Name Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Nome do Anúncio
        </h3>

        <div className="flex gap-2">
          <Input
            value={config.adName}
            onChange={(e) => updateConfig({ adName: e.target.value })}
            placeholder="{{criativo}}"
            className="bg-secondary/50 font-mono text-sm"
          />
          <Button variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Gerar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Se vazio, usa o nome do arquivo criativo
        </p>
      </section>

      {/* Multi-Advertiser Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Multi-Advertiser Ads
          </h3>
          <Badge variant="outline" className="text-xs">Opcional</Badge>
        </div>

        <div className="flex items-center space-x-3 p-4 bg-secondary/50 rounded-lg border border-border">
          <Checkbox
            id="multiAdvertiser"
            checked={config.multiAdvertiser}
            onCheckedChange={(checked) => updateConfig({ multiAdvertiser: checked as boolean })}
          />
          <div>
            <Label htmlFor="multiAdvertiser" className="text-foreground cursor-pointer">
              Ativar Multi-Advertiser Ads
            </Label>
            <p className="text-sm text-muted-foreground">
              Permite que o Facebook exiba seu anúncio junto com outros anunciantes
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Recomendado: Manter desativado para controle total
        </p>
      </section>

      {/* Ad Content Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Conteúdo do Anúncio
        </h3>

        <div className="space-y-4">
          {/* Primary Text */}
          <div className="space-y-2">
            <Label>Texto Principal</Label>
            <Textarea
              value={config.primaryText}
              onChange={(e) => updateConfig({ primaryText: e.target.value })}
              placeholder="Descubra o segredo para uma pele radiante! 🌟 Nosso sérum revolucionário..."
              className="bg-secondary/50 min-h-[100px] resize-none"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              O texto principal aparece acima da mídia do anúncio (recomendado: até 125 caracteres)
            </p>
          </div>

          {/* Headline */}
          <div className="space-y-2">
            <Label>Título (Headline)</Label>
            <Input
              value={config.headline}
              onChange={(e) => updateConfig({ headline: e.target.value })}
              placeholder="Transforme sua pele em 7 dias"
              className="bg-secondary/50"
              maxLength={40}
            />
            <p className="text-xs text-muted-foreground">
              Aparece em destaque abaixo da mídia
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input
              value={config.description}
              onChange={(e) => updateConfig({ description: e.target.value })}
              placeholder="Frete grátis para todo Brasil"
              className="bg-secondary/50"
              maxLength={90}
            />
            <p className="text-xs text-muted-foreground">
              Texto adicional (nem sempre visível)
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

      {/* Link and CTA Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Link e Ação
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>URL de Destino</Label>
            <Input
              type="url"
              value={config.destinationUrl}
              onChange={(e) => updateConfig({ destinationUrl: e.target.value })}
              placeholder="https://seusite.com/oferta"
              className="bg-secondary/50"
            />
            <p className="text-xs text-muted-foreground">
              Link de destino do anúncio
            </p>
          </div>
          <div className="space-y-2">
            <Label>Botão de Ação (CTA)</Label>
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
                    {cta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Tracking Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Rastreamento
        </h3>

        <div className="space-y-2">
          <Label>Parâmetros de URL</Label>
          <Textarea
            value={config.urlParams}
            onChange={(e) => updateConfig({ urlParams: e.target.value })}
            placeholder="utm_medium={{adset.name}}"
            className="bg-secondary/50 font-mono text-sm min-h-[80px] resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Parâmetros adicionados automaticamente à URL de destino
          </p>
        </div>

        <div className="p-4 bg-secondary/30 rounded-lg space-y-2">
          <p className="text-xs font-medium text-foreground">Variáveis do Facebook:</p>
          <p className="text-xs text-muted-foreground font-mono">
            {`{{campaign.name}}`}, {`{{campaign.id}}`}, {`{{adset.name}}`}, {`{{adset.id}}`}, {`{{ad.name}}`}, {`{{ad.id}}`}, {`{{placement}}`}
          </p>
          <p className="text-xs font-medium text-foreground mt-3">Variáveis Dinâmicas:</p>
          <p className="text-xs text-muted-foreground font-mono">
            {`{{conta_nome}}`}, {`{{conta_apelido}}`}, {`{{conta_id}}`}, {`{{criativo}}`}
          </p>
        </div>
      </section>
    </div>
  );
}
