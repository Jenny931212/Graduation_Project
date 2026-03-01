import { AuthProvider } from "@/src/auth/AuthProvider";
import { useAuth } from "@/src/auth/useAuth";
import { StoreProvider } from "@/src/store/StoreProvider";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";

function RootLayoutNav() {
  // 修正 1: 這裡只取 user，拿掉 loading
  const { user } = useAuth(); 
  const segments = useSegments();
  const router = useRouter();
  
  // 用來確保 Root Layout 已經掛載完成
  const [isNavigationReady, setIsNavigationReady] = useState(false);

  useEffect(() => {
    setIsNavigationReady(true);
  }, []);

  useEffect(() => {
    // 修正 2: 拿掉 loading 的判斷
    if (!isNavigationReady) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (user && inAuthGroup) {
      // 已登入 + 在登入頁 -> 自動去首頁
      router.replace("/care-target/select");
    } else if (!user && !inAuthGroup) {
      // 沒登入 + 在內部頁 -> 踢回登入頁
      router.replace("/(auth)/login");
    }
  }, [user, segments, isNavigationReady]); // 修正 3: 依賴陣列也拿掉 loading

  return (
    <Stack 
      screenOptions={{ 
        headerTitleAlign: "center",
        headerShown: false,
        gestureEnabled: false
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
      <StoreProvider>
        <RootLayoutNav />
      </StoreProvider>
    </AuthProvider>
  );
}