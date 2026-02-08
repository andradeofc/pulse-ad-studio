import { useState } from 'react';
import { Bell, Mail, Smartphone, Megaphone, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface NotificationSetting {
  id: string;
  title: string;
  description: string;
  email: boolean;
  push: boolean;
}

const defaultSettings: NotificationSetting[] = [
  {
    id: 'campaign_complete',
    title: 'Campanhas Concluídas',
    description: 'Receba uma notificação quando uma campanha for criada com sucesso',
    email: true,
    push: true,
  },
  {
    id: 'campaign_error',
    title: 'Erros em Campanhas',
    description: 'Seja notificado quando ocorrer um erro na criação de campanhas',
    email: true,
    push: true,
  },
  {
    id: 'token_expiring',
    title: 'Token Expirando',
    description: 'Alerta quando um token do Facebook está próximo de expirar',
    email: true,
    push: true,
  },
  {
    id: 'account_blocked',
    title: 'Conta Bloqueada',
    description: 'Notificação quando uma conta de anúncio for bloqueada',
    email: true,
    push: true,
  },
  {
    id: 'catalog_update',
    title: 'Atualização de Catálogo',
    description: 'Quando um agendamento de catálogo for processado',
    email: false,
    push: true,
  },
  {
    id: 'weekly_report',
    title: 'Relatório Semanal',
    description: 'Resumo semanal das suas campanhas e métricas',
    email: true,
    push: false,
  },
];

export function NotificationSettings() {
  const [settings, setSettings] = useState<NotificationSetting[]>(defaultSettings);
  const [isSaving, setIsSaving] = useState(false);

  const toggleSetting = (id: string, type: 'email' | 'push') => {
    setSettings(prev => 
      prev.map(setting => 
        setting.id === id 
          ? { ...setting, [type]: !setting[type] }
          : setting
      )
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast.success('Preferências de notificação salvas!');
  };

  const enableAll = () => {
    setSettings(prev => 
      prev.map(setting => ({ ...setting, email: true, push: true }))
    );
  };

  const disableAll = () => {
    setSettings(prev => 
      prev.map(setting => ({ ...setting, email: false, push: false }))
    );
  };

  return (
    <div className="space-y-6">
      {/* Overview */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Preferências de Notificação
          </CardTitle>
          <CardDescription>
            Escolha como e quando deseja receber notificações
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={enableAll}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Ativar Todas
            </Button>
            <Button variant="outline" size="sm" onClick={disableAll}>
              Desativar Todas
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Types */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Tipos de Notificação</CardTitle>
              <CardDescription>Configure cada tipo de notificação individualmente</CardDescription>
            </div>
            <div className="flex items-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span>Email</span>
              </div>
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                <span>Push</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {settings.map((setting, index) => (
            <div key={setting.id}>
              <div className="flex items-center justify-between py-4">
                <div className="flex-1">
                  <Label htmlFor={setting.id} className="text-sm font-medium text-foreground">
                    {setting.title}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {setting.description}
                  </p>
                </div>
                <div className="flex items-center gap-8">
                  <Switch
                    id={`${setting.id}-email`}
                    checked={setting.email}
                    onCheckedChange={() => toggleSetting(setting.id, 'email')}
                  />
                  <Switch
                    id={`${setting.id}-push`}
                    checked={setting.push}
                    onCheckedChange={() => toggleSetting(setting.id, 'push')}
                  />
                </div>
              </div>
              {index < settings.length - 1 && <Separator />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Email Preferences */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Preferências de Email
          </CardTitle>
          <CardDescription>
            Configure suas preferências de comunicação por email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-foreground">
                Newsletter
              </Label>
              <p className="text-xs text-muted-foreground">
                Receba novidades, dicas e atualizações da plataforma
              </p>
            </div>
            <Switch />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-foreground">
                Dicas e Tutoriais
              </Label>
              <p className="text-xs text-muted-foreground">
                Emails com dicas para melhorar suas campanhas
              </p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-foreground">
                Ofertas e Promoções
              </Label>
              <p className="text-xs text-muted-foreground">
                Ofertas especiais e descontos exclusivos
              </p>
            </div>
            <Switch />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Salvando...' : 'Salvar Preferências'}
        </Button>
      </div>
    </div>
  );
}
