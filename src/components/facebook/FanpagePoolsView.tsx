import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { List, LayoutGrid, Settings, Loader2, Facebook } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { fetchPools, PoolWithPages } from '@/services/fanpagePoolsService';
import { ManagePoolsModal, PageForPool } from './ManagePoolsModal';

interface Props {
  pages: PageForPool[];
}

export function FanpagePoolsView({ pages }: Props) {
  const [pools, setPools] = useState<PoolWithPages[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'cards'>('list');
  const [manageOpen, setManageOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setPools(await fetchPools());
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar pools');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Card className="glass-card overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-6 py-5 border-b border-border/50">
        <div>
          <h2 className="text-lg font-bold text-foreground">Visão geral dos pools</h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe compatibilidade por perfil, criador original e ajuste os pools sem sair desta tela.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-border bg-background p-0.5">
            <button
              onClick={() => setView('list')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 h-8 rounded text-sm transition-colors',
                view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <List className="w-4 h-4" /> Lista
            </button>
            <button
              onClick={() => setView('cards')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 h-8 rounded text-sm transition-colors',
                view === 'cards' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid className="w-4 h-4" /> Cards
            </button>
          </div>
          <Button onClick={() => setManageOpen(true)} className="glow-primary">
            <Settings className="w-4 h-4 mr-2" /> Gerenciar Pools
          </Button>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : pools.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 py-12 text-center">
            <p className="font-medium text-foreground">Nenhum pool criado ainda</p>
            <p className="text-sm text-muted-foreground mb-4">
              Crie seu primeiro pool para organizar suas páginas
            </p>
            <Button onClick={() => setManageOpen(true)}>Criar pool</Button>
          </div>
        ) : view === 'list' ? (
          <div className="space-y-2">
            {pools.map((pool) => (
              <div
                key={pool.id}
                className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3"
              >
                <span
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: pool.color }}
                />
                <span className="font-medium flex-1 truncate">{pool.name}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'font-normal',
                    pool.pages.length === 0
                      ? 'bg-destructive/10 text-destructive border-destructive/30'
                      : 'bg-primary/10 text-primary border-primary/30'
                  )}
                >
                  {pool.pages.length === 0
                    ? 'sem páginas'
                    : pool.pages.length === 1
                    ? '1 página'
                    : `${pool.pages.length} páginas`}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pools.map((pool) => (
              <div
                key={pool.id}
                className="rounded-lg border border-border bg-card p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: pool.color }}
                  />
                  <span className="font-medium flex-1 truncate">{pool.name}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Facebook className="w-3.5 h-3.5" />
                    {pool.pages.length} página{pool.pages.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ManagePoolsModal
        open={manageOpen}
        onOpenChange={setManageOpen}
        pools={pools}
        pages={pages}
        onChanged={load}
      />
    </Card>
  );
}
