import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Hash,
  User,
  Megaphone,
  CreditCard,
  Settings2,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Link } from 'react-router-dom';

interface SearchResult {
  type: 'user' | 'job' | 'campaign' | 'account';
  id: string;
  title: string;
  subtitle: string;
  link: string;
}

export default function AdminSearchPage() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const { data: results = [], refetch, isFetching } = useQuery({
    queryKey: ['admin-search', query],
    queryFn: async (): Promise<SearchResult[]> => {
      if (!query.trim()) return [];

      const searchResults: SearchResult[] = [];
      const searchTerm = query.trim();

      // Search jobs by hash
      if (searchTerm.startsWith('#') || searchTerm.length <= 10) {
        const hashToSearch = searchTerm.replace('#', '');
        const { data: jobs } = await supabase
          .from('campaign_jobs')
          .select('id, hash, name, status')
          .ilike('hash', `%${hashToSearch}%`)
          .limit(5);

        jobs?.forEach(job => {
          searchResults.push({
            type: 'job',
            id: job.id,
            title: `#${job.hash}`,
            subtitle: job.name,
            link: `/ops-center/fila/${job.hash}`,
          });
        });
      }

      // Search users by name or email
      const { data: users } = await supabase
        .from('user_profiles')
        .select('id, user_id, full_name')
        .or(`full_name.ilike.%${searchTerm}%,user_id.eq.${searchTerm}`)
        .limit(5);

      users?.forEach(user => {
        searchResults.push({
          type: 'user',
          id: user.id,
          title: user.full_name || 'Usuário',
          subtitle: `ID: ${user.user_id.slice(0, 8)}...`,
          link: `/ops-center/usuarios/${user.id}`,
        });
      });

      // Search campaigns by name
      const { data: campaigns } = await supabase
        .from('campaign_jobs')
        .select('id, name, hash')
        .ilike('name', `%${searchTerm}%`)
        .limit(5);

      campaigns?.forEach(campaign => {
        searchResults.push({
          type: 'campaign',
          id: campaign.id,
          title: campaign.name,
          subtitle: `Hash: #${campaign.hash}`,
          link: `/ops-center/campanhas/${campaign.id}`,
        });
      });

      // Search ad accounts
      const { data: accounts } = await supabase
        .from('facebook_ad_accounts')
        .select('id, name, account_id')
        .or(`name.ilike.%${searchTerm}%,account_id.ilike.%${searchTerm}%`)
        .limit(5);

      accounts?.forEach(account => {
        searchResults.push({
          type: 'account',
          id: account.id,
          title: account.name,
          subtitle: account.account_id,
          link: `/ops-center/usuarios`,
        });
      });

      return searchResults;
    },
    enabled: query.length >= 2,
  });

  const handleSearch = () => {
    if (query.trim()) {
      refetch();
    }
  };

  const typeConfig = {
    user: { icon: User, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    job: { icon: Settings2, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    campaign: { icon: Megaphone, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    account: { icon: CreditCard, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  };

  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.type]) acc[result.type] = [];
    acc[result.type].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  const typeLabels = {
    user: 'Usuários',
    job: 'Jobs',
    campaign: 'Campanhas',
    account: 'Contas de Anúncio',
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
            <Search className="w-6 h-6" />
            Busca Universal
          </h1>
          <p className="text-muted-foreground mt-2">
            Busque por hash de job, ID de campanha, email/nome de usuário ou conta de anúncio
          </p>
        </div>

        {/* Search Box */}
        <Card className="glass-card max-w-2xl mx-auto">
          <CardContent className="p-6">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="#abc123, email@email.com, nome do usuário..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-12 h-12 text-lg"
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={isFetching || query.length < 2}
                className="h-12 px-6 bg-red-600 hover:bg-red-700"
              >
                {isFetching ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Search className="w-5 h-5" />
                )}
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="px-2 py-1 bg-secondary/50 rounded">Hash: #abc123</span>
              <span className="px-2 py-1 bg-secondary/50 rounded">Email: user@email.com</span>
              <span className="px-2 py-1 bg-secondary/50 rounded">Nome: João Silva</span>
              <span className="px-2 py-1 bg-secondary/50 rounded">Conta: act_123456789</span>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {query.length >= 2 && (
          <div className="max-w-2xl mx-auto space-y-4">
            {Object.entries(groupedResults).length === 0 && !isFetching ? (
              <Card className="glass-card">
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">Nenhum resultado encontrado para "{query}"</p>
                </CardContent>
              </Card>
            ) : (
              Object.entries(groupedResults).map(([type, items]) => {
                const config = typeConfig[type as keyof typeof typeConfig];
                const Icon = config?.icon || Search;

                return (
                  <Card key={type} className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${config?.color}`} />
                        {typeLabels[type as keyof typeof typeLabels]} ({items.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        {items.map((result) => (
                          <Link
                            key={result.id}
                            to={result.link}
                            className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-lg ${config?.bg} flex items-center justify-center`}>
                                <Icon className={`w-5 h-5 ${config?.color}`} />
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{result.title}</p>
                                <p className="text-xs text-muted-foreground">{result.subtitle}</p>
                              </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          </Link>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
