import { Settings, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/stores/authStore';
import { NotificationPopover } from './NotificationPopover';
import { useEffectiveUserId } from '@/hooks/useEffectiveUserId';

const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/perfis-facebook': 'Perfis do Facebook',
  '/contas-anuncio': 'Contas de Anúncio',
  '/campanhas': 'Campanhas',
  '/campanhas/criar': 'Criar Nova Campanha',
  '/paginas': 'Páginas',
  '/fila-processamento': 'Fila de Processamento',
  '/biblioteca-midia': 'Biblioteca de Mídia',
  '/publicos': 'Públicos',
  '/analytics': 'Analytics',
  '/relatorios': 'Relatórios',
  '/planos': 'Planos',
  '/configuracoes': 'Configurações',
  '/ajuda': 'Obter Ajuda',
};

export function DashboardHeader() {
  const location = useLocation();
  const { user } = useAuthStore();
  const { data: effectiveUser } = useEffectiveUserId();
  
  const currentTitle = routeTitles[location.pathname] || 'Dashboard';
  const pathParts = location.pathname.split('/').filter(Boolean);

  return (
    <header className="sticky top-0 z-30 h-16 bg-background/95 backdrop-blur-sm border-b border-border px-6 flex items-center justify-between">
      {/* Left - Breadcrumb */}
      <div className="flex items-center gap-2">
        <nav className="flex items-center gap-1 text-sm">
          <Link 
            to="/dashboard" 
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
          {pathParts.length > 1 && pathParts[0] !== 'dashboard' && (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground font-medium">{currentTitle}</span>
            </>
          )}
          {pathParts.length === 1 && pathParts[0] !== 'dashboard' && (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground font-medium">{currentTitle}</span>
            </>
          )}
        </nav>
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-4">
        {effectiveUser?.isCollaborator && (
          <Badge variant="secondary" className="hidden md:flex text-xs">
            Colaborador de {effectiveUser.ownerName}
          </Badge>
        )}
        <span className="text-sm text-muted-foreground hidden md:block">
          Bem-vindo, <span className="text-foreground font-medium">{user?.name || 'Usuário'}</span>
        </span>
        
        <div className="flex items-center gap-2">
          <NotificationPopover />
          
          <Button 
            variant="ghost" 
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link to="/configuracoes">
              <Settings className="w-5 h-5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
