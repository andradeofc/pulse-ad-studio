import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

interface LoadingStateProps {
  message?: string;
  variant?: 'spinner' | 'skeleton' | 'inline';
  className?: string;
  skeletonHeight?: string;
}

export function LoadingState({ 
  message = 'Carregando...', 
  variant = 'spinner',
  className,
  skeletonHeight = 'h-10'
}: LoadingStateProps) {
  if (variant === 'skeleton') {
    return (
      <Skeleton className={cn(skeletonHeight, 'w-full rounded-lg', className)} />
    );
  }

  if (variant === 'inline') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-muted-foreground text-sm', className)}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>{message}</span>
      </span>
    );
  }

  return (
    <div className={cn(
      'flex items-center gap-2 p-3 bg-secondary/50 rounded-lg border border-border',
      className
    )}>
      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{message}</span>
    </div>
  );
}
