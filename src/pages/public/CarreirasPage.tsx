import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';

const positions = [
  { title: 'Desenvolvedor Full Stack Senior', department: 'Engenharia', location: 'Remoto', type: 'CLT' },
  { title: 'Product Designer', department: 'Design', location: 'Remoto', type: 'CLT' },
  { title: 'Customer Success Manager', department: 'Sucesso do Cliente', location: 'São Paulo, SP', type: 'CLT' },
];

export default function CarreirasPage() {
  return (
    <div className="container mx-auto px-4 py-20 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
        <h1 className="text-4xl font-bold text-foreground mb-4">Carreiras</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Junte-se ao time que está transformando a forma como anunciantes operam no Facebook Ads.
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-border rounded-2xl p-8 mb-12 text-center">
        <h2 className="text-xl font-semibold text-foreground mb-3">Por que trabalhar no AdStorm?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-muted-foreground mt-6">
          <div className="p-4 rounded-xl bg-secondary/30"><span className="font-medium text-foreground block mb-1">100% Remoto</span>Trabalhe de qualquer lugar</div>
          <div className="p-4 rounded-xl bg-secondary/30"><span className="font-medium text-foreground block mb-1">Cultura de Produto</span>Impacto real nas decisões</div>
          <div className="p-4 rounded-xl bg-secondary/30"><span className="font-medium text-foreground block mb-1">Crescimento</span>Plano de carreira estruturado</div>
        </div>
      </motion.div>

      <h2 className="text-2xl font-bold text-foreground mb-6">Vagas Abertas</h2>
      <div className="space-y-4">
        {positions.map((pos, i) => (
          <motion.div key={pos.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }}>
            <Card className="bg-card border-border">
              <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-foreground">{pos.title}</h3>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{pos.department}</span>
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{pos.location}</span>
                    <Badge variant="outline" className="text-xs">{pos.type}</Badge>
                  </div>
                </div>
                <Button size="sm">Candidatar-se</Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
