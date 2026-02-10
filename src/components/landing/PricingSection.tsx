import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const plans = [
  {
    name: 'Starter',
    monthlyPrice: 97,
    yearlyPrice: 77,
    description: 'Ideal para iniciantes',
    features: [
      'Até 5 contas de anúncio',
      '50 campanhas/mês',
      '1 perfil do Facebook',
      'Suporte por email',
      'Biblioteca de mídia básica',
    ],
    cta: 'Começar Agora',
    popular: false,
  },
  {
    name: 'Pro',
    monthlyPrice: 297,
    yearlyPrice: 237,
    description: 'Para profissionais',
    features: [
      'Até 50 contas de anúncio',
      '500 campanhas/mês',
      '5 perfis do Facebook',
      'Sistema Anti-Spy',
      'Suporte prioritário',
      'API de integração',
      'Relatórios avançados',
    ],
    cta: 'Começar Agora',
    popular: true,
  },
  {
    name: 'Enterprise',
    monthlyPrice: 997,
    yearlyPrice: 797,
    description: 'Para agências e times',
    features: [
      'Contas ilimitadas',
      'Campanhas ilimitadas',
      'Perfis ilimitados',
      'Anti-Spy avançado',
      'Suporte 24/7',
      'API completa',
      'White-label',
      'Onboarding dedicado',
    ],
    cta: 'Falar com Vendas',
    popular: false,
  },
];

export function PricingSection() {
  const [isYearly, setIsYearly] = useState(false);

  return (
    <section id="pricing" className="py-24 bg-card/50">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <Badge variant="outline" className="mb-4">Preços</Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Planos para cada necessidade
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
            Escolha o plano ideal para o seu volume de campanhas.
            Todos incluem 7 dias grátis.
          </p>

          {/* Toggle Mensal/Anual */}
          <div className="flex items-center justify-center gap-3">
            <span className={cn('text-sm font-medium transition-colors', !isYearly ? 'text-foreground' : 'text-muted-foreground')}>
              Mensal
            </span>
            <button
              onClick={() => setIsYearly(!isYearly)}
              className={cn(
                'relative w-14 h-7 rounded-full transition-colors duration-300',
                isYearly ? 'bg-primary' : 'bg-border'
              )}
            >
              <motion.div
                className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-sm"
                animate={{ x: isYearly ? 28 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </button>
            <span className={cn('text-sm font-medium transition-colors', isYearly ? 'text-foreground' : 'text-muted-foreground')}>
              Anual
            </span>
            {isYearly && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                  Economize 20%
                </Badge>
              </motion.div>
            )}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => {
            const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={cn(
                  'glass-card h-full relative',
                  plan.popular && 'border-primary shadow-glow'
                )}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">
                        Mais Popular
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="text-center pb-4">
                    <CardTitle className="text-xl text-foreground">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                    <div className="mt-4">
                      <motion.span
                        key={price}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-4xl font-bold text-foreground"
                      >
                        R$ {price}
                      </motion.span>
                      <span className="text-muted-foreground">/mês</span>
                    </div>
                    {isYearly && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xs text-primary mt-1"
                      >
                        Cobrado anualmente (R$ {price * 12}/ano)
                      </motion.p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 mb-6">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-3 text-sm">
                          <Check className="w-4 h-4 text-primary flex-shrink-0" />
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      className={cn('w-full', plan.popular && 'glow-primary')}
                      variant={plan.popular ? 'default' : 'outline'}
                      asChild
                    >
                      <Link to="/register">{plan.cta}</Link>
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
