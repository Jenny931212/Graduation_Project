// app/index.tsx
import { Redirect } from "expo-router";
import { useAuth } from "@/src/auth/useAuth";

export default function Index() {
  const { user, ready } = useAuth();

  // 還在讀 AsyncStorage session 的時候：先不要跳，避免閃一下又跳回登入
  if (!ready) return null;

  // 沒登入 → 去登入頁
  if (!user) return <Redirect href="/(auth)/login" />;

  // ✅ 已登入 → 一律先到「選擇長輩」
  return <Redirect href="/care-target/select" />;
}
