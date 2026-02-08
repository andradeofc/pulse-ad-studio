import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, XCircle, Clock, Package } from 'lucide-react';

interface ScheduleProduct {
  id: string;
  retailer_id: string;
  product_name: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface ScheduleProductsModalProps {
  scheduleId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ScheduleProductsModal({ scheduleId, isOpen, onClose }: ScheduleProductsModalProps) {
  const { data: products, isLoading } = useQuery({
    queryKey: ['schedule-products', scheduleId],
    queryFn: async () => {
      if (!scheduleId) return [];
      
      const { data, error } = await supabase
        .from('catalog_schedule_products')
        .select('*')
        .eq('schedule_id', scheduleId)
        .order('status', { ascending: true })
        .order('retailer_id', { ascending: true });

      if (error) throw error;
      return data as ScheduleProduct[];
    },
    enabled: !!scheduleId && isOpen,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30"><Clock className="w-3 h-3 mr-1" /> Pendente</Badge>;
      case 'success':
        return <Badge variant="outline" className="bg-success/10 text-success border-success/30"><CheckCircle2 className="w-3 h-3 mr-1" /> Sucesso</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30"><XCircle className="w-3 h-3 mr-1" /> Falhou</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const successCount = products?.filter(p => p.status === 'success').length || 0;
  const failedCount = products?.filter(p => p.status === 'failed').length || 0;
  const pendingCount = products?.filter(p => p.status === 'pending').length || 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Produtos do Agendamento
          </DialogTitle>
          <DialogDescription>
            Detalhamento de cada produto atualizado neste agendamento
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="flex gap-4 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="text-success font-medium">{successCount} sucesso</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <XCircle className="w-4 h-4 text-destructive" />
            <span className="text-destructive font-medium">{failedCount} falhas</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-warning" />
            <span className="text-warning font-medium">{pendingCount} pendentes</span>
          </div>
        </div>

        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 p-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : products?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum produto registrado para este agendamento</p>
              <p className="text-xs mt-1">Os produtos serão registrados quando o agendamento for processado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Retailer ID</TableHead>
                  <TableHead>Nome do Produto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products?.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono text-xs">
                      {product.retailer_id}
                    </TableCell>
                    <TableCell className="text-sm">
                      {product.product_name || '-'}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(product.status)}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {product.error_message ? (
                        <span className="text-xs text-destructive truncate block" title={product.error_message}>
                          {product.error_message}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
