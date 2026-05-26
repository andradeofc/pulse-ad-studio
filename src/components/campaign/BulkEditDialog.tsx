import { useMemo, useState } from 'react';
import { Settings, DollarSign, Target, Calendar as CalendarIcon, Pencil, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export type BulkEditItem = { accountId: string; entityId: string; name?: string };
export type BulkLevel = 'campaign' | 'adset' | 'ad';

const BID_STRATEGIES = [
  { v: 'LOWEST_COST_WITHOUT_CAP', label: 'Maior volume (sem limite)' },
  { v: 'LOWEST_COST_WITH_BID_CAP', label: 'Limite de lance' },
  { v: 'COST_CAP', label: 'Limite de custo' },
  { v: 'LOWEST_COST_WITH_MIN_ROAS', label: 'ROAS mínimo' },
];

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  items: BulkEditItem[];
  level: BulkLevel;
  onDone?: () => void;
}

export function BulkEditDialog({ open, onOpenChange, items, level, onDone }: Props) {
  const [useName, setUseName] = useState(false);
  const [name, setName] = useState('');
  const [useStatus, setUseStatus] = useState(false);
  const [status, setStatus] = useState('');
  const [useDaily, setUseDaily] = useState(false);
  const [daily, setDaily] = useState('');
  const [useLifetime, setUseLifetime] = useState(false);
  const [lifetime, setLifetime] = useState('');
  const [useSpendCap, setUseSpendCap] = useState(false);
  const [spendCap, setSpendCap] = useState('');
  const [useBid, setUseBid] = useState(false);
  const [bid, setBid] = useState('');
  const [useEnd, setUseEnd] = useState(false);
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);

  const noun = level === 'campaign' ? 'campanha(s)' : level === 'adset' ? 'conjunto(s)' : 'anúncio(s)';
  const count = items.length;

  const fields = useMemo(() => {
    const f: Record<string, string> = {};
    if (useName && name.trim()) f.name = name.trim();
    if (useStatus && status) f.status = status;
    if (useDaily && daily) f.daily_budget = String(Math.round(Number(daily) * 100));
    if (useLifetime && lifetime) f.lifetime_budget = String(Math.round(Number(lifetime) * 100));
    if (useSpendCap && spendCap) f.spend_cap = String(Math.round(Number(spendCap) * 100));
    if (useBid && bid) f.bid_strategy = bid;
    if (useEnd && end) f[level === 'campaign' ? 'stop_time' : 'end_time'] = end;
    return f;
  }, [useName, name, useStatus, status, useDaily, daily, useLifetime, lifetime, useSpendCap, spendCap, useBid, bid, useEnd, end, level]);

  const enabledCount = Object.keys(fields).length;

  const reset = () => {
    setUseName(false); setName('');
    setUseStatus(false); setStatus('');
    setUseDaily(false); setDaily('');
    setUseLifetime(false); setLifetime('');
    setUseSpendCap(false); setSpendCap('');
    setUseBid(false); setBid('');
    setUseEnd(false); setEnd('');
  };

  const handleApply = async () => {
    if (enabledCount === 0) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-fb-entity-fields', {
        body: { items: items.map((i) => ({ accountId: i.accountId, entityId: i.entityId })), level, fields },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      const d = data as { ok: number; fail: number; results: any[] };
      if (d.fail === 0) toast.success(`${d.ok} ${noun} atualizada(s)`);
      else toast.warning(`${d.ok} ok, ${d.fail} falha(s)`);
      onOpenChange(false);
      reset();
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao aplicar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={(v) => { if (!busy) { onOpenChange(v); if (!v) reset(); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Pencil className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-base">Edição em Massa</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {count} {noun} · Ative os campos que deseja alterar
                </p>
              </div>
              {count === 1 && items[0].name && (
                <Badge variant="destructive" className="font-normal max-w-[260px] truncate">
                  {items[0].name}
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            {/* Geral */}
            <Section icon={<Settings className="w-4 h-4 text-primary" />} title="Geral">
              <Field label="Nome" enabled={useName} onToggle={setUseName}>
                <Input
                  placeholder="Novo nome..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!useName}
                />
                {useName && count > 1 && (
                  <p className="text-[11px] text-amber-600 mt-1">Mesmo nome será aplicado a todos os itens.</p>
                )}
              </Field>
              <Field label="Status" enabled={useStatus} onToggle={setUseStatus}>
                <Select value={status} onValueChange={setStatus} disabled={!useStatus}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Ativo</SelectItem>
                    <SelectItem value="PAUSED">Pausado</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </Section>

            {/* Estratégia */}
            <Section icon={<Target className="w-4 h-4 text-primary" />} title="Estratégia">
              <Field label="Estratégia de Lance" enabled={useBid} onToggle={setUseBid}>
                <Select value={bid} onValueChange={setBid} disabled={!useBid}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {BID_STRATEGIES.map((b) => (
                      <SelectItem key={b.v} value={b.v}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Section>

            {/* Orçamento */}
            <Section icon={<DollarSign className="w-4 h-4 text-primary" />} title="Orçamento">
              <Field
                label="Orçamento Diário"
                enabled={useDaily}
                onToggle={setUseDaily}
                tooltip="Valor em moeda da conta (ex: 100 = R$ 100,00)"
              >
                <Input type="number" placeholder="Ex: 1000" value={daily} onChange={(e) => setDaily(e.target.value)} disabled={!useDaily} />
              </Field>
              <Field
                label="Orçamento Vitalício"
                enabled={useLifetime}
                onToggle={setUseLifetime}
                tooltip="Valor total do orçamento (requer data de término)"
              >
                <Input type="number" placeholder="Ex: 50000" value={lifetime} onChange={(e) => setLifetime(e.target.value)} disabled={!useLifetime} />
              </Field>
              <Field
                label="Limite de Gasto"
                enabled={useSpendCap}
                onToggle={setUseSpendCap}
                tooltip="Spend cap da campanha"
              >
                <Input type="number" placeholder="Ex: 100000" value={spendCap} onChange={(e) => setSpendCap(e.target.value)} disabled={!useSpendCap} />
              </Field>
            </Section>

            {/* Agendamento */}
            <Section icon={<CalendarIcon className="w-4 h-4 text-primary" />} title="Agendamento">
              <Field
                label="Data de Término"
                enabled={useEnd}
                onToggle={setUseEnd}
                tooltip="Formato ISO: AAAA-MM-DDTHH:MM:SS-0300"
              >
                <Input
                  placeholder="AAAA-MM-DDT00:00:00-0300"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  disabled={!useEnd}
                />
              </Field>
            </Section>
          </div>

          <DialogFooter className="mt-4 flex items-center justify-between sm:justify-between gap-2 border-t pt-3">
            <span className="text-xs text-muted-foreground mr-auto">
              {enabledCount === 0 ? 'Nenhum campo selecionado' : `${enabledCount} campo(s) selecionado(s)`}
            </span>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={handleApply} disabled={enabledCount === 0 || busy} className="gap-2">
              {busy ? 'Aplicando...' : 'Aplicar alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className="border border-border rounded-lg p-3 space-y-3 bg-card/30">
        {children}
      </div>
    </div>
  );
}

function Field({
  label, enabled, onToggle, tooltip, children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (b: boolean) => void;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
        <Checkbox checked={enabled} onCheckedChange={(c) => onToggle(!!c)} />
        {label}
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
