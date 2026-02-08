import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Lock, Shield, Smartphone, History, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual é obrigatória'),
  newPassword: z.string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
    .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
    .regex(/[0-9]/, 'Senha deve conter pelo menos um número'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Senhas não conferem',
  path: ['confirmPassword'],
});

type PasswordFormData = z.infer<typeof passwordSchema>;

export function SecuritySettings() {
  const { supabaseUser, logout } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: PasswordFormData) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: data.newPassword,
      });

      if (error) throw error;
      
      toast.success('Senha alterada com sucesso!');
      form.reset();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao alterar senha');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoutAllDevices = async () => {
    try {
      await supabase.auth.signOut({ scope: 'global' });
      toast.success('Desconectado de todos os dispositivos');
      logout();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao desconectar');
    }
  };

  const lastSignIn = supabaseUser?.last_sign_in_at 
    ? formatDistanceToNow(new Date(supabaseUser.last_sign_in_at), { addSuffix: true, locale: ptBR })
    : 'Desconhecido';

  return (
    <div className="space-y-6">
      {/* Change Password */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Alterar Senha
          </CardTitle>
          <CardDescription>
            Mantenha sua conta segura atualizando sua senha regularmente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha Atual</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nova Senha</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar Nova Senha</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'Ocultar senhas' : 'Mostrar senhas'}
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Alterar Senha
                </Button>
              </div>
            </form>
          </Form>

          <div className="mt-4 p-4 bg-secondary/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Requisitos da senha:</strong>
            </p>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1">
              <li>• Mínimo 8 caracteres</li>
              <li>• Pelo menos uma letra maiúscula</li>
              <li>• Pelo menos uma letra minúscula</li>
              <li>• Pelo menos um número</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Session Info */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Sessão Atual
          </CardTitle>
          <CardDescription>
            Informações sobre sua sessão ativa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-ads-success/10 rounded-full flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-ads-success" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Dispositivo Atual</p>
                <p className="text-xs text-muted-foreground">
                  Último acesso: {lastSignIn}
                </p>
              </div>
            </div>
            <Badge className="badge-active">Ativo</Badge>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Sair de todos os dispositivos</p>
              <p className="text-xs text-muted-foreground">
                Isso irá desconectar você de todos os outros navegadores e dispositivos
              </p>
            </div>
            <Button variant="outline" onClick={handleLogoutAllDevices}>
              Sair de Todos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Security Tips */}
      <Card className="glass-card border-ads-warning/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-ads-warning">
            <Shield className="w-5 h-5" />
            Dicas de Segurança
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-ads-warning">•</span>
              Nunca compartilhe sua senha com outras pessoas
            </li>
            <li className="flex items-start gap-2">
              <span className="text-ads-warning">•</span>
              Use senhas diferentes para cada serviço
            </li>
            <li className="flex items-start gap-2">
              <span className="text-ads-warning">•</span>
              Mantenha seus tokens do Facebook sempre atualizados
            </li>
            <li className="flex items-start gap-2">
              <span className="text-ads-warning">•</span>
              Verifique regularmente os acessos à sua conta
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="glass-card border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Zona de Perigo
          </CardTitle>
          <CardDescription>
            Ações irreversíveis para sua conta
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              A exclusão da conta é permanente e não pode ser desfeita. Todos os seus dados,
              perfis do Facebook, campanhas e configurações serão removidos.
            </AlertDescription>
          </Alert>
          <div className="mt-4">
            <Button variant="destructive" disabled>
              Excluir Conta (Em breve)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
