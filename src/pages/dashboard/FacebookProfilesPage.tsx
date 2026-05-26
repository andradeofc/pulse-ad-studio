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
  Key,
  Wifi,
  WifiOff,
  Globe,
  Shield,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import {
  fetchFacebookProfiles,
  addFacebookProfile,
  syncFacebookAdAccounts,
  deleteFacebookProfile,
  updateFacebookProfileProxy,
  validateFacebookToken,
  updateFacebookToken,
  testProxyConnection,
  type FacebookProfile,
} from '@/services/facebookService';
import { AddProfileWizard } from '@/components/facebook/AddProfileWizard';


export default function FacebookProfilesPage() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  
  const [profiles, setProfiles] = useState<FacebookProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddTokenOpen, setIsAddTokenOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isUpdateTokenOpen, setIsUpdateTokenOpen] = useState(false);
  const [isProxyOpen, setIsProxyOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null);
  
  const [tokenInput, setTokenInput] = useState('');
  const [updateTokenInput, setUpdateTokenInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isUpdatingToken, setIsUpdatingToken] = useState(false);
  const [isSyncing, setSyncing] = useState<string | null>(null);
  
  const [proxyForm, setProxyForm] = useState({
    protocol: 'http',
    host: '',
    port: '',
    username: '',
    password: '',
  });
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<{
    success: boolean;
    externalIp?: string;
    message?: string;
    error?: string;
  } | null>(null);
  const [proxyTestPassed, setProxyTestPassed] = useState(false);

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

      // Add the profile - now with background sync
      const addResult = await addFacebookProfile(tokenInput);
      
      if (addResult.success) {
        await loadProfiles();
        setIsAddTokenOpen(false);
        setTokenInput('');
        
        // Check if sync is running in background
        if (addResult.background) {
          toast({
            title: 'Perfil adicionado!',
            description: 'Sincronização iniciada em background. Acompanhe o progresso na barra lateral.',
          });
        } else {
          toast({
            title: 'Concluído!',
            description: 'Perfil e dados sincronizados.',
          });
        }
      }
    } catch (error: unknown) {
      // Try to extract the error details from the response
      let errorMessage = 'Erro desconhecido';
      
      if (error && typeof error === 'object' && 'context' in error) {
        try {
          const context = (error as any).context;
          if (context?.json) {
            const jsonData = await context.json();
            if (jsonData.isRateLimit) {
              toast({
                title: 'Rate limit atingido',
                description: jsonData.details || 'Aguarde alguns minutos e tente novamente.',
                variant: 'destructive',
              });
              return;
            }
            errorMessage = jsonData.details || jsonData.error || errorMessage;
          }
        } catch {
          errorMessage = error instanceof Error ? error.message : errorMessage;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
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
      const result = await deleteFacebookProfile(deleteProfileId);
      
      const pausedMonitors = result?.paused_monitors || 0;
      const pausedSchedules = result?.paused_schedules || 0;
      
      toast({
        title: 'Perfil desconectado',
        description: pausedMonitors > 0 || pausedSchedules > 0
          ? `${pausedMonitors} monitores e ${pausedSchedules} agendamentos foram pausados. Reconecte o perfil para reativá-los.`
          : 'O perfil foi desconectado com sucesso.',
      });
      await loadProfiles();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro ao desconectar',
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
        proxyProtocol: proxyForm.protocol || 'http',
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
      setProxyForm({ protocol: 'http', host: '', port: '', username: '', password: '' });
      setProxyTestResult(null);
      setProxyTestPassed(false);
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

  const openUpdateTokenModal = (profile: FacebookProfile) => {
    setSelectedProfileId(profile.id);
    setUpdateTokenInput('');
    setIsUpdateTokenOpen(true);
  };

  const handleUpdateToken = async () => {
    if (!selectedProfileId || !updateTokenInput.trim()) return;
    
    setIsUpdatingToken(true);
    try {
      const result = await updateFacebookToken(selectedProfileId, updateTokenInput);
      
      if (result.error) {
        toast({
          title: 'Erro',
          description: result.details || result.error,
          variant: 'destructive',
        });
        return;
      }
      
      setIsUpdateTokenOpen(false);
      setUpdateTokenInput('');
      
      // Check if sync is running in background
      if (result.background) {
        // Show persistent sync toast
        const syncToastId = toast({
          title: (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Sincronizando dados...</span>
            </div>
          ) as unknown as string,
          description: 'Aguarde enquanto sincronizamos suas contas, pixels e páginas.',
          duration: Infinity, // Persistent until dismissed
        });
        
        // Poll for sync completion
        const pollInterval = setInterval(async () => {
          try {
            const profiles = await fetchFacebookProfiles();
            const profile = profiles.find(p => p.id === selectedProfileId);
            
            if (profile) {
              const syncStatus = (profile as any).sync_status;
              
              if (syncStatus === 'completed') {
                clearInterval(pollInterval);
                syncToastId.dismiss();
                
                toast({
                  title: (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-primary" />
                      <span>Sincronização concluída!</span>
                    </div>
                  ) as unknown as string,
                  description: 'Todos os dados foram sincronizados com sucesso.',
                });
                
                setProfiles(profiles);
              } else if (syncStatus === 'error') {
                clearInterval(pollInterval);
                syncToastId.dismiss();
                
                toast({
                  title: 'Erro na sincronização',
                  description: 'Ocorreu um erro durante a sincronização. Tente novamente.',
                  variant: 'destructive',
                });
                
                setProfiles(profiles);
              } else {
                // Still syncing, update profiles list
                setProfiles(profiles);
              }
            }
          } catch (error) {
            console.error('Error polling sync status:', error);
          }
        }, 2000); // Poll every 2 seconds
        
        // Safety timeout - stop polling after 3 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          syncToastId.dismiss();
          loadProfiles();
        }, 180000);
        
      } else {
        toast({
          title: 'Token atualizado!',
          description: result.synced 
            ? `Sincronizado: ${result.synced.accounts} contas, ${result.synced.pixels} pixels, ${result.synced.pages} páginas`
            : 'Dados sincronizados com sucesso.',
        });
        
        await loadProfiles();
      }
    } catch (error: unknown) {
      // Try to extract the error details from the response
      let errorTitle = 'Erro ao atualizar token';
      let errorMessage = 'Erro desconhecido';
      
      if (error && typeof error === 'object' && 'context' in error) {
        try {
          const context = (error as any).context;
          if (context?.json) {
            const jsonData = await context.json();
            if (jsonData.isRateLimit) {
              errorTitle = 'Rate limit atingido';
              errorMessage = jsonData.details || 'Aguarde alguns minutos e tente novamente.';
            } else {
              errorMessage = jsonData.details || jsonData.error || errorMessage;
            }
          }
        } catch {
          // Fallback to error message
          errorMessage = error instanceof Error ? error.message : errorMessage;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingToken(false);
    }
  };

  const openProxyModal = (profile: FacebookProfile) => {
    setSelectedProfileId(profile.id);
    setProxyForm({
      protocol: profile.proxy_protocol || 'http',
      host: profile.proxy_host || '',
      port: profile.proxy_port?.toString() || '',
      username: profile.proxy_username || '',
      password: '',
    });
    setProxyTestResult(null);
    setProxyTestPassed(false);
    setIsProxyOpen(true);
  };

  const handleTestProxy = async () => {
    if (!proxyForm.host || !proxyForm.port) {
      toast({
        title: 'Preencha os campos',
        description: 'Host e Porta são obrigatórios para testar.',
        variant: 'destructive',
      });
      return;
    }

    setIsTestingProxy(true);
    setProxyTestResult(null);
    setProxyTestPassed(false);

    try {
      const result = await testProxyConnection({
        protocol: proxyForm.protocol,
        host: proxyForm.host,
        port: parseInt(proxyForm.port),
        username: proxyForm.username || undefined,
        password: proxyForm.password || undefined,
      });

      setProxyTestResult(result);
      setProxyTestPassed(result.success === true);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setProxyTestResult({
        success: false,
        error: errorMessage,
      });
      setProxyTestPassed(false);
    } finally {
      setIsTestingProxy(false);
    }
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
          <Button className="glow-primary" onClick={() => setIsWizardOpen(true)}>
            <Sparkles className="w-4 h-4 mr-2" />
            Conectar Perfil
            <Badge variant="outline" className="ml-2 text-xs">Recomendado</Badge>
          </Button>

          <Dialog open={isAddTokenOpen} onOpenChange={setIsAddTokenOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Token Manual
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
        </div>
      </div>

      <AddProfileWizard
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        onComplete={loadProfiles}
      />


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
                        <Badge variant="outline" className="text-xs text-ads-success border-ads-success/30">
                          {(profile.proxy_protocol || 'http').toUpperCase()} · Configurado
                        </Badge>
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
                      onClick={() => openUpdateTokenModal(profile)}
                    >
                      <Key className="w-4 h-4 mr-2" />
                      Atualizar Token
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => handleSync(profile.id)}
                      disabled={isSyncing === profile.id}
                    >
                      {isSyncing === profile.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
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
      <Dialog open={isProxyOpen} onOpenChange={(open) => {
        setIsProxyOpen(open);
        if (!open) {
          setProxyTestResult(null);
          setProxyTestPassed(false);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Configurar Proxy
            </DialogTitle>
            <DialogDescription>
              Configure um proxy para rotear as requisições da API do Facebook através de um IP diferente. Isso pode evitar bloqueios ao subir muitos anúncios.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Protocol */}
            <div className="space-y-2">
              <Label htmlFor="proxyProtocol">Protocolo</Label>
              <Select
                value={proxyForm.protocol}
                onValueChange={(value) => {
                  setProxyForm(prev => ({ ...prev, protocol: value }));
                  setProxyTestResult(null);
                  setProxyTestPassed(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o protocolo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="https">HTTPS</SelectItem>
                  <SelectItem value="socks5">SOCKS5</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Host + Port */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="proxyHost">Host / IP</Label>
                <Input
                  id="proxyHost"
                  placeholder="proxy.example.com"
                  value={proxyForm.host}
                  onChange={(e) => {
                    setProxyForm(prev => ({ ...prev, host: e.target.value }));
                    setProxyTestResult(null);
                    setProxyTestPassed(false);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proxyPort">Porta</Label>
                <Input
                  id="proxyPort"
                  type="number"
                  placeholder="8080"
                  value={proxyForm.port}
                  onChange={(e) => {
                    setProxyForm(prev => ({ ...prev, port: e.target.value }));
                    setProxyTestResult(null);
                    setProxyTestPassed(false);
                  }}
                />
              </div>
            </div>

            {/* Username + Password */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="proxyUsername">Usuário (opcional)</Label>
                <Input
                  id="proxyUsername"
                  placeholder="username"
                  value={proxyForm.username}
                  onChange={(e) => {
                    setProxyForm(prev => ({ ...prev, username: e.target.value }));
                    setProxyTestResult(null);
                    setProxyTestPassed(false);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proxyPassword">Senha (opcional)</Label>
                <Input
                  id="proxyPassword"
                  type="password"
                  placeholder="••••••••"
                  value={proxyForm.password}
                  onChange={(e) => {
                    setProxyForm(prev => ({ ...prev, password: e.target.value }));
                    setProxyTestResult(null);
                    setProxyTestPassed(false);
                  }}
                />
              </div>
            </div>

            {/* Test Connection Button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={handleTestProxy}
              disabled={!proxyForm.host || !proxyForm.port || isTestingProxy}
            >
              {isTestingProxy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testando conexão...
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4 mr-2" />
                  Testar Conexão
                </>
              )}
            </Button>

            {/* Test Result */}
            {proxyTestResult && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-lg border ${
                  proxyTestResult.success 
                    ? 'bg-ads-success/10 border-ads-success/30' 
                    : 'bg-destructive/10 border-destructive/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {proxyTestResult.success ? (
                    <CheckCircle className="w-5 h-5 text-ads-success" />
                  ) : (
                    <WifiOff className="w-5 h-5 text-destructive" />
                  )}
                  <span className={`font-medium text-sm ${
                    proxyTestResult.success ? 'text-ads-success' : 'text-destructive'
                  }`}>
                    {proxyTestResult.success 
                      ? 'Proxy está funcionando corretamente' 
                      : 'Falha na conexão com o proxy'}
                  </span>
                </div>
                {proxyTestResult.success && proxyTestResult.externalIp && (
                  <div className="flex items-center gap-2 mt-2 ml-7">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      IP externo: <span className="font-mono font-medium text-foreground">{proxyTestResult.externalIp}</span>
                    </span>
                  </div>
                )}
                {!proxyTestResult.success && proxyTestResult.error && (
                  <p className="text-xs text-destructive/80 mt-1 ml-7">
                    {proxyTestResult.error}
                  </p>
                )}
              </motion.div>
            )}

            {/* Info about clearing proxy */}
            <p className="text-xs text-muted-foreground">
              Para remover o proxy, limpe os campos de Host e Porta e salve.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsProxyOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleUpdateProxy}
              disabled={proxyForm.host && proxyForm.port ? !proxyTestPassed : false}
            >
              Salvar Configuração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Token Modal */}
      <Dialog open={isUpdateTokenOpen} onOpenChange={setIsUpdateTokenOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Atualizar Token de Acesso</DialogTitle>
            <DialogDescription>
              Cole o novo token de acesso para atualizar o perfil. Isso irá sincronizar automaticamente todas as contas, pixels e páginas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="updateToken">Novo Access Token</Label>
              <Textarea
                id="updateToken"
                placeholder="Cole seu novo token de acesso aqui..."
                value={updateTokenInput}
                onChange={(e) => setUpdateTokenInput(e.target.value)}
                className="min-h-[100px] font-mono text-sm"
              />
            </div>
            <div className="p-4 bg-secondary/50 rounded-lg border border-border">
              <h4 className="text-sm font-medium text-foreground mb-2">Permissões recomendadas:</h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">ads_management</Badge>
                <Badge variant="outline" className="text-xs">ads_read</Badge>
                <Badge variant="outline" className="text-xs">pages_read_engagement</Badge>
                <Badge variant="outline" className="text-xs">pages_show_list</Badge>
                <Badge variant="outline" className="text-xs">pages_manage_ads</Badge>
                <Badge variant="outline" className="text-xs">business_management</Badge>
              </div>
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
            <Button variant="outline" onClick={() => setIsUpdateTokenOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateToken} disabled={!updateTokenInput || isUpdatingToken}>
              {isUpdatingToken ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Atualizando...
                </>
              ) : (
                'Atualizar e Sincronizar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteProfileId} onOpenChange={() => setDeleteProfileId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar perfil?</AlertDialogTitle>
            <AlertDialogDescription>
              O perfil será desconectado e o token removido. Monitores e agendamentos de catálogo vinculados serão pausados automaticamente. Ao reconectar o mesmo perfil, eles serão reativados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
