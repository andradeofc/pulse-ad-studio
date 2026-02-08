import { useState } from 'react';
import { Save, FileText, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCampaignTemplates, CampaignTemplate } from '@/hooks/useCampaignTemplates';
import { useCampaignStore } from '@/stores/campaignStore';

interface SaveTemplateModalProps {
  trigger?: React.ReactNode;
}

export function SaveTemplateModal({ trigger }: SaveTemplateModalProps) {
  const { templates, saveTemplate, updateTemplate } = useCampaignTemplates();
  const { config } = useCampaignStore();
  
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'new' | 'update'>('new');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      // Reset state when opening
      setMode('new');
      setSelectedTemplateId('');
      setName('');
      setDescription('');
    }
  };

  const handleModeChange = (newMode: 'new' | 'update') => {
    setMode(newMode);
    if (newMode === 'new') {
      setSelectedTemplateId('');
      setName('');
      setDescription('');
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setName(template.name);
      setDescription(template.description || '');
    }
  };

  const handleSave = async () => {
    if (mode === 'new' && !name.trim()) return;
    if (mode === 'update' && !selectedTemplateId) return;

    setIsSaving(true);
    try {
      if (mode === 'new') {
        await saveTemplate(name.trim(), config, description.trim() || undefined);
      } else {
        await updateTemplate(selectedTemplateId, {
          name: name.trim(),
          description: description.trim() || undefined,
          config,
        });
      }
      setOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Save className="h-4 w-4" />
            Salvar Template
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Salvar Template de Campanha
          </DialogTitle>
          <DialogDescription>
            Salve as configurações atuais como template para reutilizar em futuras campanhas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Mode Selection */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'new' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => handleModeChange('new')}
            >
              <Save className="h-4 w-4 mr-2" />
              Novo Template
            </Button>
            <Button
              type="button"
              variant={mode === 'update' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => handleModeChange('update')}
              disabled={templates.length === 0}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar Existente
            </Button>
          </div>

          {/* Update Mode: Template Selection */}
          {mode === 'update' && (
            <div className="space-y-2">
              <Label>Selecionar Template</Label>
              <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Name Input */}
          <div className="space-y-2">
            <Label htmlFor="template-name">Nome do Template *</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Campanha de Vendas Padrão"
              disabled={mode === 'update' && !selectedTemplateId}
            />
          </div>

          {/* Description Input */}
          <div className="space-y-2">
            <Label htmlFor="template-description">Descrição (opcional)</Label>
            <Textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva quando usar este template..."
              rows={2}
              disabled={mode === 'update' && !selectedTemplateId}
            />
          </div>

          {/* Info about what's saved */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
            <p className="font-medium mb-1">O template salvará:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Configurações de campanha (objetivo, orçamento, estratégia)</li>
              <li>Configurações de conjunto (targeting, placements, atribuição)</li>
              <li>Configurações de anúncios (textos, CTA, URL)</li>
              <li>Distribuição e nomenclatura</li>
            </ul>
            <p className="mt-2 text-warning">
              ⚠️ Criativos e contas não são salvos no template.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || (mode === 'new' ? !name.trim() : !selectedTemplateId)}
          >
            {isSaving ? 'Salvando...' : mode === 'new' ? 'Criar Template' : 'Atualizar Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
