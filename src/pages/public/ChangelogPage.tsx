import { motion } from 'framer-motion';
import { CalendarDays, Sparkles, Bug, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const changelog = [
  {
    version: '2.4.0',
    date: '2026-02-05',
    type: 'feature' as const,
    title: 'Agendamento de Catálogo',
    description: 'Agende a atualização automática de criativos nos produtos do seu catálogo do Facebook.',
  },
  {
    version: '2.3.0',
    date: '2026-01-20',
    type: 'feature' as const,
    title: 'Templates de Campanha',
    description: 'Salve e reutilize configurações de campanhas como templates para agilizar seu fluxo de trabalho.',
  },
  {
    version: '2.2.1',
    date: '2026-01-10',
    type: 'fix' as const,
    title: 'Correção na Sincronização de Contas',
    description: 'Resolvido um problema onde contas de anúncio com caracteres especiais não eram sincronizadas corretamente.',
  },
  {
    version: '2.2.0',
    date: '2025-12-15',
    type: 'improvement' as const,
    title: 'Novo Dashboard com Métricas',
    description: 'Dashboard reformulado com gráficos de performance, indicadores de saúde e atalhos rápidos.',
  },
  {
    version: '2.1.0',
    date: '2025-11-28',
    type: 'feature' as const,
    title: 'Biblioteca de Mídia',
    description: 'Gerencie todos os seus criativos em um só lugar com pastas, busca e pré-visualização.',
  },
  {
    version: '2.0.0',
    date: '2025-11-01',
    type: 'feature' as const,
    title: 'Criação em Massa de Campanhas',
    description: 'Crie centenas de campanhas, conjuntos de anúncios e anúncios de uma só vez com o novo wizard.',
  },
];

const typeConfig = {
  feature: { label: 'Novidade', icon: Sparkles, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  fix: { label: 'Correção', icon: Bug, color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  improvement: { label: 'Melhoria', icon: Zap, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
};

export default function ChangelogPage() {
  return (
    <div className="container mx-auto px-4 py-20 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
        <h1 className="text-4xl font-bold text-foreground mb-4">Changelog</h1>
        <p className="text-lg text-muted-foreground">Acompanhe todas as novidades, melhorias e correções da plataforma.</p>
      </motion.div>

      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />
        <div className="space-y-8">
          {changelog.map((entry, i) => {
            const config = typeConfig[entry.type];
            const Icon = config.icon;
            return (
              <motion.div
                key={entry.version}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="relative pl-16"
              >
                <div className="absolute left-4 top-3 w-5 h-5 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
                <Card className="bg-card border-border">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <Badge variant="outline" className={config.color}>
                        <Icon className="w-3 h-3 mr-1" />
                        {config.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">v{entry.version}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {new Date(entry.date).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">{entry.title}</h3>
                    <p className="text-sm text-muted-foreground">{entry.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
