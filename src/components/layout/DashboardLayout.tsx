import { Outlet, Navigate } from 'react-router-dom';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardHeader } from './DashboardHeader';
import { ImpersonationBanner } from './ImpersonationBanner';
import { useAuthStore } from '@/stores/authStore';
import { useImpersonationStore } from '@/stores/impersonationStore';

export function DashboardLayout() {
  const { isAuthenticated } = useAuthStore();
  const isImpersonating = useImpersonationStore((s) => s.isImpersonating);

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
