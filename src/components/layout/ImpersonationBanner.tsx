import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, LogOut, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useImpersonationStore } from '@/stores/impersonationStore';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export function ImpersonationBanner() {
  const navigate = useNavigate();
  const { isImpersonating, impersonatedUser, expiresAt, stopImpersonation } = useImpersonationStore();
  const initialize = useAuthStore((s) => s.initialize);
  const [timeLeft, setTimeLeft] = useState('');

  // Countdown timer
  useEffect(() => {
    if (!isImpersonating || !expiresAt) return;

    const update = () => {
      const remaining = Math.max(0, expiresAt - Date.now());
      if (remaining <= 0) {
        handleExit();
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isImpersonating, expiresAt]);

  const handleExit = useCallback(async () => {
    const tokens = stopImpersonation();
    if (tokens) {
      // Restore admin session
      await supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      // Re-initialize auth store with admin session
      await initialize();
    }
    navigate('/ops-center/usuarios', { replace: true });
  }, [stopImpersonation, initialize, navigate]);

  if (!isImpersonating || !impersonatedUser) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-amber-500 to-red-500 text-white px-4 py-2 shadow-lg">
      <div className="max-w-screen-xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-4 h-4" />
          <span className="font-semibold text-sm">Modo Administrador</span>
          <span className="text-sm opacity-90">
            Logado como <strong>{impersonatedUser.name}</strong> ({impersonatedUser.email})
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm opacity-90">
            <Clock className="w-3.5 h-3.5" />
            <span>{timeLeft}</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="bg-white/20 hover:bg-white/30 text-white border-white/30 h-7 text-xs"
            onClick={handleExit}
          >
            <LogOut className="w-3.5 h-3.5 mr-1" />
            Voltar para Admin
          </Button>
        </div>
      </div>
    </div>
  );
}
