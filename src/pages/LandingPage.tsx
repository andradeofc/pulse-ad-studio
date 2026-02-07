import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Megaphone,
  Layers,
  Shield,
  Clock,
  BarChart3,
  Zap,
  ArrowRight,
  Check,
  ChevronDown,
  Users,
  Target,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const features = [
  {
    icon: Layers,
    title: 'Criação em Massa',
    description: 'Crie centenas de campanhas, conjuntos e anúncios em minutos com templates inteligentes.',
  },
  {
    icon: Users,
    title: 'Multi-Contas',
    description: 'Gerencie múltiplas contas de anúncio e perfis do Facebook em uma única interface.',
  },
  {
    icon: Shield,
    title: 'Sistema Anti-Spy',
    description: 'Distribua anúncios entre várias páginas automaticamente para evitar detecção.',
  },
  {
    icon: Clock,
    title: 'Fila Inteligente',
    description: 'Processamento assíncrono com atualizações em tempo real via WebSocket.',
  },
  {
    icon: BarChart3,
    title: 'Analytics Integrado',
    description: 'Acompanhe métricas de performance e gere relatórios personalizados.',
  },
  {
    icon: Zap,
    title: 'Catálogo Dinâmico',
    description: 'Suporte completo a Dynamic Product Ads para maior aprovação.',
  },
];

const steps = [
  {
    step: '01',
    title: 'Conecte',
    description: 'Vincule seus perfis do Facebook e contas de anúncio com tokens de acesso.',
  },
  {
    step: '02',
    title: 'Configure',
    description: 'Defina orçamentos, públicos, criativos e estratégias de lance.',
  },
  {
    step: '03',
    title: 'Lance',
    description: 'Crie campanhas em massa com um único clique e acompanhe o processamento.',
  },
  {
    step: '04',
    title: 'Monitore',
    description: 'Analise performance em tempo real e otimize suas campanhas.',
  },
];

