import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, UserPlus, Trash2, Info, Loader2 } from 'lucide-react';
import { useTeamMembers } from '@/hooks/useTeamMembers';

export function TeamSettings() {
  const [email, setEmail] = useState('');
  const { members, isLoading, activeCount, inviteMember, removeMember } = useTeamMembers();

  const handleInvite = async () => {
    if (!email.trim()) return;
    await inviteMember.mutateAsync(email.trim());
    setEmail('');
  };

  const activeMembers = members.filter(m => m.status === 'active');

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Equipe
              </CardTitle>
              <CardDescription>
                Gerencie os colaboradores da sua conta Enterprise
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-sm">
              {activeCount}/3 colaboradores
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Add collaborator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Adicionar Colaborador
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              type="email"
              placeholder="email@colaborador.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              disabled={activeCount >= 3 || inviteMember.isPending}
            />
            <Button
              onClick={handleInvite}
              disabled={!email.trim() || activeCount >= 3 || inviteMember.isPending}
            >
              {inviteMember.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Adicionar'
              )}
            </Button>
          </div>

          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription>
              O colaborador receberá acesso com a senha padrão <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">adstormenterprise</code>. 
              Ele pode alterar a senha nas configurações após o primeiro login.
            </AlertDescription>
          </Alert>

          {activeCount >= 3 && (
            <Alert variant="destructive">
              <AlertDescription>
                Limite de 3 colaboradores atingido. Remova um colaborador para adicionar outro.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Members list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Colaboradores Ativos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>Nenhum colaborador adicionado ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                      {member.full_name?.[0]?.toUpperCase() || member.email[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{member.full_name || member.email.split('@')[0]}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Desde {new Date(member.invited_at || member.created_at).toLocaleDateString('pt-BR')}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeMember.mutate(member.id)}
                      disabled={removeMember.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
