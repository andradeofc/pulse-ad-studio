import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  HelpCircle,
  BookOpen,
  MessageCircle,
  Zap,
  ChevronDown,
  ExternalLink,
  Search,
  Megaphone,
  Users,
  CreditCard,
  Settings,
  Shield,
  BarChart3,
  Image,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Link } from 'react-router-dom';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const faqItems: FAQItem[] = [
  {
    category: 'Campanhas',
    question: 'Como criar uma campanha em massa?',
    answer: 'Acesse "Criar Campanha" no menu lateral. O wizard de 5 etapas guia você desde o upload de criativos até a revisão final. Selecione múltiplas contas de anúncios para criar campanhas em escala.',
  },
  {
    category: 'Campanhas',
    question: 'O que acontece se um job falhar?',
    answer: 'Jobs que falham ficam marcados em vermelho na Fila de Processamento. Você pode ver o erro detalhado clicando no job. Os itens já criados com sucesso não são afetados.',
  },
  {
    category: 'Campanhas',
    question: 'Posso pausar um job em andamento?',
    answer: 'Sim. Na Fila de Processamento, clique no botão de pausa do job. Ele será retomado de onde parou quando você reativar.',
  },
  {
    category: 'Contas',
    question: 'Como adicionar uma conta de anúncios?',
    answer: 'Vá em "Perfis Facebook" e adicione um perfil com seu token de acesso. Após a validação, sincronize as contas de anúncios vinculadas ao perfil.',
  },
  {
    category: 'Contas',
    question: 'O que significa "Token expirado"?',
    answer: 'Tokens do Facebook expiram periodicamente. Quando isso acontece, você precisa gerar um novo token e atualizar no perfil correspondente em "Perfis Facebook".',
  },
  {
    category: 'Contas',
    question: 'Posso usar múltiplos perfis do Facebook?',
    answer: 'Sim. Você pode adicionar quantos perfis precisar. Cada perfil tem suas próprias contas de anúncios, páginas e Business Managers.',
  },
  {
    category: 'Planos',
    question: 'Qual o limite de anúncios do meu plano?',
    answer: 'O limite varia por plano: Starter (10.000/mês), Pro (25.000/mês) e Enterprise (150.000/mês). Você pode acompanhar seu uso no card "Uso de Anúncios" do Dashboard.',
  },
  {
    category: 'Planos',
    question: 'Quando o ciclo de uso é renovado?',
    answer: 'O ciclo de uso é renovado a cada 30 dias a partir da data de início da sua assinatura. O contador de anúncios criados é zerado automaticamente.',
  },
  {
    category: 'Criativos',
    question: 'Quais formatos de criativos são suportados?',
    answer: 'Imagens (JPG, PNG, WebP) e vídeos (MP4, MOV). Recomendamos resoluções mínimas de 1080x1080 para imagens e 1080x1920 para Stories/Reels.',
  },
  {
    category: 'Criativos',
    question: 'Posso reutilizar criativos em múltiplas campanhas?',
    answer: 'Sim. Todos os criativos ficam salvos na Biblioteca de Mídia e podem ser selecionados em qualquer campanha futura.',
  },
  {
    category: 'Segurança',
    question: 'Meus dados e tokens estão seguros?',
    answer: 'Sim. Todos os tokens são armazenados com criptografia e nunca são expostos no frontend. As comunicações com a API do Facebook são feitas via funções serverless seguras.',
  },
  {
    category: 'Segurança',
    question: 'Quem tem acesso às minhas contas?',
    answer: 'Apenas você tem acesso às suas contas e dados. Cada usuário opera em um ambiente isolado com políticas de segurança rigorosas.',
  },
];

const categories = [
  { id: 'all', label: 'Todas', icon: BookOpen },
  { id: 'Campanhas', label: 'Campanhas', icon: Megaphone },
  { id: 'Contas', label: 'Contas', icon: Users },
  { id: 'Planos', label: 'Planos', icon: CreditCard },
  { id: 'Criativos', label: 'Criativos', icon: Image },
  { id: 'Segurança', label: 'Segurança', icon: Shield },
];

const quickLinks = [
  { title: 'Criar Campanha', description: 'Inicie o wizard de criação', href: '/campanhas/criar', icon: Megaphone },
  { title: 'Perfis Facebook', description: 'Gerencie seus perfis e tokens', href: '/perfis-facebook', icon: Users },
  { title: 'Fila de Processamento', description: 'Acompanhe seus jobs', href: '/fila-processamento', icon: RefreshCw },
  { title: 'Contas de Anúncios', description: 'Veja todas as suas contas', href: '/contas-anuncios', icon: CreditCard },
  { title: 'Biblioteca de Mídia', description: 'Gerencie seus criativos', href: '/biblioteca-midia', icon: Image },
  { title: 'Configurações', description: 'Ajuste suas preferências', href: '/configuracoes', icon: Settings },
];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const filteredFAQ = faqItems.filter((item) => {
    const matchesSearch =
      searchQuery === '' ||
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Central de Ajuda</h1>
        <p className="text-muted-foreground">Encontre respostas, atalhos e orientações para usar o AdStorm</p>
      </div>

      {/* Search */}
      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Buscar nas perguntas frequentes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-base"
            />
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Atalhos Rápidos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickLinks.map((link, index) => (
            <motion.div
              key={link.href}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link to={link.href}>
                <Card className="glass-card hover:border-primary/40 transition-all cursor-pointer group h-full">
                  <CardContent className="p-5 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                      <link.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {link.title}
                      </p>
                      <p className="text-sm text-muted-foreground">{link.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-primary" />
          Perguntas Frequentes
        </h2>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={activeCategory === cat.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveCategory(cat.id)}
              className="gap-1.5"
            >
              <cat.icon className="w-3.5 h-3.5" />
              {cat.label}
            </Button>
          ))}
        </div>

        <Card className="glass-card">
          <CardContent className="p-6">
            {filteredFAQ.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhum resultado encontrado</p>
                <p className="text-sm mt-1">Tente buscar com outros termos</p>
              </div>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {filteredFAQ.map((item, index) => (
                  <AccordionItem key={index} value={`faq-${index}`} className="border rounded-lg px-4">
                    <AccordionTrigger className="text-left hover:no-underline py-4">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {item.category}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">{item.question}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground pb-4 pl-[calc(theme(spacing.3)+60px)]">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Support Card */}
      <Card className="glass-card border-primary/20">
        <CardContent className="p-8 text-center">
          <MessageCircle className="w-12 h-12 mx-auto text-primary mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Precisa de mais ajuda?</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            Se você não encontrou a resposta que procura, entre em contato com nosso suporte.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline" className="gap-2" asChild>
              <a href="mailto:suporte@adstorm.com.br">
                <MessageCircle className="w-4 h-4" />
                Enviar E-mail
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
