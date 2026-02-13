import { Outlet, Navigate } from 'react-router-dom';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardHeader } from './DashboardHeader';
import { ImpersonationBanner } from './ImpersonationBanner';
import { useAuthStore } from '@/stores/authStore';
import { useImpersonationStore } from '@/stores/impersonationStore';
import { Loader2 } from 'lucide-react';

export function DashboardLayout() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const isImpersonating = useImpersonationStore((s) => s.isImpersonating);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex w-full bg-background">
      <ImpersonationBanner />
      <DashboardSidebar />
      
      <div className={`flex-1 flex flex-col min-h-screen ${isImpersonating ? 'pt-10' : ''}`}>
        <DashboardHeader />
        
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
