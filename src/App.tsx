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
import CampaignsPage from "@/pages/dashboard/CampaignsPage";

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
          </Route>

          {/* Dashboard Routes */}
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/perfis-facebook" element={<FacebookProfilesPage />} />
            <Route path="/contas-anuncio" element={<AdAccountsPage />} />
            <Route path="/campanhas" element={<CampaignsPage />} />
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
            <Route path="/ajuda" element={<PlaceholderPage title="Obter Ajuda" description="Central de ajuda e suporte" />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
