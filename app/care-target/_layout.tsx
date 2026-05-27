import { Stack } from "expo-router";

import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";

export default function CareTargetLayout() {
  const { language } = useLanguage();
  const t = translations[language];

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTitleAlign: "center",
        gestureEnabled: false,
        headerLeft: () => null,
      }}
    >
      <Stack.Screen name="select" options={{ title: t.selectCareTarget, headerLeft: () => null }} />
      <Stack.Screen name="create" options={{ title: t.createCareTarget, headerLeft: undefined, gestureEnabled: true }} />
      <Stack.Screen name="join" options={{ title: t.joinCareTarget, headerLeft: undefined, gestureEnabled: true }} />
    </Stack>
  );
}
