import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

const integrations = [
  { name: 'Facebook Ads', icon: '📘' },
  { name: 'Meta Business Suite', icon: '🔵' },
  { name: 'Instagram Ads', icon: '📸' },
  { name: 'Facebook Pixel', icon: '📊' },
  { name: 'Dynamic Product Ads', icon: '🛍️' },
  { name: 'Conversions API', icon: '🔄' },
];

export function IntegrationsSection() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <Badge variant="outline" className="mb-4">Integrações</Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Conectado ao ecossistema Meta
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Integração nativa com todas as APIs e ferramentas do Facebook e Meta para máxima performance.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-4xl mx-auto">
          {integrations.map((integration, index) => (
            <motion.div
              key={integration.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.05, y: -4 }}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border border-border bg-card/50 hover:border-primary/30 hover:shadow-lg transition-all duration-300 cursor-default"
            >
              <span className="text-3xl">{integration.icon}</span>
              <span className="text-xs font-medium text-muted-foreground text-center leading-tight">
                {integration.name}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
