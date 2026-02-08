import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCampaignStore } from '@/stores/campaignStore';

export function Step3AttributionSection() {
  const { config, updateConfig } = useCampaignStore();

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        Configurações de Atribuição
      </h3>
      <p className="text-sm text-muted-foreground">
        Define a janela de tempo para atribuir conversões aos seus anúncios
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Click Attribution */}
        <div className="space-y-2">
          <Label>Cliques</Label>
          <Select
            value={String(config.attributionClickDays)}
            onValueChange={(value) => updateConfig({ attributionClickDays: parseInt(value) as 1 | 7 })}
          >
            <SelectTrigger className="bg-secondary/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="1">1 dia</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Conversões após clique no anúncio
          </p>
        </div>

        {/* Engaged Video View Attribution */}
        <div className="space-y-2">
          <Label>Visualização com engajamento</Label>
          <Select
            value={String(config.attributionEngagedViewDays)}
            onValueChange={(value) => updateConfig({ attributionEngagedViewDays: parseInt(value) as 0 | 1 })}
          >
            <SelectTrigger className="bg-secondary/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 dia</SelectItem>
              <SelectItem value="0">Nenhum</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Conversões após assistir vídeo (15s+)
          </p>
        </div>

        {/* View Attribution */}
        <div className="space-y-2">
          <Label>Visualização</Label>
          <Select
            value={String(config.attributionViewDays)}
            onValueChange={(value) => updateConfig({ attributionViewDays: parseInt(value) as 0 | 1 })}
          >
            <SelectTrigger className="bg-secondary/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 dia</SelectItem>
              <SelectItem value="0">Nenhum</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Conversões após ver o anúncio
          </p>
        </div>
      </div>

      {/* Attribution Summary */}
      <div className="p-3 bg-secondary/30 rounded-lg border border-border">
        <p className="text-sm text-muted-foreground">
          <strong>Configuração atual:</strong>{' '}
          {config.attributionClickDays} dia(s) de clique
          {config.attributionViewDays > 0 && `, ${config.attributionViewDays} dia(s) de visualização`}
          {config.attributionEngagedViewDays > 0 && `, ${config.attributionEngagedViewDays} dia(s) de vídeo`}
        </p>
      </div>
    </section>
  );
}
