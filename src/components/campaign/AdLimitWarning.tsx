import { AlertTriangle, XCircle, Infinity } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAdUsage } from '@/hooks/useAdUsage';
import { Skeleton } from '@/components/ui/skeleton';

interface AdLimitWarningProps {
  adsToCreate: number;
}

export function AdLimitWarning({ adsToCreate }: AdLimitWarningProps) {
  const { usage, isLoading } = useAdUsage();

  if (isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }

  if (!usage) {
    return null;
  }

  // Unlimited users don't need warnings
  if (usage.isUnlimited) {
    return (
      <Alert className="border-primary/30 bg-primary/5">
        <Infinity className="h-4 w-4 text-primary" />
        <AlertTitle className="text-primary">Plano Ilimitado</AlertTitle>
        <AlertDescription className="text-primary/80">
          Você possui um plano sem limites de anúncios.
        </AlertDescription>
      </Alert>
    );
  }

  const wouldExceed = (usage.adsUsed + adsToCreate) > usage.adsLimit;
  const isNearLimit = usage.percentUsed >= 75;
  const remaining = usage.remaining;

  if (wouldExceed) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle>Limite de anúncios excedido</AlertTitle>
        <AlertDescription>
          Você está tentando criar <strong>{adsToCreate.toLocaleString('pt-BR')}</strong> anúncios, 
          mas só possui <strong>{remaining.toLocaleString('pt-BR')}</strong> restantes no seu plano {usage.planName}.
          <br />
          <span className="text-sm opacity-80">
            Uso atual: {usage.adsUsed.toLocaleString('pt-BR')} / {usage.adsLimit.toLocaleString('pt-BR')}
          </span>
        </AlertDescription>
      </Alert>
    );
  }

  if (isNearLimit) {
    const afterCreation = usage.adsUsed + adsToCreate;
    const percentAfter = (afterCreation / usage.adsLimit) * 100;

    return (
      <Alert className="border-yellow-500/30 bg-yellow-500/5">
        <AlertTriangle className="h-4 w-4 text-yellow-500" />
        <AlertTitle className="text-yellow-500">Atenção ao limite</AlertTitle>
        <AlertDescription className="text-yellow-600 dark:text-yellow-400">
          Após criar estes <strong>{adsToCreate.toLocaleString('pt-BR')}</strong> anúncios, 
          você terá usado <strong>{percentAfter.toFixed(1)}%</strong> do seu limite mensal.
          <br />
          <span className="text-sm opacity-80">
            Restantes após criação: {(remaining - adsToCreate).toLocaleString('pt-BR')}
          </span>
        </AlertDescription>
      </Alert>
    );
  }

  // Show usage info for normal cases
  return (
    <Alert className="border-green-500/30 bg-green-500/5">
      <AlertTriangle className="h-4 w-4 text-green-500" />
      <AlertTitle className="text-green-600 dark:text-green-400">Uso de anúncios</AlertTitle>
      <AlertDescription className="text-green-600 dark:text-green-400">
        Criando <strong>{adsToCreate.toLocaleString('pt-BR')}</strong> anúncios. 
        Restantes após criação: <strong>{(remaining - adsToCreate).toLocaleString('pt-BR')}</strong>
        <br />
        <span className="text-sm opacity-80">
          Uso atual: {usage.adsUsed.toLocaleString('pt-BR')} / {usage.adsLimit.toLocaleString('pt-BR')} ({usage.percentUsed.toFixed(1)}%)
        </span>
      </AlertDescription>
    </Alert>
  );
}
