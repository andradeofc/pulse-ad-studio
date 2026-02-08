import { CreditCard, Check, Zap, Crown, Building2, ArrowUpRight, Receipt, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: 97,
    description: 'Ideal para iniciantes',
    icon: Zap,
    features: [
      '3 Perfis do Facebook',
      '10 Contas de Anúncio',
      '50 Campanhas/mês',
      '5GB de Armazenamento',
      'Suporte por Email',
    ],
    color: 'text-ads-info',
    bgColor: 'bg-ads-info/10',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 197,
    description: 'Para profissionais',
    icon: Crown,
    popular: true,
    features: [
      '10 Perfis do Facebook',
      '50 Contas de Anúncio',
      'Campanhas Ilimitadas',
      '50GB de Armazenamento',
      'Suporte Prioritário',
      'API Acesso',
    ],
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 497,
    description: 'Para grandes equipes',
    icon: Building2,
    features: [
      'Perfis Ilimitados',
      'Contas Ilimitadas',
      'Campanhas Ilimitadas',
      'Armazenamento Ilimitado',
      'Gerente de Conta Dedicado',
      'API Completa',
      'White Label',
    ],
    color: 'text-ads-warning',
    bgColor: 'bg-ads-warning/10',
  },
];

const invoices = [
  { id: '1', date: '01/02/2026', amount: 197, status: 'paid' },
  { id: '2', date: '01/01/2026', amount: 197, status: 'paid' },
  { id: '3', date: '01/12/2025', amount: 197, status: 'paid' },
];

export function BillingSettings() {
  const { user } = useAuthStore();
  const currentPlan = user?.plan || 'pro';

  // Mock usage data
  const usage = {
    profiles: { used: 3, limit: 10 },
    accounts: { used: 12, limit: 50 },
    campaigns: { used: 156, limit: -1 }, // -1 means unlimited
    storage: { used: 8.5, limit: 50 }, // in GB
  };

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Plano Atual
          </CardTitle>
          <CardDescription>
            Gerencie sua assinatura e uso
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <Crown className="w-7 h-7 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-foreground">Plano Pro</h3>
                  <Badge className="badge-active">Ativo</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Renovação em 01/03/2026
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-foreground">
                R$ 197<span className="text-sm font-normal text-muted-foreground">/mês</span>
              </p>
              <Button variant="outline" size="sm" className="mt-2">
                Gerenciar Assinatura
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Uso do Plano</CardTitle>
          <CardDescription>
            Acompanhe seu consumo mensal
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground">Perfis do Facebook</span>
                <span className="text-sm text-muted-foreground">
                  {usage.profiles.used} / {usage.profiles.limit}
                </span>
              </div>
              <Progress value={(usage.profiles.used / usage.profiles.limit) * 100} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground">Contas de Anúncio</span>
                <span className="text-sm text-muted-foreground">
                  {usage.accounts.used} / {usage.accounts.limit}
                </span>
              </div>
              <Progress value={(usage.accounts.used / usage.accounts.limit) * 100} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground">Campanhas Criadas</span>
                <span className="text-sm text-muted-foreground">
                  {usage.campaigns.used} / Ilimitado
                </span>
              </div>
              <Progress value={30} className="bg-ads-success/20" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground">Armazenamento</span>
                <span className="text-sm text-muted-foreground">
                  {usage.storage.used}GB / {usage.storage.limit}GB
                </span>
              </div>
              <Progress value={(usage.storage.used / usage.storage.limit) * 100} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Planos Disponíveis</CardTitle>
          <CardDescription>
            Compare e escolha o melhor plano para você
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  'relative p-6 rounded-xl border-2 transition-all',
                  currentPlan === plan.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50',
                  plan.popular && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                )}
              >
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                    Mais Popular
                  </Badge>
                )}
                
                <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center mb-4', plan.bgColor)}>
                  <plan.icon className={cn('w-6 h-6', plan.color)} />
                </div>
                
                <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
                
                <div className="mt-4 mb-6">
                  <span className="text-3xl font-bold text-foreground">R$ {plan.price}</span>
                  <span className="text-muted-foreground">/mês</span>
                </div>
                
                <ul className="space-y-2 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-ads-success flex-shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Button
                  className="w-full"
                  variant={currentPlan === plan.id ? 'outline' : 'default'}
                  disabled={currentPlan === plan.id}
                >
                  {currentPlan === plan.id ? 'Plano Atual' : 'Selecionar'}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Billing History */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="w-5 h-5" />
                Histórico de Faturas
              </CardTitle>
              <CardDescription>
                Suas últimas transações
              </CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <ArrowUpRight className="w-4 h-4 mr-2" />
              Ver Todas
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-ads-success/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-ads-success" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Fatura #{invoice.id}
                    </p>
                    <p className="text-xs text-muted-foreground">{invoice.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-foreground">
                    R$ {invoice.amount}
                  </span>
                  <Badge className="badge-active">Pago</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Payment Method */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Método de Pagamento</CardTitle>
          <CardDescription>
            Gerencie sua forma de pagamento
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-4">
              <div className="w-14 h-10 rounded bg-gradient-to-r from-primary to-primary/70 flex items-center justify-center">
                <span className="text-primary-foreground text-xs font-bold">VISA</span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  •••• •••• •••• 4242
                </p>
                <p className="text-xs text-muted-foreground">Expira 12/2028</p>
              </div>
            </div>
            <Button variant="outline" size="sm">
              Alterar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
