import { motion } from 'framer-motion';
import { Layers, Users, Shield, Clock, BarChart3, Zap } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

export function FeaturesSection() {
  return (
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
  );
}
