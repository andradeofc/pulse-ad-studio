import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Mail, MessageSquare, Clock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function ContatoPage() {
  const [sending, setSending] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setTimeout(() => {
      setSending(false);
      toast.success('Mensagem enviada! Retornaremos em breve.');
    }, 1000);
  };

  return (
    <div className="container mx-auto px-4 py-20 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
        <h1 className="text-4xl font-bold text-foreground mb-4">Fale Conosco</h1>
        <p className="text-lg text-muted-foreground">Tem alguma dúvida ou sugestão? Adoraríamos ouvir você.</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="bg-card border-border">
              <CardContent className="p-6">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome</Label>
                      <Input id="name" placeholder="Seu nome" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail</Label>
                      <Input id="email" type="email" placeholder="seu@email.com" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject">Assunto</Label>
                    <Input id="subject" placeholder="Como podemos ajudar?" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="message">Mensagem</Label>
                    <Textarea id="message" placeholder="Descreva sua dúvida ou sugestão..." rows={5} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={sending}>
                    {sending ? 'Enviando...' : 'Enviar Mensagem'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-4">
          {[
            { icon: Mail, title: 'E-mail', desc: 'suporte@adstorm.com.br' },
            { icon: MessageSquare, title: 'Chat', desc: 'Disponível no dashboard' },
            { icon: Clock, title: 'Horário', desc: 'Seg-Sex, 9h às 18h' },
          ].map(item => (
            <Card key={item.title} className="bg-card border-border">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <item.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground text-sm">{item.title}</h3>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
