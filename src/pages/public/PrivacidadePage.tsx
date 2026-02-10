import { motion } from 'framer-motion';

const sections = [
  { title: '1. Dados que Coletamos', content: 'Coletamos informações fornecidas por você no cadastro (nome, e-mail), dados de uso da plataforma, informações das suas contas de anúncio do Facebook e criativos carregados na biblioteca de mídia.' },
  { title: '2. Como Usamos seus Dados', content: 'Utilizamos seus dados para: fornecer e manter os serviços do AdStorm, processar suas campanhas no Facebook Ads, enviar notificações sobre o status de suas campanhas, melhorar a experiência do usuário e comunicar atualizações importantes.' },
  { title: '3. Compartilhamento de Dados', content: 'Não vendemos seus dados pessoais. Compartilhamos informações apenas com a API do Facebook/Meta quando necessário para executar suas campanhas, e com provedores de infraestrutura essenciais para o funcionamento da plataforma.' },
  { title: '4. Tokens de Acesso', content: 'Os tokens de acesso do Facebook que você fornece são armazenados de forma criptografada e são utilizados exclusivamente para executar as operações que você solicita na plataforma.' },
  { title: '5. Segurança', content: 'Implementamos medidas técnicas e organizacionais para proteger seus dados, incluindo criptografia em trânsito e em repouso, controle de acesso baseado em papéis e monitoramento contínuo de segurança.' },
  { title: '6. Seus Direitos (LGPD)', content: 'Em conformidade com a Lei Geral de Proteção de Dados (LGPD), você tem direito a: acessar seus dados pessoais, solicitar correção de dados incorretos, solicitar a exclusão de seus dados, revogar seu consentimento a qualquer momento e solicitar a portabilidade dos seus dados.' },
  { title: '7. Contato do DPO', content: 'Para exercer seus direitos ou esclarecer dúvidas sobre o tratamento de dados, entre em contato com nosso Encarregado de Proteção de Dados através do e-mail: dpo@adstorm.com.br.' },
];

export default function PrivacidadePage() {
  return (
    <div className="container mx-auto px-4 py-20 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
        <h1 className="text-4xl font-bold text-foreground mb-4">Política de Privacidade</h1>
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
