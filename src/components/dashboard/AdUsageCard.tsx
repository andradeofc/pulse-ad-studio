import { motion } from 'framer-motion';
import { TrendingUp, Infinity, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdUsage } from '@/hooks/useAdUsage';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function AdUsageCard() {
  const { usage, isLoading } = useAdUsage();

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-24 mb-4" />
          <Skeleton className="h-2 w-full mb-2" />
          <Skeleton className="h-4 w-40" />
        </CardContent>
      </Card>
    );
  }

  if (!usage) {
    return null;
  }

  const getStatusColor = () => {
    if (usage.isUnlimited) return 'text-primary';
    if (usage.percentUsed >= 90) return 'text-red-500';
    if (usage.percentUsed >= 75) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getProgressColor = () => {
    if (usage.isUnlimited) return 'bg-primary';
    if (usage.percentUsed >= 90) return 'bg-red-500';
    if (usage.percentUsed >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusBadge = () => {
    if (usage.isUnlimited) {
      return (
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
          <Infinity className="w-3 h-3 mr-1" />
          Ilimitado
        </Badge>
      );
    }
    if (usage.percentUsed >= 90) {
      return (
        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Limite próximo
        </Badge>
      );
    }
    if (usage.percentUsed >= 75) {
      return (
        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Atenção
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
        <CheckCircle className="w-3 h-3 mr-1" />
        Saudável
      </Badge>
    );
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString('pt-BR');
  };

  const periodEndDate = usage.periodEnd ? parseISO(usage.periodEnd) : null;
  const renewsIn = periodEndDate 
    ? formatDistanceToNow(periodEndDate, { addSuffix: false, locale: ptBR })
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card className="glass-card h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className={`w-5 h-5 ${getStatusColor()}`} />
              Uso de Anúncios
            </CardTitle>
            {getStatusBadge()}
          </div>
          <CardDescription>
            Plano {usage.planName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${getStatusColor()}`}>
              {formatNumber(usage.adsUsed)}
            </span>
            {!usage.isUnlimited && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="text-xl text-muted-foreground">
                  {formatNumber(usage.adsLimit)}
                </span>
              </>
            )}
          </div>

          {!usage.isUnlimited && (
            <div className="space-y-2">
              <div className="relative">
                <Progress 
                  value={usage.percentUsed} 
                  className="h-2"
                />
                <div 
                  className={`absolute top-0 left-0 h-2 rounded-full transition-all ${getProgressColor()}`}
                  style={{ width: `${Math.min(100, usage.percentUsed)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{usage.percentUsed.toFixed(1)}% utilizado</span>
                <span>{formatNumber(usage.remaining)} restantes</span>
              </div>
            </div>
          )}

          {renewsIn && (
            <p className="text-xs text-muted-foreground">
              Renova em {renewsIn}
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
