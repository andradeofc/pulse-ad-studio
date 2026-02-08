import { useEffect, useCallback, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

interface UseUnsavedChangesWarningOptions {
  hasUnsavedChanges: boolean;
  message?: string;
}

/**
 * Hook to warn users about unsaved changes when navigating away
 * Handles both browser navigation (beforeunload) and React Router navigation
 */
export function useUnsavedChangesWarning({
  hasUnsavedChanges,
  message = 'Você tem alterações não salvas. Deseja realmente sair?',
}: UseUnsavedChangesWarningOptions) {
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  
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

  // Handle React Router navigation
  const blocker = useBlocker(
    useCallback(
      () => hasUnsavedChangesRef.current,
      [] // Empty deps - we use ref to get current value
    )
  );

  // Return blocker state for custom UI handling
  return {
    isBlocked: blocker.state === 'blocked',
    proceed: blocker.proceed,
    reset: blocker.reset,
    message,
  };
}
