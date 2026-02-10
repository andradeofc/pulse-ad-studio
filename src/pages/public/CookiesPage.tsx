import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';

const cookieTypes = [
  { name: 'Essenciais', description: 'Necessários para o funcionamento básico da plataforma, como autenticação e segurança.', required: true },
  { name: 'Funcionais', description: 'Armazenam suas preferências como tema e idioma para melhorar a experiência de uso.', required: false },
  { name: 'Analíticos', description: 'Nos ajudam a entender como você usa a plataforma para que possamos melhorá-la continuamente.', required: false },
];

export default function CookiesPage() {
  return (
    <div className="container mx-auto px-4 py-20 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
        <h1 className="text-4xl font-bold text-foreground mb-4">Política de Cookies</h1>
        <p className="text-sm text-muted-foreground">Última atualização: 01 de fevereiro de 2026</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-6 mb-12">
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-2">O que são cookies?</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Cookies são pequenos arquivos de texto armazenados no seu navegador quando você visita um site. 
            Eles são amplamente utilizados para fazer sites funcionarem de forma mais eficiente e fornecer 
            informações aos proprietários do site.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Como usamos cookies</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            O AdStorm utiliza cookies para garantir o funcionamento adequado da plataforma, manter sua sessão 
            ativa, lembrar suas preferências e melhorar continuamente nossos serviços.
          </p>
        </div>
      </motion.div>

      <h2 className="text-lg font-semibold text-foreground mb-4">Tipos de Cookies</h2>
      <div className="space-y-4">
        {cookieTypes.map((cookie, i) => (
          <motion.div key={cookie.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }}>
            <Card className="bg-card border-border">
              <CardContent className="p-5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-medium text-foreground mb-1">{cookie.name}</h3>
                  <p className="text-sm text-muted-foreground">{cookie.description}</p>
                </div>
                {cookie.required && (
                  <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded shrink-0">Obrigatório</span>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-8">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Você pode gerenciar suas preferências de cookies nas configurações do seu navegador. Note que 
          desativar cookies essenciais pode afetar o funcionamento da plataforma.
        </p>
      </motion.div>
    </div>
  );
}
