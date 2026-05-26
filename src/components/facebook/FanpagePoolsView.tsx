import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  List,
  LayoutGrid,
  Settings,
  Loader2,
  Layers,
  ArrowRight,
  Users,
  Trash2,
  Save,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  fetchPools,
  PoolWithPages,
  updatePool,
  deletePool,
} from '@/services/fanpagePoolsService';
import { ManagePoolsModal, PageForPool } from './ManagePoolsModal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  pages: PageForPool[];
}

const POOL_COLORS = [
  '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
  '#3b82f6', '#f97316', '#84cc16', '#ec4899',
];

interface EnrichedPool extends PoolWithPages {
  creatorProfileId: string | null;
  creatorProfileName: string | null;
  totalPages: number;
  compatibleCount: number;
}

export function FanpagePoolsView({ pages }: Props) {
  const [pools, setPools] = useState<PoolWithPages[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'cards'>('list');
  const [manageOpen, setManageOpen] = useState(false);
  const [detailsPoolId, setDetailsPoolId] = useState<string | null>(null);

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

  // page_id -> page info lookup
  const pageById = useMemo(() => {
    const map = new Map<string, PageForPool>();
    for (const p of pages) map.set(p.page_id, p);
    return map;
  }, [pages]);

  // All unique profiles available from pages list (for selector)
  const profiles = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of pages) {
      if (!map.has(p.profile_id)) map.set(p.profile_id, p.profile_name ?? 'Sem nome');
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [pages]);

  const enriched: EnrichedPool[] = useMemo(() => {
    return pools.map((pool) => {
      // Use stored creator_profile_id; fallback to first linked page's profile
      let creatorProfileId: string | null = pool.creator_profile_id ?? null;
      if (!creatorProfileId) {
        const sorted = [...pool.pages].sort((a, b) =>
          a.created_at.localeCompare(b.created_at)
        );
        creatorProfileId = sorted[0]?.profile_id ?? null;
      }
      const creatorProfileName = creatorProfileId
        ? profiles.find((pr) => pr.id === creatorProfileId)?.name ?? null
        : null;

      let compatible = 0;
      for (const link of pool.pages) {
        const page = pageById.get(link.page_id);
        if (!page) continue;
        const sameProfile = creatorProfileId
          ? link.profile_id === creatorProfileId
          : true;
        if (sameProfile && !page.is_blacklisted) compatible++;
      }

      return {
        ...pool,
        creatorProfileId,
        creatorProfileName,
        totalPages: pool.pages.length,
        compatibleCount: compatible,
      };
    });
  }, [pools, pageById, profiles]);

  const selectedPool = useMemo(
    () => enriched.find((p) => p.id === detailsPoolId) ?? null,
    [enriched, detailsPoolId]
  );

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
        ) : enriched.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 py-12 text-center">
            <p className="font-medium text-foreground">Nenhum pool criado ainda</p>
            <p className="text-sm text-muted-foreground mb-4">
              Crie seu primeiro pool para organizar suas páginas
            </p>
            <Button onClick={() => setManageOpen(true)}>Criar pool</Button>
          </div>
        ) : view === 'list' ? (
          <div className="space-y-3">
            {enriched.map((pool) => (
              <PoolRow
                key={pool.id}
                pool={pool}
                onOpen={() => setDetailsPoolId(pool.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {enriched.map((pool) => (
              <PoolCard
                key={pool.id}
                pool={pool}
                onOpen={() => setDetailsPoolId(pool.id)}
              />
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

      <PoolDetailsSheet
        pool={selectedPool}
        pages={pages}
        profiles={profiles}
        open={!!selectedPool}
        onOpenChange={(o) => { if (!o) setDetailsPoolId(null); }}
        onChanged={load}
      />
    </Card>
  );
}

function PoolRow({ pool, onOpen }: { pool: EnrichedPool; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${pool.color}20`, color: pool.color }}
      >
        <Layers className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold truncate">{pool.name}</span>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-normal">
            {pool.compatibleCount}/{pool.totalPages}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {pool.totalPages} {pool.totalPages === 1 ? 'página' : 'páginas'}
          {pool.creatorProfileName ? ` · ${pool.creatorProfileName}` : ''}
        </p>
      </div>
      <div className="hidden md:flex items-center gap-2">
        <Stat label="COMPATÍVEIS" value={pool.compatibleCount} />
        <Stat label="TOTAL" value={pool.totalPages} />
      </div>
      <button
        onClick={onOpen}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline shrink-0"
      >
        Abrir detalhes <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function PoolCard({ pool, onOpen }: { pool: EnrichedPool; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${pool.color}20`, color: pool.color }}
        >
          <Layers className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{pool.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {pool.creatorProfileName ?? 'Sem perfil'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Stat label="COMPATÍVEIS" value={pool.compatibleCount} />
        <Stat label="TOTAL" value={pool.totalPages} />
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-1.5 rounded-md bg-muted/60 border border-border min-w-[78px]">
      <p className="text-[10px] font-medium text-muted-foreground tracking-wider">{label}</p>
      <p className="text-base font-bold text-foreground leading-none mt-0.5">{value}</p>
    </div>
  );
}

function PoolDetailsSheet({
  pool,
  pages,
  profiles,
  open,
  onOpenChange,
  onChanged,
}: {
  pool: EnrichedPool | null;
  pages: PageForPool[];
  profiles: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(POOL_COLORS[0]);
  const [creatorProfileId, setCreatorProfileId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (pool) {
      setName(pool.name);
      setColor(pool.color);
      setCreatorProfileId(pool.creator_profile_id ?? pool.creatorProfileId ?? '');
    }
  }, [pool]);

  const pageById = useMemo(() => {
    const map = new Map<string, PageForPool>();
    for (const p of pages) map.set(p.page_id, p);
    return map;
  }, [pages]);

  const { compatibles, incompatibles, snapshot } = useMemo(() => {
    const comp: { page: PageForPool }[] = [];
    const inc: { page: PageForPool; reason: string }[] = [];
    const snap: PageForPool[] = [];
    if (!pool) return { compatibles: comp, incompatibles: inc, snapshot: snap };
    for (const link of pool.pages) {
      const page = pageById.get(link.page_id);
      if (!page) continue;
      snap.push(page);
      const sameProfile = pool.creatorProfileId
        ? link.profile_id === pool.creatorProfileId
        : true;
      if (page.is_blacklisted) {
        inc.push({ page, reason: 'Está na blacklist' });
      } else if (!sameProfile) {
        inc.push({ page, reason: 'Perfil diferente do criador' });
      } else {
        comp.push({ page });
      }
    }
    return { compatibles: comp, incompatibles: inc, snapshot: snap };
  }, [pool, pageById]);

  if (!pool) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Nome obrigatório');
      return;
    }
    try {
      setSaving(true);
      await updatePool(pool.id, {
        name: name.trim(),
        color,
        creator_profile_id: creatorProfileId || null,
      });
      toast.success('Pool atualizado');
      onChanged();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Excluir o pool "${pool.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      setDeleting(true);
      await deletePool(pool.id);
      toast.success('Pool excluído');
      onChanged();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao excluir');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-2xl font-bold truncate">{pool.name}</SheetTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  {pool.compatibleCount}/{pool.totalPages}
                </Badge>
                <span className="text-sm text-muted-foreground inline-flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {pool.creatorProfileName ?? 'Sem perfil'}
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Excluir Pool
            </Button>
          </div>
        </SheetHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {/* Edit details */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold mb-3">Detalhes do pool</h3>
            <label className="text-xs font-medium text-muted-foreground">Editar Pool</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
              maxLength={80}
            />
            <p className="text-xs font-medium text-muted-foreground mt-3 mb-2">Mudar cor</p>
            <div className="flex flex-wrap gap-2">
              {POOL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-7 h-7 rounded-full border-2 transition-transform',
                    color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
            <Button onClick={handleSave} disabled={saving} className="mt-4">
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              Salvar
            </Button>
          </div>

          {/* Creator profile */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold mb-3">Perfil criador</h3>
            <Select
              value={creatorProfileId || '__none__'}
              onValueChange={(v) => setCreatorProfileId(v === '__none__' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o perfil criador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum</SelectItem>
                {profiles.map((pr) => (
                  <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              O perfil criador define a referência de compatibilidade do pool. Clique em <strong>Salvar</strong> para aplicar.
            </p>
          </div>

          {/* Compatibles */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold mb-3">
              Compatíveis ({compatibles.length})
            </h3>
            {compatibles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma fanpage compatível encontrada.</p>
            ) : (
              <ul className="space-y-2">
                {compatibles.map(({ page }) => (
                  <li key={page.page_id} className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                    <p className="font-medium truncate">{page.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{page.profile_name ?? '—'}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Incompatibles */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold mb-3">
              Não compatíveis ({incompatibles.length})
            </h3>
            {incompatibles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma página incompatível.</p>
            ) : (
              <ul className="space-y-2">
                {incompatibles.map(({ page, reason }) => (
                  <li key={page.page_id} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                    <p className="font-medium truncate flex items-center gap-1.5">
                      {page.is_blacklisted && <Ban className="w-3.5 h-3.5 text-destructive shrink-0" />}
                      {page.name}
                    </p>
                    <p className="text-xs text-destructive/80 truncate">{reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Snapshot */}
        <div className="rounded-lg border border-border bg-card p-4 mt-4">
          <h3 className="font-semibold mb-3">Snapshot das fanpages do pool</h3>
          {snapshot.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pool vazio.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {snapshot.map((page) => (
                <li key={page.page_id} className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                  <p className="font-medium truncate">{page.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{page.profile_name ?? '—'}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
