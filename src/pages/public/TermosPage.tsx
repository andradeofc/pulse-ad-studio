import { motion } from 'framer-motion';

const sections = [
  { title: '1. Aceitação dos Termos', content: 'Ao acessar e utilizar a plataforma AdStorm, você concorda com estes Termos de Uso. Caso não concorde com qualquer disposição, recomendamos que não utilize nossos serviços.' },
  { title: '2. Descrição do Serviço', content: 'O AdStorm é uma plataforma de automação para criação e gestão em massa de campanhas publicitárias no Facebook Ads. Os serviços incluem, mas não se limitam a: criação automatizada de campanhas, conjuntos de anúncios e anúncios, gerenciamento de contas de anúncio e páginas do Facebook, biblioteca de mídia e templates de campanha.' },
  { title: '3. Conta do Usuário', content: 'Para utilizar o AdStorm, você deve criar uma conta fornecendo informações verdadeiras, completas e atualizadas. Você é responsável por manter a confidencialidade de suas credenciais de acesso e por todas as atividades realizadas em sua conta.' },
  { title: '4. Uso Aceitável', content: 'Você concorda em utilizar a plataforma apenas para fins legítimos e em conformidade com as políticas de publicidade do Facebook/Meta. É proibido utilizar o AdStorm para atividades ilegais, spam, conteúdo ofensivo ou qualquer violação das políticas da Meta.' },
  { title: '5. Propriedade Intelectual', content: 'Todo o conteúdo, design, código e funcionalidades do AdStorm são de propriedade exclusiva da empresa. Você mantém a propriedade de todo conteúdo e criativos que você carrega na plataforma.' },
  { title: '6. Limitação de Responsabilidade', content: 'O AdStorm não se responsabiliza por decisões tomadas pelo Facebook/Meta em relação às suas campanhas, incluindo reprovações de anúncios, bloqueios de conta ou mudanças nas políticas da plataforma.' },
  { title: '7. Alterações nos Termos', content: 'Reservamo-nos o direito de modificar estes termos a qualquer momento. Alterações significativas serão comunicadas por e-mail ou notificação na plataforma com antecedência mínima de 30 dias.' },
];

export default function TermosPage() {
  return (
    <div className="container mx-auto px-4 py-20 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
        <h1 className="text-4xl font-bold text-foreground mb-4">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground">Última atualização: 01 de fevereiro de 2026</p>
      </motion.div>

      <div className="space-y-8">
        {sections.map((s, i) => (
          <motion.div key={s.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <h2 className="text-lg font-semibold text-foreground mb-2">{s.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{s.content}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
