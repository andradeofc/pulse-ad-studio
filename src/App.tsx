import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useThemeInitializer } from "@/hooks/useTheme";

// Layouts
import { PublicLayout } from "@/components/layout/PublicLayout";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Public Pages
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";

// Public Pages (Footer)
import ChangelogPage from "@/pages/public/ChangelogPage";
import SobrePage from "@/pages/public/SobrePage";
import BlogPage from "@/pages/public/BlogPage";
import CarreirasPage from "@/pages/public/CarreirasPage";
import ContatoPage from "@/pages/public/ContatoPage";
import TermosPage from "@/pages/public/TermosPage";
import PrivacidadePage from "@/pages/public/PrivacidadePage";
import CookiesPage from "@/pages/public/CookiesPage";

// Dashboard Pages
import DashboardPage from "@/pages/dashboard/DashboardPage";
import FacebookProfilesPage from "@/pages/dashboard/FacebookProfilesPage";
import FacebookPagesPage from "@/pages/dashboard/FacebookPagesPage";
import AdAccountsPage from "@/pages/dashboard/AdAccountsPage";
import CreateCampaignPage from "@/pages/dashboard/CreateCampaignPage";
import ProcessingQueuePage from "@/pages/dashboard/ProcessingQueuePage";
import MediaLibraryPage from "@/pages/dashboard/MediaLibraryPage";
import CatalogSchedulingPage from "@/pages/dashboard/CatalogSchedulingPage";
import SettingsPage from "@/pages/dashboard/SettingsPage";
import HelpPage from "@/pages/dashboard/HelpPage";
import CampaignsPage from "@/pages/dashboard/CampaignsPage";
import CampaignDetailsPage from "@/pages/dashboard/CampaignDetailsPage";

// Admin Pages
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";
import AdminUserDetailsPage from "@/pages/admin/AdminUserDetailsPage";
import AdminCampaignsPage from "@/pages/admin/AdminCampaignsPage";
import AdminSearchPage from "@/pages/admin/AdminSearchPage";
import AdminAuditLogsPage from "@/pages/admin/AdminAuditLogsPage";
import AdminSettingsPage from "@/pages/admin/AdminSettingsPage";
import AdminNotificationsPage from "@/pages/admin/AdminNotificationsPage";
import AdminApiLogsPage from "@/pages/admin/AdminApiLogsPage";

// Placeholder
import { PlaceholderPage } from "@/components/PlaceholderPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const initialize = useAuthStore((state) => state.initialize);
  
  // Initialize theme from localStorage
  useThemeInitializer();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/changelog" element={<ChangelogPage />} />
            <Route path="/sobre" element={<SobrePage />} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/carreiras" element={<CarreirasPage />} />
            <Route path="/contato" element={<ContatoPage />} />
            <Route path="/termos" element={<TermosPage />} />
            <Route path="/privacidade" element={<PrivacidadePage />} />
            <Route path="/cookies" element={<CookiesPage />} />
          </Route>

          {/* Dashboard Routes */}
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/perfis-facebook" element={<FacebookProfilesPage />} />
            <Route path="/contas-anuncio" element={<AdAccountsPage />} />
            <Route path="/campanhas" element={<CampaignsPage />} />
            <Route path="/campanhas/:id" element={<CampaignDetailsPage />} />
            <Route path="/campanhas/criar" element={<CreateCampaignPage />} />
            <Route path="/paginas" element={<FacebookPagesPage />} />
            <Route path="/fila-processamento" element={<ProcessingQueuePage />} />
            <Route path="/biblioteca-midia" element={<MediaLibraryPage />} />
            <Route path="/agendamento-catalogo" element={<CatalogSchedulingPage />} />
            <Route path="/publicos" element={<PlaceholderPage title="Públicos" description="Gerencie seus públicos salvos" />} />
            <Route path="/analytics" element={<PlaceholderPage title="Analytics" description="Métricas e performance" />} />
            <Route path="/relatorios" element={<PlaceholderPage title="Relatórios" description="Relatórios personalizados" />} />
            <Route path="/planos" element={<PlaceholderPage title="Planos" description="Gerencie sua assinatura" />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
            <Route path="/ajuda" element={<HelpPage />} />
          </Route>

          {/* Admin Routes - Obscure path for security */}
          <Route path="/ops-center" element={<AdminDashboardPage />} />
          <Route path="/ops-center/usuarios" element={<AdminUsersPage />} />
          <Route path="/ops-center/usuarios/:userId" element={<AdminUserDetailsPage />} />
          <Route path="/ops-center/campanhas" element={<AdminCampaignsPage />} />
          <Route path="/ops-center/busca" element={<AdminSearchPage />} />
          <Route path="/ops-center/auditoria" element={<AdminAuditLogsPage />} />
          <Route path="/ops-center/notificacoes" element={<AdminNotificationsPage />} />
          <Route path="/ops-center/logs-api" element={<AdminApiLogsPage />} />
          <Route path="/ops-center/configuracoes" element={<AdminSettingsPage />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
