import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

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

export function FAQSection() {
  return (
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
  );
}
