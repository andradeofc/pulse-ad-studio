import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useCampaignStore } from '@/stores/campaignStore';

export function Step3PlacementsSection() {
  const { config, updateConfig } = useCampaignStore();

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        Posicionamentos
      </h3>

      <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/20">
        <div>
          <Label className="text-foreground">Advantage+ Posicionamentos</Label>
          <p className="text-sm text-muted-foreground">
            A Meta mostrará seus anúncios nos locais com maior probabilidade de resultados
          </p>
        </div>
        <Switch
          checked={config.autoPlacement}
          onCheckedChange={(checked) => updateConfig({ autoPlacement: checked })}
        />
      </div>

      {!config.autoPlacement && (
        <div className="p-4 bg-secondary/50 rounded-lg border border-border space-y-3">
          <Label className="text-sm">Plataformas</Label>
          <div className="flex flex-wrap gap-2">
            {(['facebook', 'instagram', 'messenger', 'audience_network'] as const).map((platform) => (
              <Badge
                key={platform}
                variant={config.publisherPlatforms.includes(platform) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => {
                  const isSelected = config.publisherPlatforms.includes(platform);
                  updateConfig({
                    publisherPlatforms: isSelected
                      ? config.publisherPlatforms.filter(p => p !== platform)
                      : [...config.publisherPlatforms, platform]
                  });
                }}
              >
                {platform === 'facebook' && '📘 Facebook'}
                {platform === 'instagram' && '📷 Instagram'}
                {platform === 'messenger' && '💬 Messenger'}
                {platform === 'audience_network' && '🌐 Audience Network'}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
