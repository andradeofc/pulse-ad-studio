import { useMemo, useState, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, Loader2, FolderOpen, Layers, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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

// Count children status for summary badge
function countChildrenStatus(node: TreeNode): { total: number; completed: number; failed: number; processing: number } {
  let total = 0;
  let completed = 0;
  let failed = 0;
  let processing = 0;

  function traverse(n: TreeNode) {
    for (const child of n.children) {
      total++;
      if (child.status === 'completed') completed++;
      if (child.status === 'failed') failed++;
      if (child.status === 'processing') processing++;
      traverse(child);
    }
  }

  traverse(node);
  return { total, completed, failed, processing };
}

interface TreeItemProps {
  node: TreeNode;
  depth?: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}

function TreeItem({ node, depth = 0, expandedIds, onToggle }: TreeItemProps) {
  const StatusIcon = statusIcons[node.status];
  const TypeIcon = typeIcons[node.item_type];
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const childrenStatus = hasChildren ? countChildrenStatus(node) : null;

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors",
          hasChildren ? "cursor-pointer hover:bg-secondary/50" : "hover:bg-secondary/30",
          depth > 0 && "ml-4"
        )}
        style={{ marginLeft: depth * 16 }}
        onClick={hasChildren ? () => onToggle(node.id) : undefined}
      >
        {/* Expand/Collapse chevron */}
        {hasChildren ? (
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </div>
        ) : (
          <div className="w-4 h-4 flex-shrink-0" />
        )}

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

        {/* Children summary when collapsed */}
        {hasChildren && !isExpanded && childrenStatus && (
          <span className="text-[10px] text-muted-foreground">
            {childrenStatus.completed}/{childrenStatus.total}
            {childrenStatus.failed > 0 && (
              <span className="text-ads-danger ml-1">({childrenStatus.failed} ✗)</span>
            )}
          </span>
        )}

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
        <div 
          className="text-xs text-ads-danger bg-ads-danger/10 rounded px-2 py-1 mt-1"
          style={{ marginLeft: (depth * 16) + 24 }}
        >
          {node.error_message}
        </div>
      )}

      {/* Children - only show when expanded */}
      {hasChildren && isExpanded && (
        <div className="border-l border-border/50 ml-3" style={{ marginLeft: (depth * 16) + 12 }}>
          {node.children.map((child) => (
            <TreeItem 
              key={child.id} 
              node={child} 
              depth={depth + 1} 
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function JobItemsTree({ items, isLoading }: JobItemsTreeProps) {
  const tree = useMemo(() => buildTree(items), [items]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const handleToggle = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allIds = new Set<string>();
    function collectIds(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.children.length > 0) {
          allIds.add(node.id);
          collectIds(node.children);
        }
      }
    }
    collectIds(tree);
    setExpandedIds(allIds);
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

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

  const hasExpandableItems = tree.some(node => node.children.length > 0);

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

      {/* Expand/Collapse controls */}
      {hasExpandableItems && (
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={expandAll}
            className="text-xs h-7 px-2"
          >
            <ChevronDown className="w-3 h-3 mr-1" />
            Expandir tudo
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={collapseAll}
            className="text-xs h-7 px-2"
          >
            <ChevronRight className="w-3 h-3 mr-1" />
            Recolher tudo
          </Button>
        </div>
      )}

      {/* Tree */}
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {tree.map((node) => (
          <TreeItem 
            key={node.id} 
            node={node} 
            expandedIds={expandedIds}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  );
}
