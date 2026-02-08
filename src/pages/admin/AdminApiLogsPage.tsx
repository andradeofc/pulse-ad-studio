import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  Download,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AdminLayout } from '@/components/admin/AdminLayout';

interface ApiLog {
  id: string;
  user_id: string;
  endpoint: string;
  http_method: string;
  response_status: number;
  response_time_ms: number | null;
  error_message: string | null;
  request_body: Record<string, any> | null;
  response_body: Record<string, any> | null;
  facebook_object_id: string | null;
  facebook_object_type: string | null;
  ad_account_id: string | null;
  job_id: string | null;
  job_item_id: string | null;
  retry_count: number | null;
  created_at: string;
}

const methodColors: Record<string, string> = {
  GET: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  POST: 'bg-sky-500/10 text-sky-500 border-sky-500/30',
  PUT: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  PATCH: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
  DELETE: 'bg-rose-500/10 text-rose-500 border-rose-500/30',
};

const ITEMS_PER_PAGE = 50;

export default function AdminApiLogsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Fetch logs
  const { data: logsData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-api-logs', searchQuery, statusFilter, methodFilter, currentPage],
    queryFn: async () => {
      let query = supabase
        .from('api_call_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Filters
      if (searchQuery) {
        query = query.or(`endpoint.ilike.%${searchQuery}%,error_message.ilike.%${searchQuery}%,facebook_object_id.ilike.%${searchQuery}%`);
      }

      if (statusFilter !== 'all') {
        if (statusFilter === 'success') {
          query = query.gte('response_status', 200).lt('response_status', 300);
        } else if (statusFilter === 'error') {
          query = query.gte('response_status', 400);
        } else if (statusFilter === 'redirect') {
          query = query.gte('response_status', 300).lt('response_status', 400);
        }
      }

      if (methodFilter !== 'all') {
        query = query.eq('http_method', methodFilter);
      }

      // Pagination
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        logs: data as ApiLog[],
        total: count || 0,
        totalPages: Math.ceil((count || 0) / ITEMS_PER_PAGE),
      };
    },
    staleTime: 10000,
  });

  // Stats query
  const { data: stats } = useQuery({
    queryKey: ['admin-api-logs-stats'],
    queryFn: async () => {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [totalResult, successResult, errorResult, avgTimeResult] = await Promise.all([
        supabase
          .from('api_call_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', last24h.toISOString()),
        supabase
          .from('api_call_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', last24h.toISOString())
          .gte('response_status', 200)
          .lt('response_status', 300),
        supabase
          .from('api_call_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', last24h.toISOString())
          .gte('response_status', 400),
        supabase
          .from('api_call_logs')
          .select('response_time_ms')
          .gte('created_at', last24h.toISOString())
          .not('response_time_ms', 'is', null)
          .limit(1000),
      ]);

      const avgTime = avgTimeResult.data?.length
        ? Math.round(
            avgTimeResult.data.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) /
              avgTimeResult.data.length
          )
        : 0;

      return {
        total: totalResult.count || 0,
        success: successResult.count || 0,
        errors: errorResult.count || 0,
        avgTime,
      };
    },
    staleTime: 30000,
  });

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const getStatusBadge = (status: number) => {
    if (status >= 200 && status < 300) {
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
          {status}
        </Badge>
      );
    }
    if (status >= 300 && status < 400) {
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
          {status}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-rose-500/10 text-rose-500 border-rose-500/30">
        {status}
      </Badge>
    );
  };

  const formatJson = (obj: Record<string, any> | null) => {
    if (!obj) return 'null';
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  const successRate = stats?.total ? Math.round((stats.success / stats.total) * 100) : 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="w-6 h-6" />
              Logs de API
            </h1>
            <p className="text-muted-foreground">
              Monitoramento de chamadas à API do Facebook
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats?.total || 0}</p>
                  <p className="text-sm text-muted-foreground">Requisições (24h)</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-sky-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats?.success || 0}</p>
                  <p className="text-sm text-muted-foreground">Sucesso ({successRate}%)</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats?.errors || 0}</p>
                  <p className="text-sm text-muted-foreground">Erros (24h)</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-rose-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats?.avgTime || 0}ms</p>
                  <p className="text-sm text-muted-foreground">Tempo Médio</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-purple-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[250px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por endpoint, erro ou ID..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="success">Sucesso (2xx)</SelectItem>
                  <SelectItem value="redirect">Redirect (3xx)</SelectItem>
                  <SelectItem value="error">Erro (4xx+)</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={methodFilter}
                onValueChange={(v) => {
                  setMethodFilter(v);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Histórico de Requisições</CardTitle>
                <CardDescription>
                  {logsData?.total || 0} registros encontrados
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="w-[80px]">Método</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="w-[90px]">Tempo</TableHead>
                  <TableHead>Objeto FB</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Carregando logs...
                    </TableCell>
                  </TableRow>
                ) : logsData?.logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Nenhum log encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  logsData?.logs.map((log) => (
                    <Collapsible key={log.id} asChild>
                      <>
                        <TableRow
                          className="hover:bg-secondary/30 cursor-pointer"
                          onClick={() => toggleRow(log.id)}
                        >
                          <TableCell>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                {expandedRows.has(log.id) ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[300px]">
                              <p className="font-mono text-sm truncate text-foreground">
                                {log.endpoint}
                              </p>
                              {log.error_message && (
                                <p className="text-xs text-rose-500 truncate mt-0.5">
                                  {log.error_message}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={methodColors[log.http_method] || ''}
                            >
                              {log.http_method}
                            </Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(log.response_status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {log.response_time_ms ? `${log.response_time_ms}ms` : '-'}
                          </TableCell>
                          <TableCell>
                            {log.facebook_object_id ? (
                              <div className="text-sm">
                                <span className="text-muted-foreground">
                                  {log.facebook_object_type || 'object'}:
                                </span>{' '}
                                <span className="font-mono text-foreground">
                                  {log.facebook_object_id.slice(0, 12)}...
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(log.created_at), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </TableCell>
                        </TableRow>
                        {expandedRows.has(log.id) && (
                          <TableRow className="bg-secondary/20">
                            <TableCell colSpan={7} className="p-0">
                              <CollapsibleContent>
                                <div className="p-4 space-y-4">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div>
                                      <p className="text-muted-foreground">User ID</p>
                                      <p className="font-mono text-foreground truncate">
                                        {log.user_id.slice(0, 8)}...
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Ad Account</p>
                                      <p className="font-mono text-foreground">
                                        {log.ad_account_id || '-'}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Job ID</p>
                                      <p className="font-mono text-foreground truncate">
                                        {log.job_id ? `${log.job_id.slice(0, 8)}...` : '-'}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Retry Count</p>
                                      <p className="text-foreground">{log.retry_count || 0}</p>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-sm text-muted-foreground mb-2">
                                        Request Body
                                      </p>
                                      <ScrollArea className="h-[150px] w-full rounded-md border border-border bg-background/50 p-3">
                                        <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
                                          {formatJson(log.request_body)}
                                        </pre>
                                      </ScrollArea>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground mb-2">
                                        Response Body
                                      </p>
                                      <ScrollArea className="h-[150px] w-full rounded-md border border-border bg-background/50 p-3">
                                        <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
                                          {formatJson(log.response_body)}
                                        </pre>
                                      </ScrollArea>
                                    </div>
                                  </div>

                                  {log.error_message && (
                                    <div>
                                      <p className="text-sm text-muted-foreground mb-2">
                                        Mensagem de Erro
                                      </p>
                                      <div className="p-3 rounded-md border border-rose-500/30 bg-rose-500/10">
                                        <p className="text-sm text-rose-500">{log.error_message}</p>
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex items-center justify-between pt-2 border-t border-border">
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm:ss", {
                                        locale: ptBR,
                                      })}
                                    </span>
                                    <span className="text-xs font-mono text-muted-foreground">
                                      ID: {log.id.slice(0, 8)}
                                    </span>
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    </Collapsible>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {logsData && logsData.totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Página {currentPage} de {logsData.totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(logsData.totalPages, p + 1))}
                    disabled={currentPage === logsData.totalPages}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
