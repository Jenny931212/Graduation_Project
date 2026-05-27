import { Stack } from "expo-router";

import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";

export default function AuthLayout() {
  const { language } = useLanguage();
  const t = translations[language];

  return (
    <Stack
      screenOptions={{
        headerTitleAlign: "center",
      }}
    >
      <Stack.Screen name="login" options={{ title: t.loginNow }} />
      <Stack.Screen name="register" options={{ title: t.createAccount }} />
    </Stack>
  );
}
