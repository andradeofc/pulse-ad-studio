import { useQuery } from '@tanstack/react-query';
import {
  Settings,
  Save,
  AlertTriangle,
  Power,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface PlatformSetting {
  id: string;
  key_name: string;
  value_text: string | null;
  value_json: any;
  updated_at: string;
}

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [platformName, setPlatformName] = useState('');

  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*');

      if (error) throw error;

      // Parse settings into a map
      const settingsMap: Record<string, PlatformSetting> = {};
      data?.forEach(setting => {
        settingsMap[setting.key_name] = setting;
      });

      // Initialize state
      setMaintenanceMode(settingsMap['maintenance_mode']?.value_text === 'true');
      setMaintenanceMessage(settingsMap['maintenance_message']?.value_text || '');
      setPlatformName(settingsMap['platform_name']?.value_text || '');

      return settingsMap;
    },
  });

  const planLimits = settings?.['plan_limits']?.value_json || {};

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Update settings
      await Promise.all([
        supabase.from('platform_settings').update({ value_text: platformName }).eq('key_name', 'platform_name'),
        supabase.from('platform_settings').update({ value_text: maintenanceMode.toString() }).eq('key_name', 'maintenance_mode'),
        supabase.from('platform_settings').update({ value_text: maintenanceMessage }).eq('key_name', 'maintenance_message'),
      ]);

      // Log admin action
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('admin_audit_logs').insert({
        admin_user_id: user?.id,
        action: 'update_settings',
        target_type: 'platform',
        target_id: 'global',
        details: { platformName, maintenanceMode, maintenanceMessage },
        ip_address: 'unknown',
      });

      toast({ title: 'Configurações salvas com sucesso' });
      refetch();
    } catch (error) {
      toast({ title: 'Erro ao salvar', description: String(error), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Settings className="w-6 h-6" />
              Configurações Globais
            </h1>
            <p className="text-muted-foreground">
              Configurações gerais da plataforma
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-red-600 hover:bg-red-700"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar Alterações
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Platform Settings */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Plataforma</CardTitle>
              <CardDescription>Configurações gerais do sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nome da Plataforma</Label>
                <Input
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  placeholder="AdsPulse"
                />
              </div>

              <Separator />

              {/* Maintenance Mode */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">Modo de Manutenção</Label>
                    <p className="text-sm text-muted-foreground">
                      Quando ativado, usuários veem página de manutenção
                    </p>
                  </div>
                  <Switch
                    checked={maintenanceMode}
                    onCheckedChange={setMaintenanceMode}
                  />
                </div>

                {maintenanceMode && (
                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <div className="flex items-center gap-2 text-yellow-500 mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">Modo de manutenção ativo</span>
                    </div>
                    <Textarea
                      value={maintenanceMessage}
                      onChange={(e) => setMaintenanceMessage(e.target.value)}
                      placeholder="Mensagem para os usuários..."
                      rows={3}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Facebook API Settings */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Facebook API</CardTitle>
              <CardDescription>Configurações da integração com Facebook</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Versão da Graph API</Label>
                <Input
                  value={settings?.['facebook_api_version']?.value_text || 'v21.0'}
                  disabled
                  className="font-mono"
                />
              </div>
              <div>
                <Label>Delay entre chamadas (ms)</Label>
                <Input
                  value={settings?.['rate_limit_delay_ms']?.value_text || '100'}
                  disabled
                  className="font-mono"
                />
              </div>
              <div>
                <Label>Máximo de retries</Label>
                <Input
                  value={settings?.['max_retries']?.value_text || '3'}
                  disabled
                  className="font-mono"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Plan Limits */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Limites por Plano</CardTitle>
            <CardDescription>
              Configurações de limites para cada tier de assinatura
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-center">Max Contas FB</TableHead>
                  <TableHead className="text-center">Max Contas Ads</TableHead>
                  <TableHead className="text-center">Campanhas/Mês</TableHead>
                  <TableHead className="text-center">Max Criativos</TableHead>
                  <TableHead className="text-center">Jobs Simultâneos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {['starter', 'pro', 'enterprise'].map((plan) => {
                  const limits = planLimits[plan] || {};
                  return (
                    <TableRow key={plan}>
                      <TableCell>
                        <Badge variant="outline" className={
                          plan === 'starter' ? 'bg-zinc-500/10 text-zinc-400' :
                          plan === 'pro' ? 'bg-blue-500/10 text-blue-400' :
                          'bg-purple-500/10 text-purple-400'
                        }>
                          {plan.charAt(0).toUpperCase() + plan.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {limits.max_fb_accounts === -1 ? '∞' : limits.max_fb_accounts || 0}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {limits.max_ad_accounts === -1 ? '∞' : limits.max_ad_accounts || 0}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {limits.max_campaigns_month === -1 ? '∞' : limits.max_campaigns_month || 0}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {limits.max_creatives === -1 ? '∞' : limits.max_creatives || 0}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {limits.max_concurrent_jobs || 0}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
