import { ReactNode, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Megaphone,
  Settings2,
  Search,
  FileText,
  BarChart3,
  Bell,
  Settings,
  ScrollText,
  ArrowLeft,
  Shield,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import logo from '@/assets/logo.png';

interface AdminLayoutProps {
  children: ReactNode;
}

const adminNavItems = [
  {
    section: null,
    items: [
      { title: 'Visão Geral', href: '/ops-center', icon: LayoutDashboard },
    ],
  },
  {
    section: 'GESTÃO DE USUÁRIOS',
    items: [
      { title: 'Usuários', href: '/ops-center/usuarios', icon: Users },
      { title: 'Planos & Assinaturas', href: '/ops-center/planos', icon: CreditCard },
    ],
  },
  {
    section: 'OPERAÇÕES',
    items: [
      { title: 'Todas as Campanhas', href: '/ops-center/campanhas', icon: Megaphone },
      { title: 'Fila de Processamento', href: '/ops-center/fila', icon: Settings2 },
      { title: 'Busca por Hash/ID', href: '/ops-center/busca', icon: Search },
      { title: 'Logs de API', href: '/ops-center/logs-api', icon: FileText },
    ],
  },
  {
    section: 'PLATAFORMA',
    items: [
      { title: 'Métricas', href: '/ops-center/metricas', icon: BarChart3 },
      { title: 'Notificações', href: '/ops-center/notificacoes', icon: Bell },
      { title: 'Configurações', href: '/ops-center/configuracoes', icon: Settings },
      { title: 'Logs de Auditoria', href: '/ops-center/auditoria', icon: ScrollText },
    ],
  },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, isLoading } = useAdminAuth(true);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-red-500" />
          <p className="text-sm text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null; // Will redirect via hook
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Admin Sidebar - Red/Dark theme */}
      <aside className="w-64 bg-gradient-to-b from-red-950 to-zinc-950 border-r border-red-900/30 flex flex-col">
        {/* Logo */}
        <div className="p-4 flex items-center gap-3 border-b border-red-900/30">
          <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
            <Shield className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">AdsPulse</h1>
            <Badge variant="outline" className="text-[10px] border-red-500/50 text-red-400 px-1.5">
              Admin
            </Badge>
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-4">
          <nav className="px-3 space-y-6">
            {adminNavItems.map((group, groupIdx) => (
              <div key={groupIdx}>
                {group.section && (
                  <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-red-400/70">
                    {group.section}
                  </p>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.href || 
                      (item.href !== '/ops-center' && location.pathname.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200',
                          isActive
                            ? 'bg-red-500/20 text-red-400 font-medium'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        )}
                      >
                        <item.icon className={cn('w-4 h-4', isActive && 'text-red-400')} />
                        {item.title}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Back to App */}
        <div className="p-4 border-t border-red-900/30">
          <Button
            variant="ghost"
            className="w-full justify-start text-zinc-400 hover:text-white hover:bg-white/5"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao App
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <ImpersonationBanner />
        {/* Admin Warning Banner */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white px-4 py-2 text-sm flex items-center justify-center gap-2">
          <Shield className="w-4 h-4" />
          <span className="font-medium">Painel Administrativo</span>
          <span className="text-red-200">— Ações são registradas no log de auditoria</span>
        </div>

        <div className="p-6">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
