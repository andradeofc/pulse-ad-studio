import { useState, useRef, useEffect } from 'react';
import { Sparkles, Save, Trash2, Copy, Plus, X, Pencil, MoreVertical, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useNamingPresets, type Preset, type CustomVariable } from '@/hooks/useNamingPresets';

type NamingContext = 'campaign' | 'adset' | 'ad';

interface NamingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: NamingContext;
  value: string;
  onApply: (template: string, customVariables?: Record<string, string>) => void;
  initialCustomVariables?: Record<string, string>;
}

interface Variable {
  key: string;
  label: string;
  example: string;
  category: 'data' | 'date' | 'custom';
}

const dataVariables: Variable[] = [
  { key: 'conta_nome', label: 'Conta (Nome)', example: '#1164 - Silv...', category: 'data' },
  { key: 'conta_codigo', label: 'Conta (Código)', example: 'SC2-133', category: 'data' },
  { key: 'conta_apelido', label: 'Conta (Apelido)', example: 'PP', category: 'data' },
  { key: 'conta_id', label: 'Conta (ID)', example: '544627', category: 'data' },
  { key: 'criativo', label: 'Criativos', example: '990_AD005_V...', category: 'data' },
  { key: 'conjunto_catalogo', label: 'Conjunto Catálogo', example: 'BUSL1', category: 'data' },
  { key: 'pagina_nome', label: 'Página', example: 'Claire', category: 'data' },
  { key: 'pagina_nome1', label: 'Nome 1 Página', example: 'Alana', category: 'data' },
  { key: 'budget', label: 'Budget', example: 'ABO', category: 'data' },
  { key: 'estrutura', label: 'Estrutura', example: '1-4-1', category: 'data' },
  { key: 'sequencial', label: 'Seq', example: '08+', category: 'data' },
];

const dateVariables: Variable[] = [
  { key: 'ano', label: 'Ano', example: '2026', category: 'date' },
  { key: 'ano2', label: 'Ano 2dig', example: '26', category: 'date' },
  { key: 'mes', label: 'Mês', example: '01', category: 'date' },
  { key: 'dia', label: 'Dia', example: '22', category: 'date' },
  { key: 'hora', label: 'Hora', example: '17', category: 'date' },
  { key: 'minuto', label: 'Minuto', example: '43', category: 'date' },
];

const contextLabels: Record<NamingContext, { label: string; color: string }> = {
  campaign: { label: 'Campanha', color: 'bg-ads-success text-white' },
  adset: { label: 'Conjunto', color: 'bg-ads-info text-white' },
  ad: { label: 'Anúncio', color: 'bg-purple-500 text-white' },
};

