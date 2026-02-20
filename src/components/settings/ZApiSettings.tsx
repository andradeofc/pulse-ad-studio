import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, Plus, Trash2, Loader2, Phone, Users, TestTube, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface Recipient {
  type: 'phone' | 'group';
  value: string;
  name: string;
}

export function ZApiSettings() {
  const queryClient = useQueryClient();
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [clientToken, setClientToken] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [newRecipientType, setNewRecipientType] = useState<'phone' | 'group'>('phone');
  const [newRecipientValue, setNewRecipientValue] = useState('');
  const [newRecipientName, setNewRecipientName] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['zapi-settings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_zapi_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setInstanceId(settings.instance_id || '');
      setToken(settings.token || '');
      setClientToken(settings.client_token || '');
      setIsEnabled(settings.is_enabled || false);
      setRecipients((settings.recipients as unknown as Recipient[]) || []);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const payload: Record<string, unknown> = {
        user_id: user.id,
        instance_id: instanceId,
        token,
        client_token: clientToken,
        is_enabled: isEnabled,
        recipients: JSON.parse(JSON.stringify(recipients)),
      };

      if (settings?.id) {
        const { error } = await supabase
          .from('user_zapi_settings')
          .update(payload)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_zapi_settings')
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zapi-settings'] });
      toast.success('Configurações da Z-API salvas!');
    },
    onError: (err: Error) => {
      toast.error('Erro ao salvar: ' + err.message);
    },
  });

  const addRecipient = () => {
    if (!newRecipientValue.trim()) return;
    setRecipients(prev => [
      ...prev,
      { type: newRecipientType, value: newRecipientValue.trim(), name: newRecipientName.trim() || newRecipientValue.trim() },
    ]);
    setNewRecipientValue('');
    setNewRecipientName('');
  };

  const removeRecipient = (index: number) => {
    setRecipients(prev => prev.filter((_, i) => i !== index));
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      // Save first
      await saveMutation.mutateAsync();

      const { data, error } = await supabase.functions.invoke('zapi-webhook-proxy', {
        body: {
          user_id: user.id,
          event: 'test',
          catalog: 'Teste',
          product_set: 'Conjunto de Teste',
          products: [{ retailer_id: 'TEST-001', name: 'Produto de Teste' }],
          total_affected: 1,
          auto_repair: false,
          repaired: false,
          timestamp: new Date().toISOString(),
        },
      });

      if (error) throw error;
      toast.success('Mensagem de teste enviada! Verifique seu WhatsApp.');
    } catch (err) {
      toast.error('Erro no teste: ' + (err instanceof Error ? err.message : 'Erro desconhecido'));
    } finally {
      setIsTesting(false);
    }
  };

  const hasCredentials = instanceId && token && clientToken;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Credentials */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Integração Z-API (WhatsApp)
          </CardTitle>
          <CardDescription>
            Configure sua instância Z-API para receber alertas do monitor de catálogo diretamente no WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Ativar integração</Label>
              <p className="text-xs text-muted-foreground">Habilita o envio de mensagens via Z-API</p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Instance ID</Label>
              <Input
                placeholder="Seu instance ID"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Token</Label>
              <Input
                type="password"
                placeholder="Seu token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Client Token</Label>
              <Input
                type="password"
                placeholder="Seu client token"
                value={clientToken}
                onChange={(e) => setClientToken(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Encontre essas credenciais no painel da Z-API em Instâncias → Sua Instância → Token.
          </p>
        </CardContent>
      </Card>

      {/* Recipients */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Destinatários</CardTitle>
          <CardDescription>
            Números de telefone e grupos que receberão os alertas. Para grupos, use o ID do grupo (ex: 5511999999999-1234567890@g.us).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing recipients */}
          {recipients.length > 0 && (
            <div className="space-y-2">
              {recipients.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-secondary/30">
                  <div className="flex items-center gap-3">
                    {r.type === 'phone' ? (
                      <Phone className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Users className="w-4 h-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.value}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {r.type === 'phone' ? 'Telefone' : 'Grupo'}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeRecipient(i)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add new recipient */}
          <div className="flex gap-2 items-end">
            <div className="w-32">
              <Label className="text-xs">Tipo</Label>
              <Select value={newRecipientType} onValueChange={(v) => setNewRecipientType(v as 'phone' | 'group')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Telefone</SelectItem>
                  <SelectItem value="group">Grupo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs">Número / ID do Grupo</Label>
              <Input
                placeholder={newRecipientType === 'phone' ? '5511999999999' : '5511999999999-1234567890@g.us'}
                value={newRecipientValue}
                onChange={(e) => setNewRecipientValue(e.target.value)}
              />
            </div>
            <div className="w-40">
              <Label className="text-xs">Nome (opcional)</Label>
              <Input
                placeholder="Apelido"
                value={newRecipientName}
                onChange={(e) => setNewRecipientName(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon" onClick={addRecipient} disabled={!newRecipientValue.trim()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={!hasCredentials || recipients.length === 0 || isTesting}
          className="gap-2"
        >
          {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
          Enviar Teste
        </Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