const plans = [
  {
    name: 'Starter',
    price: '97',
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
    price: '297',
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
    price: '997',
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

const faqs = [
  {
    question: 'Como funciona a integração com o Facebook?',
    answer: 'Você pode conectar sua conta do Facebook de duas formas: via OAuth (login com Facebook) ou inserindo manualmente um token de acesso. Recomendamos o token manual para maior controle e estabilidade.',
  },
  {
    question: 'O que é o Sistema Anti-Spy?',
    answer: 'O Anti-Spy distribui automaticamente seus anúncios entre várias páginas do Facebook de forma aleatória, dificultando a detecção por ferramentas de espionagem de concorrentes.',
  },
  {
    question: 'Quantas campanhas posso criar por vez?',
    answer: 'Não há limite técnico para criação. Nosso sistema processa em fila, respeitando os rate limits da API do Facebook. Usuários Pro podem criar até 500 campanhas por mês.',
  },
  {
    question: 'Vocês oferecem suporte a catálogos dinâmicos?',
    answer: 'Sim! Temos suporte completo a Dynamic Product Ads (DPA). Você pode criar catálogos, adicionar produtos e vincular a seus anúncios diretamente pela plataforma.',
  },
  {
    question: 'Posso cancelar a qualquer momento?',
    answer: 'Sim, não há fidelidade. Você pode cancelar sua assinatura a qualquer momento sem multas ou taxas adicionais.',
  },
  {
    question: 'Vocês armazenam meus dados de forma segura?',
    answer: 'Absolutamente. Todos os tokens e dados sensíveis são criptografados com AES-256. Seguimos as melhores práticas de segurança e estamos em conformidade com LGPD.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-hero-pattern opacity-50" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-radial from-primary/20 to-transparent blur-3xl" />
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            className="max-w-4xl mx-auto text-center"
            initial="initial"
            animate="animate"
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp}>
              <Badge variant="outline" className="mb-6 border-primary/30 text-primary">
                <Sparkles className="w-3 h-3 mr-1" />
                Plataforma #1 para Facebook Ads
              </Badge>
            </motion.div>
            
            <motion.h1 
              variants={fadeInUp}
              className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground mb-6 leading-tight"
            >
              Gerencie anúncios{' '}
              <span className="text-gradient">em massa</span>{' '}
              no Facebook
            </motion.h1>
            
            <motion.p 
              variants={fadeInUp}
              className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
            >
              Crie centenas de campanhas em minutos, gerencie múltiplas contas e 
              escale seus resultados com automação inteligente e sistema Anti-Spy.
            </motion.p>
            
            <motion.div 
              variants={fadeInUp}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Button size="lg" asChild className="glow-primary text-lg px-8 h-14">
                <Link to="/register">
                  Comece Agora
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="text-lg px-8 h-14">
                <a href="#pricing">Ver Planos</a>
              </Button>
            </motion.div>
            
            <motion.p 
              variants={fadeInUp}
              className="mt-6 text-sm text-muted-foreground"
            >
              ✓ 7 dias grátis · ✓ Sem cartão de crédito · ✓ Cancele quando quiser
            </motion.p>
          </motion.div>

          {/* Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-16 relative"
          >
            <div className="relative mx-auto max-w-5xl">
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
              <div className="rounded-xl border border-border overflow-hidden shadow-2xl bg-card">
                <div className="flex items-center gap-2 px-4 py-3 bg-secondary border-b border-border">
                  <div className="w-3 h-3 rounded-full bg-destructive/80" />
                  <div className="w-3 h-3 rounded-full bg-ads-warning/80" />
                  <div className="w-3 h-3 rounded-full bg-ads-success/80" />
                </div>
                <div className="p-6 bg-gradient-to-br from-card to-secondary/50">
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    {[
                      { label: 'Contas Ativas', value: '127', change: '+12%' },
                      { label: 'Campanhas Ativas', value: '1,847', change: '+8%' },
                      { label: 'Gasto Total', value: 'R$ 45.2k', change: '+23%' },
                      { label: 'Na Fila', value: '24', change: '-' },
                    ].map((stat, i) => (
                      <div key={i} className="bg-background/50 rounded-lg p-4 border border-border/50">
                        <p className="text-sm text-muted-foreground">{stat.label}</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
                        {stat.change !== '-' && (
                          <p className="text-xs text-ads-success mt-1">{stat.change}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="h-40 bg-background/30 rounded-lg border border-border/50 flex items-center justify-center">
                    <BarChart3 className="w-12 h-12 text-muted-foreground/30" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-card/50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="outline" className="mb-4">Features</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Tudo que você precisa para escalar
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Ferramentas profissionais para gerenciar campanhas em grande escala 
              com eficiência e segurança.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="glass-card h-full hover:border-primary/30 transition-all duration-300 group">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-foreground">{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="outline" className="mb-4">Como Funciona</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Simples como 1, 2, 3, 4
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Comece a criar campanhas em massa em poucos minutos.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-border to-transparent" />
                )}
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 border border-primary/20">
                    <span className="text-2xl font-bold text-primary">{step.step}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-card/50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="outline" className="mb-4">Preços</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Planos para cada necessidade
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Escolha o plano ideal para o seu volume de campanhas. 
              Todos incluem 7 dias grátis.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={cn(
                  "glass-card h-full relative",
                  plan.popular && "border-primary shadow-glow"
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
                      <span className="text-4xl font-bold text-foreground">R$ {plan.price}</span>
                      <span className="text-muted-foreground">/mês</span>
                    </div>
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
                      className={cn(
                        "w-full",
                        plan.popular && "glow-primary"
                      )}
                      variant={plan.popular ? "default" : "outline"}
                      asChild
                    >
                      <Link to="/register">{plan.cta}</Link>
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="outline" className="mb-4">FAQ</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Perguntas Frequentes
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Tire suas dúvidas sobre a plataforma.
            </p>
          </motion.div>

          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                >
                  <AccordionItem value={`item-${index}`} className="glass-card border rounded-lg px-6">
                    <AccordionTrigger className="text-left hover:no-underline py-4">
                      <span className="text-foreground font-medium">{faq.question}</span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-4">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                </motion.div>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-card/50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center max-w-3xl mx-auto"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
              Pronto para escalar seus anúncios?
            </h2>
            <p className="text-lg text-muted-foreground mb-10">
              Junte-se a milhares de anunciantes que já automatizaram suas campanhas.
            </p>
            <Button size="lg" asChild className="glow-primary text-lg px-10 h-14">
              <Link to="/register">
                Começar Agora Grátis
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
