// app/_layout.tsx
import { AuthProvider } from "@/src/auth/AuthProvider";
import { useAuth } from "@/src/auth/useAuth";
import { ActiveCareTargetProvider } from "@/src/care-target/useActiveCareTarget";
import { registerForPushToken } from "@/src/notifications/registerForPushToken";
import { LanguageProvider } from "@/src/store/LanguageContext";
import { StoreProvider } from "@/src/store/StoreProvider";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";

function RootLayoutNav() {
  const { user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const [isNavigationReady, setIsNavigationReady] = useState(false);

  useEffect(() => {
    setIsNavigationReady(true);
  }, []);

  useEffect(() => {
    if (!isNavigationReady) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (user && inAuthGroup) {
      router.replace("/");
    } else if (!user && !inAuthGroup) {
      router.replace("/(auth)/login");
    }
  }, [user, segments, isNavigationReady]);

  useEffect(() => {
    if (!user?.uid) return;

    (async () => {
      try {
        console.log("[push] current uid =", user.uid);
        await registerForPushToken(user.uid);
      } catch (error) {
        console.log("[push] register token failed:", error);
      }
    })();
  }, [user?.uid]);

  return (
    <Stack
      screenOptions={{
        headerTitleAlign: "center",
        headerShown: false,
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="caregiver" options={{ headerShown: false }} />
      <Stack.Screen name="family" options={{ headerShown: false }} />
      <Stack.Screen name="care-target" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <StoreProvider>
          <ActiveCareTargetProvider>
            <RootLayoutNav />
          </ActiveCareTargetProvider>
        </StoreProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}
