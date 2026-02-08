import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Megaphone, Eye, EyeOff, ArrowRight, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, isLoading } = useAuthStore();
  const { toast } = useToast();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: 'Senhas não conferem',
        description: 'Verifique se as senhas são iguais.',
        variant: 'destructive',
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve ter pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      await register(name, email, password);
      toast({
        title: 'Conta criada!',
        description: 'Verifique seu email para confirmar a conta.',
      });
      navigate('/login');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Tente novamente mais tarde.';
      toast({
        title: 'Erro ao criar conta',
        description: errorMessage === 'User already registered' 
          ? 'Este email já está cadastrado.' 
          : errorMessage,
        variant: 'destructive',
      });
    }
  };

  const benefits = [
    '7 dias grátis para testar',
    'Sem cartão de crédito',
    'Cancele quando quiser',
    'Suporte por email',
  ];

  return (
    <div className="min-h-screen flex">
      {/* Left - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-glow-sm">
              <Megaphone className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl text-foreground">AdStorm</span>
          </Link>

          <h1 className="text-2xl font-bold text-foreground mb-2">Crie sua conta</h1>
          <p className="text-muted-foreground mb-8">
            Comece a criar campanhas em massa gratuitamente.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                type="text"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-12 bg-secondary/50 border-border input-glow"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 bg-secondary/50 border-border input-glow"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="h-12 bg-secondary/50 border-border pr-12 input-glow"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-12 bg-secondary/50 border-border input-glow"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 glow-primary"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Criar Conta
                  <ArrowRight className="ml-2 w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 text-sm text-muted-foreground text-center">
            Ao criar uma conta, você concorda com nossos{' '}
            <Link to="/termos" className="text-primary hover:underline">Termos de Uso</Link>
            {' '}e{' '}
            <Link to="/privacidade" className="text-primary hover:underline">Política de Privacidade</Link>.
          </p>

          <p className="mt-4 text-center text-muted-foreground">
            Já tem uma conta?{' '}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Entrar
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Right - Visual */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-card/50 border-l border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-pattern opacity-30" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-primary/20 to-transparent blur-3xl" />
        
        <div className="relative z-10 max-w-lg px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-2xl font-bold text-foreground mb-6">
              Por que escolher o AdStorm?
            </h2>
            
            <ul className="space-y-4">
              {benefits.map((benefit, index) => (
                <motion.li
                  key={benefit}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-foreground">{benefit}</span>
                </motion.li>
              ))}
            </ul>

            <div className="mt-10 p-6 bg-background/50 rounded-xl border border-border">
              <p className="text-muted-foreground text-sm italic">
                "O AdStorm revolucionou a forma como gerenciamos nossas campanhas. 
                Criamos mais de 500 campanhas em apenas 2 horas."
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-primary font-bold">M</span>
                </div>
                <div>
                  <p className="text-foreground font-medium">Marcos Silva</p>
                  <p className="text-sm text-muted-foreground">CEO, AgênciaMax</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
