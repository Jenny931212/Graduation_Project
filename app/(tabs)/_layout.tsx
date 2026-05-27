import { Tabs, Redirect } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useAuth } from "@/src/auth/useAuth";
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const {ready , user } = useAuth();
  const { language } = useLanguage();
  const t = translations[language];

  // ✅ 等待本機登入狀態 hydrate 完再決定要不要進 Tabs
  if (ready) return null;

  // ✅ 若未登入，不允許進 Tabs（避免登入後又跳回 login 的亂跳）
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.home,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: t.handbook,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="paperplane.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
