import { AlertTriangle, CheckCircle, AlertCircle, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RateLimitEstimate, formatEstimatedTime } from '@/lib/rateLimitCalculator';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface RateLimitIndicatorProps {
  estimate: RateLimitEstimate;
  className?: string;
  showDetails?: boolean;
}

export function RateLimitIndicator({ 
  estimate, 
  className,
  showDetails = true 
}: RateLimitIndicatorProps) {
  const { 
    usagePercent, 
    warningLevel, 
    message, 
    totalApiCalls, 
    totalPoints,
    estimatedTimeSeconds,
    recommendedMaxStructures,
    isOverLimit 
  } = estimate;

  const getIcon = () => {
    switch (warningLevel) {
      case 'danger':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-ads-success" />;
    }
  };

  const getProgressColor = () => {
    switch (warningLevel) {
      case 'danger':
        return 'bg-destructive';
      case 'warning':
        return 'bg-amber-500';
      default:
        return 'bg-ads-success';
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Main indicator */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              'flex items-center gap-2 p-3 rounded-lg border',
              warningLevel === 'danger' && 'border-destructive bg-destructive/10',
              warningLevel === 'warning' && 'border-amber-500 bg-amber-500/10',
              warningLevel === 'safe' && 'border-ads-success/30 bg-ads-success/5',
            )}>
              {getIcon()}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Rate Limit API
                  </span>
                  <span className={cn(
                    'text-xs font-bold',
                    warningLevel === 'danger' && 'text-destructive',
                    warningLevel === 'warning' && 'text-amber-500',
                    warningLevel === 'safe' && 'text-ads-success',
                  )}>
                    {usagePercent}%
                  </span>
                </div>
                <Progress 
                  value={Math.min(100, usagePercent)} 
                  className="h-1.5"
                  indicatorClassName={getProgressColor()}
                />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-sm">
            <p className="text-sm">{message}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Detailed breakdown */}
      {showDetails && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Zap className="h-3 w-3" />
            <span>{totalApiCalls} chamadas</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="font-mono">{totalPoints.toLocaleString()}</span>
            <span>pontos</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatEstimatedTime(estimatedTimeSeconds)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span>Máx: {recommendedMaxStructures}</span>
          </div>
        </div>
      )}

      {/* Warning message for over limit */}
      {isOverLimit && (
        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded border border-destructive/30">
          {message}
        </div>
      )}
    </div>
  );
}
