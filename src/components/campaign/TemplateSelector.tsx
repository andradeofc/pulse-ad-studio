import { useState } from 'react';
import { FileText, Star, Trash2, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CampaignTemplate, useCampaignTemplates } from '@/hooks/useCampaignTemplates';
import { useCampaignStore, CampaignConfig } from '@/stores/campaignStore';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface TemplateSelectorProps {
  onTemplateApplied?: () => void;
}

export function TemplateSelector({ onTemplateApplied }: TemplateSelectorProps) {
  const { templates, isLoading, deleteTemplate, toggleFavorite } = useCampaignTemplates();
  const { updateConfig } = useCampaignStore();
  const [deleteConfirm, setDeleteConfirm] = useState<CampaignTemplate | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplate | null>(null);

  const handleApplyTemplate = (template: CampaignTemplate) => {
    // Parse dates back from ISO strings
    const config = { ...template.config };
    if (typeof config.scheduleStart === 'string') {
      config.scheduleStart = new Date(config.scheduleStart);
    }
    if (typeof config.scheduleEnd === 'string') {
      config.scheduleEnd = new Date(config.scheduleEnd);
    }

    // Apply all config from template
    updateConfig(config as Partial<CampaignConfig>);
    setSelectedTemplate(template);
    onTemplateApplied?.();
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirm) {
      await deleteTemplate(deleteConfirm.id);
      if (selectedTemplate?.id === deleteConfirm.id) {
        setSelectedTemplate(null);
      }
      setDeleteConfirm(null);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-9 w-48" />;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <FileText className="h-4 w-4" />
            {selectedTemplate ? selectedTemplate.name : 'Usar Template'}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {templates.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhum template salvo</p>
              <p className="text-xs mt-1">
                Salve templates na última etapa
              </p>
            </div>
          ) : (
            templates.map((template) => (
              <DropdownMenuItem
                key={template.id}
                className="flex items-center justify-between gap-2 cursor-pointer"
                onSelect={(e) => {
                  e.preventDefault();
                  handleApplyTemplate(template);
                }}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileText className="h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "truncate font-medium",
                      selectedTemplate?.id === template.id && "text-primary"
                    )}>
                      {template.name}
                    </p>
                    {template.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {template.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 [&_svg]:fill-current"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(template.id);
                    }}
                  >
                    <Star className={cn(
                      "h-3 w-3",
                      template.is_favorite && "fill-primary text-primary"
                    )} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm(template);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </DropdownMenuItem>
            ))
          )}
          {selectedTemplate && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-muted-foreground"
                onSelect={() => setSelectedTemplate(null)}
              >
                Limpar seleção
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o template "{deleteConfirm?.name}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
