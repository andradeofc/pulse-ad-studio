import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export interface AdUsageData {
  adsUsed: number;
  adsLimit: number;
  periodStart: string;
  periodEnd: string;
  isUnlimited: boolean;
  remaining: number;
  percentUsed: number;
  planName: string;
}

export interface CanCreateAdsResult {
  allowed: boolean;
  currentUsage: number;
  limitValue: number;
  remaining: number;
  isUnlimited: boolean;
  message: string;
}

const PLAN_NAMES: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const PLAN_LIMITS: Record<string, number> = {
  starter: 10000,
  pro: 25000,
  enterprise: 150000,
};

export function useAdUsage() {
  const { user } = useAuthStore();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ad-usage', user?.id],
    queryFn: async (): Promise<AdUsageData | null> => {
      if (!user?.id) return null;

      // Get user's plan
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('plan')
        .eq('user_id', user.id)
        .single();

      const plan = profile?.plan || 'starter';

      // Call database function to get current usage
      const { data: usageData, error: usageError } = await supabase
        .rpc('get_current_ad_usage', { check_user_id: user.id });

      if (usageError) {
        console.error('Error fetching ad usage:', usageError);
        throw usageError;
      }

      const usage = usageData?.[0];
      if (!usage) {
        // Return defaults if no usage data
        return {
          adsUsed: 0,
          adsLimit: PLAN_LIMITS[plan] || 10000,
          periodStart: new Date().toISOString(),
          periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isUnlimited: false,
          remaining: PLAN_LIMITS[plan] || 10000,
          percentUsed: 0,
          planName: PLAN_NAMES[plan] || 'Starter',
        };
      }

      const adsUsed = usage.ads_used || 0;
      const adsLimit = usage.ads_limit || PLAN_LIMITS[plan] || 10000;
      const isUnlimited = usage.is_unlimited || false;

      return {
        adsUsed,
        adsLimit,
        periodStart: usage.period_start,
        periodEnd: usage.period_end,
        isUnlimited,
        remaining: isUnlimited ? 999999 : Math.max(0, adsLimit - adsUsed),
        percentUsed: isUnlimited ? 0 : Math.min(100, (adsUsed / adsLimit) * 100),
        planName: isUnlimited ? 'Admin (Ilimitado)' : (PLAN_NAMES[plan] || 'Starter'),
      };
    },
    enabled: !!user?.id,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  });

  const checkCanCreateAds = async (adsToCreate: number): Promise<CanCreateAdsResult> => {
    if (!user?.id) {
      return {
        allowed: false,
        currentUsage: 0,
        limitValue: 0,
        remaining: 0,
        isUnlimited: false,
        message: 'Usuário não autenticado',
      };
    }

    const { data, error } = await supabase
      .rpc('can_create_ads', { 
        check_user_id: user.id, 
        ads_to_create: adsToCreate 
      });

    if (error) {
      console.error('Error checking ad limits:', error);
      return {
        allowed: false,
        currentUsage: 0,
        limitValue: 0,
        remaining: 0,
        isUnlimited: false,
        message: 'Erro ao verificar limites',
      };
    }

    const result = data?.[0];
    if (!result) {
      return {
        allowed: true,
        currentUsage: 0,
        limitValue: 10000,
        remaining: 10000,
        isUnlimited: false,
        message: 'OK',
      };
    }

    return {
      allowed: result.allowed,
      currentUsage: result.current_usage,
      limitValue: result.limit_value,
      remaining: result.remaining,
      isUnlimited: result.is_unlimited,
      message: result.message,
    };
  };

  return {
    usage: data,
    isLoading,
    error,
    refetch,
    checkCanCreateAds,
  };
}
