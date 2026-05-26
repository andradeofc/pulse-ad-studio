import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Search,
  Facebook,
  AlertTriangle,
  Check,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  PoolWithPages,
  createPool,
  renamePool,
  deletePool,
  addPagesToPool,
  removePageFromPool,
} from '@/services/fanpagePoolsService';

export interface PageForPool {
  page_id: string;
  name: string;
  profile_id: string;
  profile_name: string | null;
  picture_url: string | null;
  is_blacklisted?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pools: PoolWithPages[];
  pages: PageForPool[];
  onChanged: () => void;
}

const POOL_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

export function ManagePoolsModal({ open, onOpenChange, pools, pages, onChanged }: Props) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(POOL_COLORS[0]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(POOL_COLORS[0]);
  const [addingToPool, setAddingToPool] = useState<PoolWithPages | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await createPool(newName.trim(), newColor);
      setNewName('');
      toast.success('Pool criado');
      onChanged();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao criar pool');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este pool? As páginas não serão removidas.')) return;
    try {
      await deletePool(id);
      toast.success('Pool excluído');
      onChanged();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao excluir');
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await renamePool(id, editName.trim(), editColor);
      setEditing(null);
      toast.success('Pool atualizado');
      onChanged();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar');
    }
  };

  const handleRemovePage = async (poolId: string, pageId: string) => {
    try {
      await removePageFromPool(poolId, pageId);
      onChanged();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao remover página');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                <Plus className="w-3 h-3 text-primary" />
              </div>
              Gerenciar Pools
            </DialogTitle>
            <DialogDescription className="sr-only">
              Criar, editar e remover pools de fanpages.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-ads-warning/30 bg-ads-warning/10 px-3 py-2 text-xs text-ads-warning flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Alterações aqui são permanentes e afetam todas as campanhas que usam este pool.</span>
          </div>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {pools.length === 0 ? (
              <div className="py-8 text-center">
                <p className="font-medium text-foreground">Nenhum pool criado ainda</p>
                <p className="text-sm text-muted-foreground">Crie seu primeiro pool para organizar suas páginas</p>
              </div>
            ) : (
              pools.map((pool) => {
                const isExpanded = expanded === pool.id;
                const isEditing = editing === pool.id;
                const count = pool.pages.length;
                return (
                  <div key={pool.id} className="rounded-md border border-border bg-card">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <span
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: isEditing ? editColor : pool.color }}
                      />
                      {isEditing ? (
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 flex-1"
                          autoFocus
                        />
                      ) : (
                        <span className="font-medium flex-1 truncate">{pool.name}</span>
                      )}

                      <Badge
                        variant="outline"
                        className={cn(
                          'font-normal',
                          count === 0
                            ? 'bg-destructive/10 text-destructive border-destructive/30'
                            : 'bg-primary/10 text-primary border-primary/30'
                        )}
                      >
                        {count === 0 ? 'sem páginas' : count === 1 ? '1 página' : `${count} páginas`}
                      </Badge>

                      <button
                        onClick={() => setExpanded(isExpanded ? null : pool.id)}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {isEditing ? (
                        <button
                          onClick={() => handleSaveEdit(pool.id)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-primary hover:bg-primary/10"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setEditing(pool.id);
                            setEditName(pool.name);
                            setEditColor(pool.color);
                          }}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(pool.id)}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {isEditing && (
                      <div className="px-3 pb-3 flex gap-1.5">
                        {POOL_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setEditColor(c)}
                            className={cn(
                              'w-5 h-5 rounded-full ring-offset-2 ring-offset-card transition-all',
                              editColor === c && 'ring-2 ring-foreground'
                            )}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    )}

                    {isExpanded && (
                      <div className="border-t border-border px-3 py-3 space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAddingToPool(pool)}
                          className="w-full justify-start"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Adicionar páginas
                        </Button>

                        {pool.pages.length === 0 ? (
                          <p className="text-sm text-center text-muted-foreground py-3">
                            Nenhuma página neste pool. Adicione páginas para começar.
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {pool.pages.map((pp) => {
                              const page = pages.find((x) => x.page_id === pp.page_id);
                              return (
                                <div
                                  key={pp.id}
                                  className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5"
                                >
                                  <Facebook className="w-4 h-4 text-ads-info shrink-0" />
                                  <span className="text-sm flex-1 truncate">
                                    {page?.name ?? pp.page_id}
                                  </span>
                                  {page?.profile_name && (
                                    <span className="text-xs text-muted-foreground">
                                      {page.profile_name}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => handleRemovePage(pool.id, pp.page_id)}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-border pt-3 flex items-center gap-2">
            <div className="relative">
              <button
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: newColor }}
                onClick={() => {
                  const idx = POOL_COLORS.indexOf(newColor);
                  setNewColor(POOL_COLORS[(idx + 1) % POOL_COLORS.length]);
                }}
                title="Clique para mudar a cor"
              />
            </div>
            <Input
              placeholder="Ex: Emagrecimento, Disfunção..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="h-9 flex-1"
            />
            <Button onClick={handleCreate} disabled={busy || !newName.trim()} size="sm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Criar</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {addingToPool && (
        <AddPagesModal
          pool={addingToPool}
          pages={pages}
          onClose={() => setAddingToPool(null)}
          onAdded={() => { setAddingToPool(null); onChanged(); }}
        />
      )}
    </>
  );
}

function AddPagesModal({
  pool,
  pages,
  onClose,
  onAdded,
}: {
  pool: PoolWithPages;
  pages: PageForPool[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const existing = useMemo(() => new Set(pool.pages.map((p) => p.page_id)), [pool]);

  useEffect(() => { setSelected(new Set()); }, [pool.id]);

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const avail = pages.filter(
      (p) => !existing.has(p.page_id) && (q === '' || p.name.toLowerCase().includes(q))
    );
    const map = new Map<string, PageForPool[]>();
    for (const p of avail) {
      const key = p.profile_name || 'Sem perfil';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [pages, existing, search]);

  const handleSave = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const toAdd = pages
        .filter((p) => selected.has(p.page_id))
        .map((p) => ({ page_id: p.page_id, profile_id: p.profile_id }));
      await addPagesToPool(pool.id, toAdd);
      toast.success(`${selected.size} página(s) adicionada(s)`);
      onAdded();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao adicionar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Páginas a "{pool.name}"</DialogTitle>
          <DialogDescription className="sr-only">Selecione as páginas para adicionar ao pool.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar página..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
          {grouped.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-8">
              Nenhuma página disponível.
            </p>
          ) : (
            grouped.map(([profileName, list]) => (
              <div key={profileName}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {profileName}
                </p>
                <div className="space-y-1">
                  {list.map((p) => (
                    <label
                      key={p.page_id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        checked={selected.has(p.page_id)}
                        onCheckedChange={(c) => {
                          const next = new Set(selected);
                          if (c) next.add(p.page_id); else next.delete(p.page_id);
                          setSelected(next);
                        }}
                      />
                      <span className="text-sm flex-1 truncate">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            {selected.size} selecionada{selected.size === 1 ? '' : 's'}
          </span>
          <Button onClick={handleSave} disabled={saving || selected.size === 0} size="sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Adicionar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
