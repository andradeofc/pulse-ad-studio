import { useState, useMemo } from 'react';
import { Layers, Plus, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { PoolWithPages } from '@/services/fanpagePoolsService';

interface Props {
  selectedCount: number;
  pools: PoolWithPages[];
  selectedPageIds: string[];
  onAdd: (poolId: string) => Promise<void>;
  onRemove: (poolId: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
}

export function BulkPoolsButton({
  selectedCount,
  pools,
  selectedPageIds,
  onAdd,
  onRemove,
  onCreate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  // For each pool, compute checkbox state:
  // 'checked' if ALL selected pages already in pool
  // 'unchecked' if NONE in pool
  // 'indeterminate' if SOME
  const states = useMemo(() => {
    const set = new Set(selectedPageIds);
    return pools.map((pool) => {
      const inPool = pool.pages.filter((pp) => set.has(pp.page_id)).length;
      const total = selectedPageIds.length;
      const state: 'all' | 'none' | 'some' =
        inPool === 0 ? 'none' : inPool === total ? 'all' : 'some';
      return { pool, state };
    });
  }, [pools, selectedPageIds]);

  const handleToggle = async (poolId: string, currentlyAll: boolean) => {
    setBusy(true);
    try {
      if (currentlyAll) await onRemove(poolId);
      else await onAdd(poolId);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await onCreate(newName.trim());
      setNewName('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
        >
          <Layers className="w-4 h-4 mr-1.5" />
          Pools ({selectedCount})
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="max-h-[260px] overflow-y-auto space-y-0.5">
          {pools.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum pool criado
            </p>
          ) : (
            states.map(({ pool, state }) => (
              <label
                key={pool.id}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent',
                  busy && 'opacity-60 pointer-events-none'
                )}
              >
                <Checkbox
                  checked={state === 'all' ? true : state === 'some' ? 'indeterminate' : false}
                  onCheckedChange={() => handleToggle(pool.id, state === 'all')}
                />
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: pool.color }}
                />
                <span className="text-sm flex-1 truncate">{pool.name}</span>
                {state === 'some' && (
                  <span className="text-[10px] text-muted-foreground">parcial</span>
                )}
              </label>
            ))
          )}
        </div>

        <div className="border-t border-border mt-2 pt-2 flex items-center gap-1.5">
          <Input
            placeholder="Ex: Emagrecimento, Disfunção..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="h-8 text-sm"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            disabled={!newName.trim() || busy}
            onClick={handleCreate}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
