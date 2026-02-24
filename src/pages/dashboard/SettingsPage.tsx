import { useState } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Shield, Bell, Palette, CreditCard, MessageSquare, Users } from 'lucide-react';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { BillingSettings } from '@/components/settings/BillingSettings';
import { ZApiSettings } from '@/components/settings/ZApiSettings';
import { TeamSettings } from '@/components/settings/TeamSettings';
import { useEffectiveUserId } from '@/hooks/useEffectiveUserId';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

const baseTabs = [
  { id: 'profile', label: 'Perfil', icon: User },
  { id: 'security', label: 'Segurança', icon: Shield },
  { id: 'notifications', label: 'Notificações', icon: Bell },
  { id: 'zapi', label: 'WhatsApp (Z-API)', icon: MessageSquare },
  { id: 'appearance', label: 'Aparência', icon: Palette },
  { id: 'billing', label: 'Plano & Faturamento', icon: CreditCard },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const { supabaseUser } = useAuthStore();
  const { data: effectiveUser } = useEffectiveUserId();
  const isCollaborator = effectiveUser?.isCollaborator || false;

  // Fetch plan from DB to determine if Team tab should show
  const { data: userProfile } = useQuery({
    queryKey: ['user-plan', supabaseUser?.id],
    queryFn: async () => {
      if (!supabaseUser) return null;
      const { data } = await supabase
        .from('user_profiles')
        .select('plan')
        .eq('user_id', supabaseUser.id)
        .maybeSingle();
      return data;
    },
    enabled: !!supabaseUser,
  });

  const isEnterprise = userProfile?.plan === 'enterprise';

  // Build tabs: add Team tab for Enterprise owners (not collaborators)
  const tabs = isEnterprise && !isCollaborator
    ? [...baseTabs.slice(0, 4), { id: 'team', label: 'Equipe', icon: Users }, ...baseTabs.slice(4)]
    : baseTabs;

  // Collaborators can't see billing
  const visibleTabs = isCollaborator
    ? tabs.filter(t => t.id !== 'billing')
    : tabs;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground">Gerencie sua conta e preferências</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-secondary/50 p-1 h-auto flex-wrap gap-1">
          {visibleTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2"
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <TabsContent value="profile" className="mt-0">
            <ProfileSettings />
          </TabsContent>

          <TabsContent value="security" className="mt-0">
            <SecuritySettings />
          </TabsContent>

          <TabsContent value="notifications" className="mt-0">
            <NotificationSettings />
          </TabsContent>

          <TabsContent value="zapi" className="mt-0">
            <ZApiSettings />
          </TabsContent>

          {isEnterprise && !isCollaborator && (
            <TabsContent value="team" className="mt-0">
              <TeamSettings />
            </TabsContent>
          )}

          <TabsContent value="appearance" className="mt-0">
            <AppearanceSettings />
          </TabsContent>

          {!isCollaborator && (
            <TabsContent value="billing" className="mt-0">
              <BillingSettings />
            </TabsContent>
          )}
        </motion.div>
      </Tabs>
    </div>
  );
}
