import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Filter,
  Upload,
  Facebook,
  Edit2,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface AdAccount {
  id: string;
  accountId: string;
  name: string;
  nickname: string;
  status: 'active' | 'blocked' | 'pending' | 'disabled';
  currency: string;
  timezone: string;
  totalSpent: number;
  lastSynced: string;
}

const mockAccounts: AdAccount[] = [
  {
    id: '1',
    accountId: 'act_1234567890',
    name: 'Conta Principal BRL',
    nickname: 'CP-BRL',
    status: 'active',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    totalSpent: 45678.90,
    lastSynced: '2024-01-26 14:30',
  },
  {
    id: '2',
    accountId: 'act_0987654321',
    name: 'Conta Internacional USD',
    nickname: 'CI-USD',
    status: 'active',
    currency: 'USD',
    timezone: 'America/New_York',
    totalSpent: 12345.67,
    lastSynced: '2024-01-26 12:00',
  },
  {
    id: '3',
    accountId: 'act_1122334455',
    name: 'Conta Teste',
    nickname: '',
    status: 'blocked',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    totalSpent: 0,
    lastSynced: '2024-01-20 08:00',
  },
  {
    id: '4',
    accountId: 'act_5566778899',
    name: 'Nova Conta EUR',
    nickname: 'NC-EUR',
    status: 'pending',
    currency: 'EUR',
    timezone: 'Europe/Lisbon',
    totalSpent: 0,
    lastSynced: '2024-01-25 16:45',
  },
];

const statusConfig = {
  active: { label: 'Ativa', className: 'badge-active' },
  blocked: { label: 'Bloqueada', className: 'badge-danger' },
  pending: { label: 'Pendente', className: 'badge-warning' },
  disabled: { label: 'Desativada', className: 'bg-muted text-muted-foreground' },
};

export default function AdAccountsPage() {
  const [accounts] = useState<AdAccount[]>(mockAccounts);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [editingNickname, setEditingNickname] = useState<string | null>(null);
  const [nicknameValue, setNicknameValue] = useState('');

  const filteredAccounts = accounts.filter((account) => {
    const matchesSearch =
      account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.accountId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.nickname.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || account.status === statusFilter;
    const matchesCurrency = currencyFilter === 'all' || account.currency === currencyFilter;
    return matchesSearch && matchesStatus && matchesCurrency;
  });

  const activeCount = accounts.filter((a) => a.status === 'active').length;
  const totalSpent = accounts.reduce((sum, a) => sum + a.totalSpent, 0);

  const toggleSelectAll = () => {
    if (selectedAccounts.length === filteredAccounts.length) {
      setSelectedAccounts([]);
    } else {
      setSelectedAccounts(filteredAccounts.map((a) => a.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const startEditNickname = (account: AdAccount) => {
    setEditingNickname(account.id);
    setNicknameValue(account.nickname);
  };

  const saveNickname = () => {
    // Save nickname logic
    setEditingNickname(null);
  };

  const formatCurrency = (value: number, currency: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency,
    }).format(value);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contas de Anúncio</h1>
          <p className="text-muted-foreground">
            {accounts.length} contas · {activeCount} ativas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            <Upload className="w-4 h-4 mr-2" />
            Importar Apelidos
          </Button>
          <Button variant="outline">
            <Facebook className="w-4 h-4 mr-2" />
            Conectar Facebook
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="glass-card">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total de Contas</p>
            <p className="text-3xl font-bold text-foreground mt-1">{accounts.length}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total Investido</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              {formatCurrency(totalSpent, 'BRL')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, ID ou apelido..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-secondary/50"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-40 bg-secondary/50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="blocked">Bloqueada</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="disabled">Desativada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
              <SelectTrigger className="w-full md:w-40 bg-secondary/50">
                <SelectValue placeholder="Moeda" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="BRL">BRL</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="glass-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-4">
                    <Checkbox
                      checked={
                        selectedAccounts.length === filteredAccounts.length &&
                        filteredAccounts.length > 0
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                    Conta
                  </th>
                  <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                    ID da Conta
                  </th>
                  <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                    Apelido
                  </th>
                  <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                    Moeda
                  </th>
                  <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                    Fuso
                  </th>
                  <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                    Gasto Total
                  </th>
                  <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                    Última Sync
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((account) => (
                  <motion.tr
                    key={account.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-border/50 hover:bg-secondary/30 transition-colors"
                  >
                    <td className="py-4 px-4">
                      <Checkbox
                        checked={selectedAccounts.includes(account.id)}
                        onCheckedChange={() => toggleSelect(account.id)}
                      />
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-sm font-medium text-foreground">
                        {account.name}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <code className="text-xs bg-secondary/50 px-2 py-1 rounded text-muted-foreground">
                        {account.accountId}
                      </code>
                    </td>
                    <td className="py-4 px-4">
                      {editingNickname === account.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={nicknameValue}
                            onChange={(e) => setNicknameValue(e.target.value)}
                            className="h-8 w-24 text-sm"
                            autoFocus
                          />
                          <Button size="icon" variant="ghost" onClick={saveNickname} className="h-8 w-8">
                            <Check className="w-4 h-4 text-ads-success" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => setEditingNickname(null)}
                            className="h-8 w-8"
                          >
                            <X className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditNickname(account)}
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                        >
                          {account.nickname || <span className="italic">Sem apelido</span>}
                          <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <Badge className={statusConfig[account.status].className}>
                        {statusConfig[account.status].label}
                      </Badge>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-sm text-foreground">{account.currency}</span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-xs text-muted-foreground">{account.timezone}</span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-sm font-medium text-foreground">
                        {formatCurrency(account.totalSpent, account.currency)}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-xs text-muted-foreground">{account.lastSynced}</span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between p-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Mostrando 1-{filteredAccounts.length} de {accounts.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled>
                Próximo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
