import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface UseUnsavedChangesWarningOptions {
  hasUnsavedChanges: boolean;
  message?: string;
}

interface UseUnsavedChangesWarningReturn {
  isBlocked: boolean;
  pendingLocation: string | null;
  proceed: () => void;
  reset: () => void;
  message: string;
}

/**
 * Hook to warn users about unsaved changes when navigating away
 * Handles browser navigation (beforeunload) and provides state for custom dialog
 * Compatible with BrowserRouter (doesn't require data router)
 */
export function useUnsavedChangesWarning({
  hasUnsavedChanges,
  message = 'Você tem alterações não salvas. Deseja realmente sair?',
}: UseUnsavedChangesWarningOptions): UseUnsavedChangesWarningReturn {
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const [isBlocked, setIsBlocked] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Keep ref in sync
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  // Handle browser navigation (refresh, close tab, back button via browser)
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChangesRef.current) return;
      
      event.preventDefault();
      // Modern browsers ignore custom messages but still show a generic warning
      event.returnValue = message;
      return message;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [message]);

  // Proceed with navigation
  const proceed = useCallback(() => {
    if (pendingLocation) {
      setIsBlocked(false);
      const targetLocation = pendingLocation;
      setPendingLocation(null);
      navigate(targetLocation);
    }
  }, [pendingLocation, navigate]);

  // Cancel navigation
  const reset = useCallback(() => {
    setIsBlocked(false);
    setPendingLocation(null);
  }, []);

  // Return blocker state for custom UI handling
  return {
    isBlocked,
    pendingLocation,
    proceed,
    reset,
    message,
  };
}
