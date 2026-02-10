import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, ArrowRight } from 'lucide-react';

const posts = [
  {
    title: 'Como escalar suas campanhas de Facebook Ads sem perder performance',
    excerpt: 'Descubra as melhores práticas para escalar campanhas mantendo o ROAS positivo e a qualidade dos leads.',
    date: '2026-02-08',
    category: 'Estratégia',
    readTime: '5 min',
  },
  {
    title: 'O guia completo de criação em massa de anúncios',
    excerpt: 'Aprenda a criar centenas de variações de anúncios de forma eficiente usando automação e templates.',
    date: '2026-01-25',
    category: 'Tutorial',
    readTime: '8 min',
  },
  {
    title: 'Novidades do Facebook Ads em 2026: o que mudou?',
    excerpt: 'Um resumo das principais atualizações da API do Facebook e como elas impactam sua operação.',
    date: '2026-01-12',
    category: 'Novidades',
    readTime: '4 min',
  },
  {
    title: 'DPA vs. DABA: qual estratégia usar no seu e-commerce?',
    excerpt: 'Entenda as diferenças entre anúncios dinâmicos de produto e quando usar cada abordagem.',
    date: '2025-12-20',
    category: 'Estratégia',
    readTime: '6 min',
  },
];

export default function BlogPage() {
  return (
    <div className="container mx-auto px-4 py-20 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
        <h1 className="text-4xl font-bold text-foreground mb-4">Blog</h1>
        <p className="text-lg text-muted-foreground">Conteúdo sobre mídia paga, automação e estratégias de crescimento.</p>
      </motion.div>

      <div className="grid gap-6">
        {posts.map((post, i) => (
          <motion.div key={post.title} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer group">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <Badge variant="secondary" className="text-xs">{post.category}</Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" />
                    {new Date(post.date).toLocaleDateString('pt-BR')}
                  </span>
                  <span className="text-xs text-muted-foreground">{post.readTime} de leitura</span>
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">{post.title}</h2>
                <p className="text-sm text-muted-foreground mb-3">{post.excerpt}</p>
                <span className="text-sm text-primary font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                  Ler artigo <ArrowRight className="w-4 h-4" />
                </span>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
