import { useMemo } from 'react';
import { CheckCircle, XCircle, Clock, Loader2, FolderOpen, Layers, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CampaignJobItem } from '@/hooks/useCampaignJobs';

interface JobItemsTreeProps {
  items: CampaignJobItem[];
  isLoading: boolean;
}

const statusIcons = {
  pending: Clock,
  processing: Loader2,
  completed: CheckCircle,
  failed: XCircle,
};

const typeIcons = {
  campaign: FolderOpen,
  adset: Layers,
  ad: FileText,
};

const typeLabels = {
  campaign: 'Campanha',
  adset: 'Conjunto',
  ad: 'Anúncio',
};

interface TreeNode extends CampaignJobItem {
  children: TreeNode[];
}

function buildTree(items: CampaignJobItem[]): TreeNode[] {
  const itemMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // First pass: create all nodes
  for (const item of items) {
    itemMap.set(item.id, { ...item, children: [] });
  }

  // Second pass: build hierarchy
  for (const item of items) {
    const node = itemMap.get(item.id)!;
    if (item.parent_id && itemMap.has(item.parent_id)) {
      itemMap.get(item.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function TreeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const StatusIcon = statusIcons[node.status];
  const TypeIcon = typeIcons[node.item_type];

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-secondary/50 transition-colors",
          depth > 0 && "ml-4"
        )}
        style={{ marginLeft: depth * 16 }}
      >
        <TypeIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        
        <StatusIcon
          className={cn(
            "w-3.5 h-3.5 flex-shrink-0",
            node.status === 'pending' && "text-muted-foreground",
            node.status === 'processing' && "text-ads-info animate-spin",
            node.status === 'completed' && "text-ads-success",
            node.status === 'failed' && "text-ads-danger"
          )}
        />

        <span className="text-sm truncate flex-1" title={node.name}>
          {node.name}
        </span>

        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0",
            node.status === 'completed' && "border-ads-success/50 text-ads-success",
            node.status === 'failed' && "border-ads-danger/50 text-ads-danger",
            node.status === 'processing' && "border-ads-info/50 text-ads-info"
          )}
        >
          {typeLabels[node.item_type]}
        </Badge>

        {node.facebook_id && (
          <span className="text-[10px] text-muted-foreground font-mono">
            #{node.facebook_id.slice(-6)}
          </span>
        )}
      </div>

      {node.error_message && (
        <div className="ml-8 text-xs text-ads-danger bg-ads-danger/10 rounded px-2 py-1 mt-1">
          {node.error_message}
        </div>
      )}

      {node.children.length > 0 && (
        <div className="border-l border-border/50 ml-3">
          {node.children.map((child) => (
            <TreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function JobItemsTree({ items, isLoading }: JobItemsTreeProps) {
  const tree = useMemo(() => buildTree(items), [items]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Carregando itens...</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        Nenhum item encontrado neste job.
      </div>
    );
  }

  // Summary counts
  const counts = {
    campaigns: items.filter(i => i.item_type === 'campaign').length,
    adsets: items.filter(i => i.item_type === 'adset').length,
    ads: items.filter(i => i.item_type === 'ad').length,
    completed: items.filter(i => i.status === 'completed').length,
    failed: items.filter(i => i.status === 'failed').length,
  };

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pb-2 border-b border-border/50">
        <span className="flex items-center gap-1">
          <FolderOpen className="w-3.5 h-3.5" />
          {counts.campaigns} campanhas
        </span>
        <span className="flex items-center gap-1">
          <Layers className="w-3.5 h-3.5" />
          {counts.adsets} conjuntos
        </span>
        <span className="flex items-center gap-1">
          <FileText className="w-3.5 h-3.5" />
          {counts.ads} anúncios
        </span>
        <span className="ml-auto flex items-center gap-1">
          <CheckCircle className="w-3.5 h-3.5 text-ads-success" />
          {counts.completed} concluídos
        </span>
        {counts.failed > 0 && (
          <span className="flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5 text-ads-danger" />
            {counts.failed} falhas
          </span>
        )}
      </div>

      {/* Tree */}
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {tree.map((node) => (
          <TreeItem key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}
