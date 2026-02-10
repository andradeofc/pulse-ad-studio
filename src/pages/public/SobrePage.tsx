import { motion } from 'framer-motion';
import { Target, Zap, Shield, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const values = [
  { icon: Zap, title: 'Eficiência', description: 'Automatizamos processos repetitivos para que você foque no que importa: resultados.' },
  { icon: Shield, title: 'Confiabilidade', description: 'Infraestrutura robusta e segura para proteger seus dados e campanhas.' },
  { icon: Target, title: 'Precisão', description: 'Ferramentas pensadas para minimizar erros e maximizar performance.' },
  { icon: Users, title: 'Parceria', description: 'Trabalhamos lado a lado com nossos clientes para evoluir a plataforma.' },
];

export default function SobrePage() {
  return (
    <div className="container mx-auto px-4 py-20 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
        <h1 className="text-4xl font-bold text-foreground mb-4">Sobre o AdStorm</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Nascemos da necessidade real de agências e gestores de tráfego que precisavam escalar a criação de campanhas no Facebook Ads sem perder qualidade ou controle.
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="prose prose-invert max-w-none mb-16">
        <div className="bg-card border border-border rounded-2xl p-8 space-y-4">
          <h2 className="text-2xl font-bold text-foreground">Nossa Missão</h2>
          <p className="text-muted-foreground leading-relaxed">
            Democratizar o acesso a ferramentas profissionais de mídia paga, permitindo que qualquer anunciante — 
            independente do tamanho — consiga operar com a mesma eficiência das maiores agências do mercado.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Acreditamos que a tecnologia deve eliminar barreiras, não criá-las. Por isso, construímos o AdStorm 
            como uma plataforma intuitiva, poderosa e acessível.
          </p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h2 className="text-2xl font-bold text-foreground text-center mb-8">Nossos Valores</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {values.map((v, i) => (
            <motion.div key={v.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.08 }}>
              <Card className="bg-card border-border h-full">
                <CardContent className="p-6">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <v.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{v.title}</h3>
                  <p className="text-sm text-muted-foreground">{v.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
