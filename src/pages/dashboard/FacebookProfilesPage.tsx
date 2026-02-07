import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Facebook,
  RefreshCw,
  Trash2,
  Settings,
  CheckCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import {
  fetchFacebookProfiles,
  addFacebookProfile,
  syncFacebookAdAccounts,
  deleteFacebookProfile,
  updateFacebookProfileProxy,
  validateFacebookToken,
  type FacebookProfile,
} from '@/services/facebookService';

export default function FacebookProfilesPage() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  
  const [profiles, setProfiles] = useState<FacebookProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddTokenOpen, setIsAddTokenOpen] = useState(false);
  const [isProxyOpen, setIsProxyOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null);
  
  const [tokenInput, setTokenInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSyncing, setSyncing] = useState<string | null>(null);
  
  const [proxyForm, setProxyForm] = useState({
    host: '',
    port: '',
    username: '',
    password: '',
  });

  const loadProfiles = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      setIsLoading(true);
      const data = await fetchFacebookProfiles();
      setProfiles(data);
    } catch (error) {
      console.error('Error loading profiles:', error);
      toast({
        title: 'Erro ao carregar perfis',
        description: 'Não foi possível carregar seus perfis do Facebook.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, toast]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleValidateToken = async () => {
    if (!tokenInput.trim()) return;
    
    setIsValidating(true);
    try {
      const result = await validateFacebookToken(tokenInput);
      
      if (!result.valid) {
        toast({
          title: 'Token inválido',
          description: result.error || 'O token fornecido não é válido.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Token válido!',
        description: `Usuário: ${result.user?.name}. Adicionando perfil...`,
      });

      // Add the profile
      const addResult = await addFacebookProfile(tokenInput);
      
      if (addResult.success) {
        toast({
          title: 'Perfil adicionado!',
          description: 'Sincronizando contas de anúncio...',
        });
        
        // Sync ad accounts
        await syncFacebookAdAccounts(addResult.profile.id);
        
        await loadProfiles();
        setIsAddTokenOpen(false);
        setTokenInput('');
        
        toast({
          title: 'Concluído!',
          description: 'Perfil e contas de anúncio sincronizados.',
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSync = async (profileId: string) => {
    setSyncing(profileId);
    try {
      const result = await syncFacebookAdAccounts(profileId);
      
      if (result.tokenExpired) {
        toast({
          title: 'Token expirado',
          description: 'Atualize o token de acesso para continuar.',
          variant: 'destructive',
        });
        await loadProfiles();
        return;
      }
      
      toast({
        title: 'Sincronização concluída!',
        description: `${result.accountsCount} contas de anúncio encontradas.`,
      });
      
      await loadProfiles();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro ao sincronizar',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setSyncing(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteProfileId) return;
    
    try {
      await deleteFacebookProfile(deleteProfileId);
      toast({
        title: 'Perfil removido',
        description: 'O perfil e suas contas de anúncio foram removidos.',
      });
      await loadProfiles();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro ao remover',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setDeleteProfileId(null);
    }
  };

  const handleUpdateProxy = async () => {
    if (!selectedProfileId) return;
    
    try {
      await updateFacebookProfileProxy(selectedProfileId, {
        proxyHost: proxyForm.host || undefined,
        proxyPort: proxyForm.port ? parseInt(proxyForm.port) : undefined,
        proxyUsername: proxyForm.username || undefined,
        proxyPassword: proxyForm.password || undefined,
      });
      
      toast({
        title: 'Proxy atualizado!',
        description: 'Configurações de proxy salvas com sucesso.',
      });
      
      setIsProxyOpen(false);
      setProxyForm({ host: '', port: '', username: '', password: '' });
      await loadProfiles();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro ao atualizar proxy',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const openProxyModal = (profile: FacebookProfile) => {
    setSelectedProfileId(profile.id);
    setProxyForm({
      host: profile.proxy_host || '',
      port: profile.proxy_port?.toString() || '',
      username: profile.proxy_username || '',
      password: '',
    });
    setIsProxyOpen(true);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isAuthenticated) {
    return (
      <Card className="glass-card">
        <CardContent className="py-16 text-center">
          <AlertCircle className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            Autenticação necessária
          </h3>
          <p className="text-muted-foreground">
            Faça login para gerenciar seus perfis do Facebook.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Perfis do Facebook</h1>
          <p className="text-muted-foreground">
            {isLoading ? 'Carregando...' : `${profiles.length} perfil(s) conectado(s)`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Dialog open={isAddTokenOpen} onOpenChange={setIsAddTokenOpen}>
            <DialogTrigger asChild>
              <Button className="glow-primary">
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Token Manual
                <Badge variant="outline" className="ml-2 text-xs">Recomendado</Badge>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Adicionar Token de Acesso</DialogTitle>
                <DialogDescription>
                  Cole o token de acesso do Facebook para conectar seu perfil.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="token">Access Token</Label>
                  <Textarea
                    id="token"
                    placeholder="Cole seu token de acesso aqui..."
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    className="min-h-[100px] font-mono text-sm"
                  />
                </div>
                <div className="p-4 bg-secondary/50 rounded-lg border border-border">
                  <h4 className="text-sm font-medium text-foreground mb-2">Como obter o token:</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Acesse o Graph API Explorer do Facebook</li>
                    <li>Selecione as permissões necessárias (ads_management, ads_read)</li>
                    <li>Gere o token e copie</li>
                  </ol>
                  <Button
                    variant="link"
                    className="px-0 mt-2 h-auto text-primary"
                    asChild
                  >
                    <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer">
                      Abrir Graph API Explorer
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddTokenOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleValidateToken} disabled={!tokenInput || isValidating}>
                  {isValidating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Validando...
                    </>
                  ) : (
                    'Salvar Token'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button variant="outline" disabled>
            <Facebook className="w-4 h-4 mr-2" />
            Conectar Facebook
            <Badge variant="secondary" className="ml-2 text-xs">Em breve</Badge>
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Profiles Grid */}
      {!isLoading && profiles.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {profiles.map((profile, index) => (
            <motion.div
              key={profile.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="glass-card">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar className="w-14 h-14 border-2 border-border">
                        <AvatarImage src={profile.avatar_url || ''} />
                        <AvatarFallback className="bg-primary/20 text-primary text-lg">
                          {profile.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-lg text-foreground">{profile.name}</CardTitle>
                        <CardDescription>{profile.email || profile.facebook_id}</CardDescription>
                      </div>
                    </div>
                    <Badge className={profile.status === 'active' ? 'badge-active' : 'badge-danger'}>
                      {profile.status === 'active' ? 'Ativa' : profile.status === 'expired' ? 'Expirada' : 'Inativa'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-secondary/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Facebook ID</p>
                      <p className="text-sm font-mono text-foreground truncate">{profile.facebook_id}</p>
                    </div>
                    <div className="p-3 bg-secondary/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">Última Sync</p>
                      <p className="text-sm font-medium text-foreground">{formatDate(profile.last_synced_at)}</p>
                    </div>
                  </div>

                  {/* Token Expiration */}
                  <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Token expira em:</span>
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {profile.token_expires_at ? formatDate(profile.token_expires_at) : 'Não definido'}
                    </span>
                  </div>

                  {/* Permissions */}
                  {profile.permissions && profile.permissions.length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Permissões:</p>
                      <div className="flex flex-wrap gap-2">
                        {profile.permissions.map((perm) => (
                          <Badge key={perm} variant="secondary" className="text-xs">
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Page Token */}
                  <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      {profile.page_token_valid ? (
                        <CheckCircle className="w-4 h-4 text-ads-success" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-ads-danger" />
                      )}
                      <span className="text-sm text-muted-foreground">Token de Páginas</span>
                    </div>
                    <Badge variant={profile.page_token_valid ? 'default' : 'secondary'}>
                      {profile.page_token_valid ? 'Válido' : 'Não verificado'}
                    </Badge>
                  </div>

                  {/* Proxy */}
                  <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Proxy</span>
                      {profile.proxy_host && (
                        <Badge variant="outline" className="text-xs">Configurado</Badge>
                      )}
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-primary"
                      onClick={() => openProxyModal(profile)}
                    >
                      Configurar
                    </Button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => handleSync(profile.id)}
                      disabled={isSyncing === profile.id}
                    >
                      {isSyncing === profile.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sincronizando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Sincronizar
                        </>
                      )}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteProfileId(profile.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && profiles.length === 0 && (
        <Card className="glass-card">
          <CardContent className="py-16 text-center">
            <Facebook className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              Nenhum perfil conectado
            </h3>
            <p className="text-muted-foreground mb-6">
              Conecte seu perfil do Facebook para começar a gerenciar suas contas de anúncio.
            </p>
            <Button className="glow-primary" onClick={() => setIsAddTokenOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Perfil
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Proxy Configuration Modal */}
      <Dialog open={isProxyOpen} onOpenChange={setIsProxyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Proxy</DialogTitle>
            <DialogDescription>
              Configure um proxy para as requisições deste perfil.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="proxyHost">Host</Label>
                <Input
                  id="proxyHost"
                  placeholder="proxy.example.com"
                  value={proxyForm.host}
                  onChange={(e) => setProxyForm(prev => ({ ...prev, host: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proxyPort">Porta</Label>
                <Input
                  id="proxyPort"
                  type="number"
                  placeholder="8080"
                  value={proxyForm.port}
                  onChange={(e) => setProxyForm(prev => ({ ...prev, port: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="proxyUsername">Usuário (opcional)</Label>
              <Input
                id="proxyUsername"
                placeholder="username"
                value={proxyForm.username}
                onChange={(e) => setProxyForm(prev => ({ ...prev, username: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proxyPassword">Senha (opcional)</Label>
              <Input
                id="proxyPassword"
                type="password"
                placeholder="••••••••"
                value={proxyForm.password}
                onChange={(e) => setProxyForm(prev => ({ ...prev, password: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProxyOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateProxy}>
              Salvar Configuração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteProfileId} onOpenChange={() => setDeleteProfileId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover perfil?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O perfil e todas as contas de anúncio associadas serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