export function NamingModal({ open, onOpenChange, context, value, onApply, initialCustomVariables }: NamingModalProps) {
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [template, setTemplate] = useState(value || '');
  const [sequentialStart, setSequentialStart] = useState('01');
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState('');
  const [newVarName, setNewVarName] = useState('');
  const [showNewVarInput, setShowNewVarInput] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Local state for custom variables (merged from DB and initialCustomVariables)
  const [localCustomVars, setLocalCustomVars] = useState<Variable[]>([]);

  const {
    presets,
    customVariables,
    isLoading,
    savePreset,
    renamePreset,
    deletePreset,
    saveVariable,
    deleteVariable,
    updateVariableValue,
    reload,
  } = useNamingPresets();

  // Reload data when modal opens
  useEffect(() => {
    if (open) {
      reload();
    }
  }, [open, reload]);

  // Initialize local custom vars from DB + initialCustomVariables
  useEffect(() => {
    const dbVars: Variable[] = customVariables.map(v => ({
      key: v.key,
      label: v.label,
      example: v.value,
      category: 'custom' as const,
    }));

    // Merge with initialCustomVariables if provided
    if (initialCustomVariables && Object.keys(initialCustomVariables).length > 0) {
      Object.entries(initialCustomVariables).forEach(([key, val]) => {
        const existing = dbVars.find(v => v.key === key);
        if (existing) {
          existing.example = val;
        } else {
          dbVars.push({ key, label: key, example: val, category: 'custom' });
        }
      });
    }

    setLocalCustomVars(dbVars);
  }, [customVariables, initialCustomVariables]);

  useEffect(() => {
    if (open && value) {
      setTemplate(value);
    }
  }, [open, value]);

  const insertVariable = (varKey: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const varText = `{{${varKey}}}`;
    
    const newTemplate = template.slice(0, start) + varText + template.slice(end);
    setTemplate(newTemplate);

    // Focus and set cursor after inserted variable
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + varText.length, start + varText.length);
    }, 0);
  };

  const resolvePreview = () => {
    let resolved = template;
    const now = new Date();
    
    const replacements: Record<string, string> = {
      conta_nome: '#1164 - Silva Ads',
      conta_codigo: 'SC2-133', // Primeiros 7 caracteres do nome da conta
      conta_apelido: 'PP',
      conta_id: '544627',
      criativo: '990_AD005_V01',
      pagina_nome: 'Alana Martins Santos',
      pagina_nome1: 'Alana', // Primeiro nome da página
      budget: 'CBO',
      estrutura: '1-4-1',
      ano: now.getFullYear().toString(),
      ano2: now.getFullYear().toString().slice(-2),
      mes: String(now.getMonth() + 1).padStart(2, '0'),
      dia: String(now.getDate()).padStart(2, '0'),
      hora: String(now.getHours()).padStart(2, '0'),
      minuto: String(now.getMinutes()).padStart(2, '0'),
    };

    // Add custom variables - use value or show placeholder if empty
    localCustomVars.forEach(v => {
      replacements[v.key] = v.example || `[${v.key}]`;
    });

    // Handle sequencial with starting number
    resolved = resolved.replace(/\{\{sequencial(?::(\d+))?\}\}/g, (_, start) => {
      return start || sequentialStart;
    });

    // Replace all other variables
    Object.entries(replacements).forEach(([key, val]) => {
      resolved = resolved.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    });

    return resolved;
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setTemplate(preset.template);
    }
  };

  const handleSavePreset = async () => {
    const name = prompt('Nome do preset:');
    if (!name) return;
    
    setIsSaving(true);
    const newPreset = await savePreset(name, template, context);
    setIsSaving(false);
    
    if (newPreset) {
      setSelectedPreset(newPreset.id);
    }
  };

  const handleRenamePreset = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset || preset.isDefault) return;
    
    setEditingPresetId(presetId);
    setEditingPresetName(preset.name);
  };

  const handleSaveRename = async () => {
    if (!editingPresetId || !editingPresetName.trim()) {
      setEditingPresetId(null);
      return;
    }
    
    setIsSaving(true);
    await renamePreset(editingPresetId, editingPresetName.trim());
    setIsSaving(false);
    setEditingPresetId(null);
    setEditingPresetName('');
  };

  const handleDeletePreset = async (presetId: string) => {
    setIsSaving(true);
    const success = await deletePreset(presetId);
    setIsSaving(false);
    
    if (success && selectedPreset === presetId) {
      setSelectedPreset('');
    }
  };

  const handleClear = () => {
    setTemplate('');
    setSelectedPreset('');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(template);
    toast({ title: 'Copiado!', description: 'Template copiado para a área de transferência.' });
  };

  const handleAddCustomVariable = async () => {
    if (!newVarName.trim()) return;
    
    const key = newVarName.toLowerCase().replace(/\s+/g, '_');
    
    // Add locally first for immediate feedback
    setLocalCustomVars(prev => [
      ...prev,
      { key, label: newVarName, example: '', category: 'custom' },
    ]);
    setNewVarName('');
    setShowNewVarInput(false);
    
    // Then persist to database
    await saveVariable(key, newVarName, '');
  };

  const handleUpdateCustomVariableValue = async (key: string, newValue: string) => {
    // Update locally first for immediate feedback
    setLocalCustomVars(prev => prev.map(v => 
      v.key === key ? { ...v, example: newValue } : v
    ));
    
    // Then persist to database
    await updateVariableValue(key, newValue);
  };

  const handleDeleteCustomVariable = async (key: string) => {
    // Remove locally first
    setLocalCustomVars(prev => prev.filter(v => v.key !== key));
    
    // Then remove from database
    await deleteVariable(key);
  };

  const handleApply = async () => {
    // Check if any custom variable used in template is missing a value
    const usedCustomVars = localCustomVars.filter(v => template.includes(`{{${v.key}}}`));
    const missingValues = usedCustomVars.filter(v => !v.example.trim());
    
    if (missingValues.length > 0) {
      toast({
        title: 'Valores ausentes',
        description: `Defina valores para: ${missingValues.map(v => v.key).join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    // Replace sequencial placeholder with configured start
    let finalTemplate = template.replace(/\{\{sequencial\}\}/g, `{{sequencial:${sequentialStart}}}`);
    
    // Build custom variables map for saving
    const customVarsMap: Record<string, string> = {};
    localCustomVars.forEach(v => {
      customVarsMap[v.key] = v.example;
    });
    
    // Save all variable values to database before applying
    setIsSaving(true);
    for (const v of localCustomVars) {
      if (v.example) {
        await saveVariable(v.key, v.label, v.example);
      }
    }
    setIsSaving(false);
    
    onApply(finalTemplate, customVarsMap);
    onOpenChange(false);
  };

  const VariableBadge = ({ variable, color }: { variable: Variable; color: string }) => (
    <button
      type="button"
      onClick={() => insertVariable(variable.key)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all hover:scale-105 hover:shadow-md ${color}`}
    >
      <span>{variable.label}</span>
      {variable.example && (
        <span className="opacity-60 text-[10px]">({variable.example})</span>
      )}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] max-h-[700px] p-0 gap-0 bg-card border-border flex flex-col overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <DialogTitle className="text-lg font-semibold text-foreground">
              Nomenclatura
            </DialogTitle>
            <Badge className={contextLabels[context].color}>
              {contextLabels[context].label}
            </Badge>
          </div>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-3 p-4 border-b border-border bg-secondary/30">
          <Select value={selectedPreset} onValueChange={handlePresetChange}>
            <SelectTrigger className="w-48 bg-background">
              <SelectValue placeholder="Selecionar preset..." />
            </SelectTrigger>
            <SelectContent>
              {presets
                .filter(p => p.context === context)
                .map(preset => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name} {preset.isDefault && <span className="text-muted-foreground text-xs">(padrão)</span>}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          
          {/* Preset actions dropdown */}
          {selectedPreset && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {editingPresetId === selectedPreset ? (
                  <div className="p-2">
                    <Input
                      value={editingPresetName}
                      onChange={(e) => setEditingPresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename();
                        if (e.key === 'Escape') setEditingPresetId(null);
                      }}
                      placeholder="Novo nome..."
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <div className="flex gap-1 mt-2">
                      <Button size="sm" onClick={handleSaveRename} className="h-7 text-xs">
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingPresetId(null)} className="h-7 text-xs">
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <DropdownMenuItem
                      onClick={() => handleRenamePreset(selectedPreset)}
                      disabled={presets.find(p => p.id === selectedPreset)?.isDefault}
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      Renomear
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDeletePreset(selectedPreset)}
                      disabled={presets.find(p => p.id === selectedPreset)?.isDefault}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Excluir
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          <Button variant="outline" size="sm" onClick={handleSavePreset}>
            <Save className="w-4 h-4 mr-1.5" />
            Salvar
          </Button>
          
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="w-4 h-4 mr-1.5" />
            Limpar
          </Button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-5 gap-0 flex-1 min-h-0 overflow-hidden">
          {/* Left Column - Variables */}
          <div className="col-span-2 border-r border-border overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-6">
                {/* Copy Button */}
                <Button variant="outline" size="sm" onClick={handleCopy} className="w-full">
                  <Copy className="w-4 h-4 mr-1.5" />
                  Copiar Template
                </Button>

                {/* Data Variables */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-ads-info" />
                    📊 Dados
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {dataVariables.map(v => (
                      <VariableBadge 
                        key={v.key} 
                        variable={v} 
                        color="bg-ads-info/20 text-ads-info hover:bg-ads-info/30 border border-ads-info/30"
                      />
                    ))}
                  </div>
                </div>

                {/* Date Variables */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-ads-success" />
                    📅 Data
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {dateVariables.map(v => (
                      <VariableBadge 
                        key={v.key} 
                        variable={v} 
                        color="bg-ads-success/20 text-ads-success hover:bg-ads-success/30 border border-ads-success/30"
                      />
                    ))}
                  </div>
                </div>

                {/* Custom Variables */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    # Personalizadas
                  </h4>
                  
                  {/* Custom variable badges for inserting */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {localCustomVars.map(v => (
                      <VariableBadge 
                        key={v.key}
                        variable={v} 
                        color="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30"
                      />
                    ))}
                  </div>

                  {/* Custom variable value editors */}
                  {localCustomVars.length > 0 && (
                    <div className="space-y-2 p-3 rounded-lg bg-secondary/50 border border-border mb-3">
                      <p className="text-xs text-muted-foreground font-medium mb-2">
                        Defina os valores que serão usados no Facebook:
                      </p>
                      {localCustomVars.map(v => (
                        <div key={v.key} className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground min-w-[80px]">{`{{${v.key}}}`}</span>
                          <span className="text-xs text-muted-foreground">=</span>
                          <Input
                            value={v.example}
                            onChange={e => handleUpdateCustomVariableValue(v.key, e.target.value)}
                            placeholder={`Valor para ${v.label}`}
                            className="h-7 text-sm flex-1"
                          />
                          <button
                            onClick={() => handleDeleteCustomVariable(v.key)}
                            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                            title="Remover variável"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {showNewVarInput ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={newVarName}
                        onChange={e => setNewVarName(e.target.value)}
                        placeholder="Nome da variável (ex: OFFER)"
                        className="h-8 text-sm"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleAddCustomVariable();
                          if (e.key === 'Escape') setShowNewVarInput(false);
                        }}
                      />
                      <Button size="sm" onClick={handleAddCustomVariable} className="h-8">
                        <Plus className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowNewVarInput(false)} className="h-8">
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNewVarInput(true)}
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      Criar Variável
                    </Button>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Right Column - Template & Preview */}
          <div className="col-span-3 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4">
                {/* Template */}
                <div>
                  <Label className="text-sm font-medium text-foreground">TEMPLATE</Label>
                  <Textarea
                    ref={textareaRef}
                    value={template}
                    onChange={e => setTemplate(e.target.value)}
                    placeholder="Ex: [CP{{sequencial}}][{{budget}}][{{estrutura}}][{{conta_apelido}}]"
                    className="mt-2 h-24 font-mono text-sm bg-background border-primary/50 focus:border-primary"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    💡 Digite <code className="px-1 py-0.5 bg-secondary rounded">{'{{'}</code> para ver variáveis
                  </p>
                </div>

                {/* Sequential Config */}
                <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                  <Label className="text-sm font-medium text-foreground">CONFIGURAR SEQUENCIAL</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground"># Início:</span>
                      <Input
                        type="text"
                        value={sequentialStart}
                        onChange={e => setSequentialStart(e.target.value.replace(/\D/g, '').slice(0, 3))}
                        className="w-16 h-8 text-center font-mono"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Preview: {sequentialStart}, {String(Number(sequentialStart) + 1).padStart(2, '0')}, {String(Number(sequentialStart) + 2).padStart(2, '0')}...
                    </span>
                  </div>
                </div>

                {/* Preview */}
                <div>
                  <Label className="text-sm font-medium text-foreground">PREVIEW</Label>
                  <div className="mt-2 p-3 rounded-lg bg-background border border-border font-mono text-sm text-primary break-all">
                    {resolvePreview() || <span className="text-muted-foreground italic">Nenhum template definido</span>}
                  </div>
                </div>

                {/* Template with highlights */}
                <div>
                  <Label className="text-sm font-medium text-foreground">TEMPLATE (com variáveis)</Label>
                  <div className="mt-2 p-3 rounded-lg bg-background border border-border font-mono text-sm break-all whitespace-pre-wrap">
                    {template.split(/(\{\{[^}]+\}\})/).map((part, i) => 
                      part.startsWith('{{') ? (
                        <span key={i} className="px-1 py-0.5 rounded bg-primary/20 text-primary font-medium">
                          {part}
                        </span>
                      ) : (
                        <span key={i} className="text-muted-foreground">{part}</span>
                      )
                    )}
                  </div>
                </div>

                {/* Variables Info */}
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <h4 className="text-sm font-medium text-amber-400 mb-2">VARIÁVEIS DINÂMICAS</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li><code className="text-amber-400">{'{{conta_codigo}}'}</code> — Primeiros 7 caracteres do nome</li>
                    <li><code className="text-amber-400">{'{{pagina_nome1}}'}</code> — Primeiro nome da página</li>
                    <li><code className="text-amber-400">{'{{estrutura}}'}</code> — Estrutura (ex: 1-4-1)</li>
                    <li><code className="text-amber-400">{'{{sequencial:08}}'}</code> — Incrementa a partir de 08</li>
                    <li><code className="text-amber-400">Data/Hora</code> — Resolvidas na criação</li>
                  </ul>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-secondary/30 flex items-center justify-between">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando...
            </div>
          )}
          {!isLoading && <div />}
          <Button onClick={handleApply} disabled={isSaving} className="glow-primary">
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Usar Template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
