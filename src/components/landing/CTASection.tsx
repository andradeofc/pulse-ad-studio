import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CTASection() {
  return (
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
  );
}
