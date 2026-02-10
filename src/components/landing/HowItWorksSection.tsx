import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

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

export function HowItWorksSection() {
  return (
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
  );
}
