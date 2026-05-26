import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { WizardStepper } from '@/components/campaign/WizardStepper';
import {
  Loader2,
  ChevronRight,
  Shield,
  Wifi,
  WifiOff,
  Globe,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ExternalLink,
  Sparkles,
  Clock,
  Building2,
  Image as ImageIcon,
  Layers,
  Target,
  UserCheck,
  Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { testProxyConnection } from '@/services/facebookService';
import {
  validateFacebookCredentials,
  exchangeFacebookToken,
  createProfileTask,
  addFacebookProfileWithTask,
  type ValidateCredentialsResult,
  type ProfileTask,
} from '@/services/facebookCredentialsService';

interface AddProfileWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

type ProxyForm = {
  enabled: boolean;
  protocol: string;
  host: string;
  port: string;
  username: string;
  password: string;
};

type CredentialsForm = {
  authMethod: 'facebook_app' | 'token_only';
  appId: string;
  appSecret: string;
  accessToken: string;
};

const STEP_LABELS: Record<string, { label: string; icon: any }> = {
  validatingToken: { label: 'Validando token', icon: KeyRound },
  verifyingAccount: { label: 'Verificando conta', icon: UserCheck },
  configuringToken: { label: 'Configurando token (60 dias)', icon: ShieldCheck },
  creatingAccount: { label: 'Salvando perfil', icon: Save },
  fetchingAdAccounts: { label: 'Buscando contas de anúncio', icon: Layers },
  savingAccounts: { label: 'Salvando contas e Business Managers', icon: Building2 },
  syncingPages: { label: 'Sincronizando páginas', icon: ImageIcon },
  syncingPixels: { label: 'Sincronizando pixels', icon: Target },
};

const STEP_KEYS_ORDER = [
  'validatingToken',
  'verifyingAccount',
  'configuringToken',
  'creatingAccount',
  'fetchingAdAccounts',
  'savingAccounts',
  'syncingPages',
  'syncingPixels',
];

export function AddProfileWizard({ open, onOpenChange, onComplete }: AddProfileWizardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthStore();

  const [currentStep, setCurrentStep] = useState(1);

  // Proxy
  const [proxy, setProxy] = useState<ProxyForm>({
    enabled: false,
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
  const proxyOk = !proxy.enabled || (proxyTestResult?.success === true);

  // Credentials
  const [creds, setCreds] = useState<CredentialsForm>({
    authMethod: 'facebook_app',
    appId: '',
    appSecret: '',
    accessToken: '',
  });
  const [isValidating, setIsValidating] = useState(false);
  const [validation, setValidation] = useState<ValidateCredentialsResult | null>(null);

  // Sync
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<ProfileTask | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const realtimeRef = useRef<any>(null);
  const pollRef = useRef<any>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      // small delay to allow exit animations
      const t = setTimeout(() => {
        setCurrentStep(1);
        setProxy({ enabled: false, protocol: 'http', host: '', port: '', username: '', password: '' });
        setProxyTestResult(null);
        setCreds({ authMethod: 'facebook_app', appId: '', appSecret: '', accessToken: '' });
        setValidation(null);
        setTaskId(null);
        setTask(null);
        setIsStarting(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Realtime subscription on task
  useEffect(() => {
    if (!taskId) return;

    const channel = supabase
      .channel(`fb_profile_task_${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'facebook_profile_tasks',
          filter: `id=eq.${taskId}`,
        },
        (payload) => {
          setTask(payload.new as unknown as ProfileTask);
        }
      )
      .subscribe();
    realtimeRef.current = channel;

    // Fallback polling every 3s in case realtime hiccups
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('facebook_profile_tasks' as any)
        .select('*')
        .eq('id', taskId)
        .maybeSingle();
      if (data) setTask(data as unknown as ProfileTask);
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [taskId]);

  // Auto-finalize wizard when task completes
  useEffect(() => {
    if (task?.status === 'completed') {
      toast({
        title: 'Perfil conectado com sucesso!',
        description: 'Todas as contas, páginas e pixels foram sincronizados.',
      });
      onComplete?.();
      // Keep dialog open so user can see the green check; auto-close after 2s
      const t = setTimeout(() => onOpenChange(false), 2500);
      return () => clearTimeout(t);
    }
    if (task?.status === 'failed') {
      toast({
        title: 'Falha na conexão',
        description: task.error || 'Ocorreu um erro durante o processo.',
        variant: 'destructive',
      });
    }
  }, [task?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ───────────────────────────────────────────── Handlers

  const handleTestProxy = async () => {
    if (!proxy.host || !proxy.port) {
      toast({
        title: 'Preencha host e porta',
        variant: 'destructive',
      });
      return;
    }
    setIsTestingProxy(true);
    setProxyTestResult(null);
    try {
      const result = await testProxyConnection({
        protocol: proxy.protocol,
        host: proxy.host,
        port: parseInt(proxy.port),
        username: proxy.username || undefined,
        password: proxy.password || undefined,
      });
      setProxyTestResult(result);
    } catch (e: any) {
      setProxyTestResult({ success: false, error: e?.message || 'Erro' });
    } finally {
      setIsTestingProxy(false);
    }
  };

  const handleValidateCredentials = async () => {
    if (!creds.accessToken.trim()) {
      toast({ title: 'Token é obrigatório', variant: 'destructive' });
      return;
    }
    if (creds.authMethod === 'facebook_app' && (!creds.appId.trim() || !creds.appSecret.trim())) {
      toast({ title: 'App ID e App Secret são obrigatórios', variant: 'destructive' });
      return;
    }

    setIsValidating(true);
    setValidation(null);
    try {
      const result = await validateFacebookCredentials({
        accessToken: creds.accessToken.trim(),
        appId: creds.authMethod === 'facebook_app' ? creds.appId.trim() : undefined,
        appSecret: creds.authMethod === 'facebook_app' ? creds.appSecret.trim() : undefined,
      });
      setValidation(result);

      if (!result.valid) {
        toast({
          title: 'Credenciais inválidas',
          description: result.error || 'Verifique o token e tente novamente.',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Erro ao validar',
        description: e?.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleStartSync = async () => {
    if (!user?.id || !validation?.valid) return;

    setIsStarting(true);
    try {
      // 1. Create task row for Realtime tracking
      const newTaskId = await createProfileTask(user.id);
      setTaskId(newTaskId);
      setCurrentStep(3);

      // 2. Optional: exchange to long-lived token first (when app credentials provided)
      let finalToken = creds.accessToken.trim();
      let isLongLived = false;

      if (creds.authMethod === 'facebook_app' && validation.isShortLived !== false) {
        const ex = await exchangeFacebookToken({
          appId: creds.appId.trim(),
          appSecret: creds.appSecret.trim(),
          shortToken: finalToken,
        });
        if (ex.success && ex.accessToken) {
          finalToken = ex.accessToken;
          isLongLived = true;
        } else {
          console.warn('Token exchange failed, continuing with short-lived:', ex.error);
        }
      } else if (!validation.isShortLived) {
        isLongLived = true;
      }

      // 3. Fire the orchestrator (it will update facebook_profile_tasks in background)
      await addFacebookProfileWithTask({
        accessToken: finalToken,
        taskId: newTaskId,
        appId: creds.authMethod === 'facebook_app' ? creds.appId.trim() : null,
        appSecret: creds.authMethod === 'facebook_app' ? creds.appSecret.trim() : null,
        isLongLived,
        proxyConfig:
          proxy.enabled && proxy.host && proxy.port
            ? {
                protocol: proxy.protocol,
                host: proxy.host,
                port: parseInt(proxy.port),
                username: proxy.username || undefined,
                password: proxy.password || undefined,
              }
            : null,
      });
    } catch (e: any) {
      toast({
        title: 'Falha ao iniciar',
        description: e?.message || 'Erro ao conectar perfil',
        variant: 'destructive',
      });
      setIsStarting(false);
    }
  };

  // ───────────────────────────────────────────── Render helpers

  const stepStatusFor = (key: string): 'done' | 'active' | 'pending' => {
    if (!task) return 'pending';
    const idx = STEP_KEYS_ORDER.indexOf(key);
    const currentIdx = task.current_step_key
      ? STEP_KEYS_ORDER.indexOf(task.current_step_key)
      : task.current_step - 1;
    if (task.status === 'completed') return 'done';
    if (idx < currentIdx) return 'done';
    if (idx === currentIdx) return 'active';
    return 'pending';
  };

  const renderProxyStep = () => (
    <div className="space-y-4">
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>Proxy é opcional</AlertTitle>
        <AlertDescription>
          Recomendado para contas com alto volume. Mascara o IP do servidor e reduz bloqueios da
          Meta. Você pode pular esta etapa.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Configurar proxy</p>
          <p className="text-xs text-muted-foreground">Rotear chamadas à Graph API por um IP dedicado</p>
        </div>
        <Button
          variant={proxy.enabled ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setProxy((p) => ({ ...p, enabled: !p.enabled }));
            setProxyTestResult(null);
          }}
        >
          {proxy.enabled ? 'Ativado' : 'Desativado'}
        </Button>
      </div>

      {proxy.enabled && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-4 overflow-hidden"
        >
          <div className="space-y-2">
            <Label>Protocolo</Label>
            <Select
              value={proxy.protocol}
              onValueChange={(v) => {
                setProxy((p) => ({ ...p, protocol: v }));
                setProxyTestResult(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="https">HTTPS</SelectItem>
                <SelectItem value="socks5">SOCKS5</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label>Host / IP</Label>
              <Input
                placeholder="proxy.exemplo.com"
                value={proxy.host}
                onChange={(e) => {
                  setProxy((p) => ({ ...p, host: e.target.value }));
                  setProxyTestResult(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Porta</Label>
              <Input
                type="number"
                placeholder="8080"
                value={proxy.port}
                onChange={(e) => {
                  setProxy((p) => ({ ...p, port: e.target.value }));
                  setProxyTestResult(null);
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Usuário (opcional)</Label>
              <Input
                value={proxy.username}
                onChange={(e) => {
                  setProxy((p) => ({ ...p, username: e.target.value }));
                  setProxyTestResult(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Senha (opcional)</Label>
              <Input
                type="password"
                value={proxy.password}
                onChange={(e) => {
                  setProxy((p) => ({ ...p, password: e.target.value }));
                  setProxyTestResult(null);
                }}
              />
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={handleTestProxy}
            disabled={isTestingProxy || !proxy.host || !proxy.port}
          >
            {isTestingProxy ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testando conexão...
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4 mr-2" />
                Testar conexão
              </>
            )}
          </Button>

          {proxyTestResult && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'rounded-lg border p-3',
                proxyTestResult.success
                  ? 'border-ads-success/30 bg-ads-success/10'
                  : 'border-destructive/30 bg-destructive/10'
              )}
            >
              <div className="flex items-center gap-2">
                {proxyTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-ads-success" />
                ) : (
                  <WifiOff className="w-4 h-4 text-destructive" />
                )}
                <span
                  className={cn(
                    'text-sm font-medium',
                    proxyTestResult.success ? 'text-ads-success' : 'text-destructive'
                  )}
                >
                  {proxyTestResult.success ? 'Proxy funcionando' : 'Falha na conexão'}
                </span>
              </div>
              {proxyTestResult.success && proxyTestResult.externalIp && (
                <div className="mt-2 ml-6 flex items-center gap-2 text-xs text-muted-foreground">
                  <Globe className="w-3 h-3" />
                  IP externo:{' '}
                  <span className="font-mono font-medium text-foreground">
                    {proxyTestResult.externalIp}
                  </span>
                </div>
              )}
              {!proxyTestResult.success && (
                <p className="mt-1 ml-6 text-xs text-destructive/80">
                  {proxyTestResult.error || proxyTestResult.message}
                </p>
              )}
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );

  const renderCredentialsStep = () => (
    <div className="space-y-4">
      <Tabs
        value={creds.authMethod}
        onValueChange={(v) => {
          setCreds((c) => ({ ...c, authMethod: v as any }));
          setValidation(null);
        }}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="facebook_app">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Facebook App
          </TabsTrigger>
          <TabsTrigger value="token_only">
            Token Only
            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">BETA</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="facebook_app" className="space-y-4 mt-4">
          <Alert className="border-primary/30 bg-primary/5">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <AlertTitle>Recomendado — Token de 60 dias</AlertTitle>
            <AlertDescription className="text-xs">
              Com App ID e App Secret, convertemos seu token de horas para 60 dias automaticamente
              e renovamos antes de expirar.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="appId">App ID</Label>
              <Input
                id="appId"
                placeholder="1234567890"
                value={creds.appId}
                onChange={(e) => {
                  setCreds((c) => ({ ...c, appId: e.target.value }));
                  setValidation(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appSecret">App Secret</Label>
              <Input
                id="appSecret"
                type="password"
                placeholder="••••••••"
                value={creds.appSecret}
                onChange={(e) => {
                  setCreds((c) => ({ ...c, appSecret: e.target.value }));
                  setValidation(null);
                }}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="token_only" className="space-y-4 mt-4">
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Token curto (1-2 horas)</AlertTitle>
            <AlertDescription className="text-xs">
              Sem App ID/Secret o token expira em poucas horas e você precisará atualizar
              manualmente. Recomendamos a aba "Facebook App".
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>

      <div className="space-y-2">
        <Label htmlFor="accessToken">Access Token</Label>
        <Textarea
          id="accessToken"
          placeholder="Cole o token gerado no Graph API Explorer..."
          value={creds.accessToken}
          onChange={(e) => {
            setCreds((c) => ({ ...c, accessToken: e.target.value }));
            setValidation(null);
          }}
          className="min-h-[90px] font-mono text-xs"
        />
        <Button variant="link" size="sm" className="h-auto px-0 text-xs" asChild>
          <a
            href="https://developers.facebook.com/tools/explorer/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir Graph API Explorer <ExternalLink className="w-3 h-3 ml-1" />
          </a>
        </Button>
      </div>

      <Button
        onClick={handleValidateCredentials}
        disabled={isValidating || !creds.accessToken}
        className="w-full"
        variant="outline"
      >
        {isValidating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Validando credenciais...
          </>
        ) : (
          <>
            <ShieldCheck className="w-4 h-4 mr-2" />
            Validar credenciais
          </>
        )}
      </Button>

      {validation && validation.valid && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-ads-success/30 bg-ads-success/10 p-4 space-y-2"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-ads-success" />
            <span className="font-medium text-sm text-ads-success">
              Token válido — {validation.userName}
            </span>
          </div>
          <div className="ml-7 grid grid-cols-2 gap-2 text-xs">
            <div className="text-muted-foreground">
              ID:{' '}
              <span className="font-mono text-foreground">{validation.userId}</span>
            </div>
            {validation.appName && (
              <div className="text-muted-foreground">
                App: <span className="text-foreground">{validation.appName}</span>
              </div>
            )}
            <div className="text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {validation.isShortLived ? (
                <span className="text-amber-500">Curta duração</span>
              ) : (
                <span className="text-ads-success">Longa duração (60d)</span>
              )}
            </div>
            <div className="text-muted-foreground">
              Permissões:{' '}
              <span className="text-foreground">{validation.scopes?.length || 0}</span>
            </div>
          </div>
          {validation.appIdMatches === false && (
            <p className="ml-7 text-xs text-amber-500">
              ⚠️ App ID informado não bate com o app do token.
            </p>
          )}
        </motion.div>
      )}
    </div>
  );

  const renderSyncStep = () => (
    <div className="space-y-3">
      {STEP_KEYS_ORDER.map((key) => {
        const meta = STEP_LABELS[key];
        const status = stepStatusFor(key);
        const Icon = meta.icon;
        const lastEvent = task?.progress?.slice().reverse().find((p) => p.key === key);
        return (
          <motion.div
            key={key}
            layout
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3 transition-colors',
              status === 'done' && 'border-ads-success/30 bg-ads-success/5',
              status === 'active' && 'border-primary/40 bg-primary/5',
              status === 'pending' && 'border-border bg-secondary/20'
            )}
          >
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                status === 'done' && 'bg-ads-success text-white',
                status === 'active' && 'bg-primary text-primary-foreground',
                status === 'pending' && 'bg-muted text-muted-foreground'
              )}
            >
              {status === 'done' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : status === 'active' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Icon className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  'text-sm font-medium',
                  status === 'pending' ? 'text-muted-foreground' : 'text-foreground'
                )}
              >
                {meta.label}
              </p>
              {lastEvent && (
                <p className="text-xs text-muted-foreground truncate">{lastEvent.message}</p>
              )}
            </div>
          </motion.div>
        );
      })}

      {task?.status === 'failed' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Falha</AlertTitle>
          <AlertDescription>{task.error || 'Erro desconhecido'}</AlertDescription>
        </Alert>
      )}

      {task?.status === 'completed' && (
        <Alert className="border-ads-success/30 bg-ads-success/10">
          <CheckCircle2 className="h-4 w-4 text-ads-success" />
          <AlertTitle>Conexão concluída</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Contas, BMs e pixels foram sincronizados com sucesso. As <strong>páginas</strong> não
              são sincronizadas automaticamente — use a extensão do navegador ou clique em
              <em> Sincronizar páginas</em> na tela de Páginas quando precisar.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onComplete?.();
                navigate('/paginas');
              }}
            >
              Ir para Páginas
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

  // ───────────────────────────────────────────── Footer

  const canAdvance =
    currentStep === 1
      ? proxyOk
      : currentStep === 2
      ? validation?.valid === true
      : false;

  const handleNext = () => {
    if (currentStep === 1) setCurrentStep(2);
    else if (currentStep === 2) handleStartSync();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Conectar Perfil do Facebook
          </DialogTitle>
          <DialogDescription>
            Configure proxy (opcional), valide credenciais e acompanhe a sincronização. Você pode fechar a aba — o processo continua em segundo plano.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <WizardStepper
            currentStep={currentStep}
            steps={[
              { number: 1, title: 'Proxy' },
              { number: 2, title: 'Credenciais' },
              { number: 3, title: 'Sincronização' },
            ]}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="min-h-[300px]"
          >
            {currentStep === 1 && renderProxyStep()}
            {currentStep === 2 && renderCredentialsStep()}
            {currentStep === 3 && renderSyncStep()}
          </motion.div>
        </AnimatePresence>

        <DialogFooter className="gap-2 sm:gap-2">
          {currentStep > 1 && currentStep < 3 && (
            <Button variant="outline" onClick={() => setCurrentStep((s) => s - 1)}>
              Voltar
            </Button>
          )}
          {currentStep < 3 && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleNext}
                disabled={!canAdvance || isStarting}
                className="glow-primary"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Iniciando...
                  </>
                ) : currentStep === 2 ? (
                  <>
                    Conectar perfil
                    <Sparkles className="w-4 h-4 ml-2" />
                  </>
                ) : (
                  'Avançar'
                )}
              </Button>
            </>
          )}
          {currentStep === 3 && (task?.status === 'pending' || task?.status === 'running') && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onComplete?.();
              }}
            >
              Fechar e continuar em segundo plano
            </Button>
          )}
          {currentStep === 3 && task?.status === 'completed' && (
            <Button
              onClick={() => {
                onOpenChange(false);
                onComplete?.();
              }}
              className="glow-primary"
            >
              Concluir
            </Button>
          )}
          {currentStep === 3 && task?.status === 'failed' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
