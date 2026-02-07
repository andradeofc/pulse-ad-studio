import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Megaphone,
  FileText,
  Clock,
  Image,
  Target,
  BarChart3,
  FileBarChart,
  Crown,
  Settings,
  HelpCircle,
  Plus,
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const mainNavSections: NavSection[] = [
  {
    label: 'CONTAS',
    items: [
      { title: 'Perfis Facebook', href: '/perfis-facebook', icon: Users },
      { title: 'Contas de Anúncio', href: '/contas-anuncio', icon: CreditCard },
    ],
  },
  {
    label: 'GESTÃO DE ANÚNCIOS',
    items: [
      { title: 'Campanhas', href: '/campanhas', icon: Megaphone },
      { title: 'Páginas', href: '/paginas', icon: FileText },
      { title: 'Fila de Processamento', href: '/fila-processamento', icon: Clock },
      { title: 'Biblioteca de Mídia', href: '/biblioteca-midia', icon: Image },
      { title: 'Públicos', href: '/publicos', icon: Target },
    ],
  },
  {
    label: 'ANALYTICS E RELATÓRIOS',
    items: [
      { title: 'Analytics', href: '/analytics', icon: BarChart3 },
      { title: 'Relatórios', href: '/relatorios', icon: FileBarChart },
    ],
  },
];

const bottomNavItems: NavItem[] = [
  { title: 'Planos', href: '/planos', icon: Crown },
  { title: 'Configurações', href: '/configuracoes', icon: Settings },
  { title: 'Obter Ajuda', href: '/ajuda', icon: HelpCircle },
];

export function DashboardSidebar() {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(
    mainNavSections.map(s => s.label)
  );

  const toggleSection = (label: string) => {
    setExpandedSections(prev =>
      prev.includes(label)
        ? prev.filter(l => l !== label)
        : [...prev, label]
    );
  };

  const isActive = (href: string) => location.pathname === href;

  const NavContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-6 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
          <Megaphone className="w-4 h-4 text-primary-foreground" />
        </div>
        {!isCollapsed && (
          <div className="flex flex-col">
            <span className="font-bold text-foreground">AdsPulse</span>
            <span className="text-xs text-muted-foreground">v1.0.0</span>
          </div>
        )}
      </div>

      {/* Create Campaign Button */}
      <div className="px-3 py-4">
        <Button
          asChild
          className={cn(
            "w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2 glow-primary",
            isCollapsed && "px-2"
          )}
        >
          <Link to="/campanhas/criar">
            <Plus className="w-4 h-4" />
            {!isCollapsed && <span>Criar Nova Campanha</span>}
          </Link>
        </Button>
      </div>

      {/* Dashboard Link */}
      <div className="px-3">
        <Link
          to="/dashboard"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
            isActive('/dashboard')
              ? "bg-sidebar-accent text-primary border-l-2 border-primary"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
          )}
        >
          <LayoutDashboard className="w-5 h-5" />
          {!isCollapsed && <span className="font-medium">Dashboard</span>}
        </Link>
      </div>

      {/* Main Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {mainNavSections.map((section) => (
          <div key={section.label}>
            {!isCollapsed && (
              <button
                onClick={() => toggleSection(section.label)}
                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-full hover:text-foreground transition-colors"
              >
                {expandedSections.includes(section.label) ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                {section.label}
              </button>
            )}
            
            {(isCollapsed || expandedSections.includes(section.label)) && (
              <div className="space-y-1">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                      isActive(item.href)
                        ? "bg-sidebar-accent text-primary border-l-2 border-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                    )}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {!isCollapsed && <span>{item.title}</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom Section */}
      <div className="border-t border-border px-3 py-4 space-y-1">
        {bottomNavItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
              isActive(item.href)
                ? "bg-sidebar-accent text-primary border-l-2 border-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
            )}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>{item.title}</span>}
          </Link>
        ))}
      </div>

      {/* User Section */}
      <div className="border-t border-border p-4">
        <div className={cn(
          "flex items-center gap-3",
          isCollapsed && "justify-center"
        )}>
          <Avatar className="w-10 h-10 border-2 border-border">
            <AvatarImage src={user?.avatarUrl} />
            <AvatarFallback className="bg-primary/20 text-primary">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.name || 'Usuário'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email || 'email@email.com'}
              </p>
            </div>
          )}
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="text-muted-foreground hover:text-destructive"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
      >
        {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300",
          isCollapsed ? "w-16" : "w-64",
          // Off-canvas on mobile, always visible from md+
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <NavContent />

        {/* Collapse Toggle (Desktop only) */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border shadow-md hover:bg-secondary"
        >
          {isCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3 rotate-180" />
          )}
        </Button>
      </aside>

      {/* Spacer for content - always visible from md+ to push main content */}
      <div
        className={cn(
          "hidden md:block flex-shrink-0 transition-all duration-300",
          isCollapsed ? "w-16" : "w-64"
        )}
      />
    </>
  );
}
