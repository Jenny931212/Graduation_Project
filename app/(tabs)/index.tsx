import { Redirect } from "expo-router";
import { useAuthContext } from "@/src/auth/AuthProvider";

export default function Index() {
  const { ready, user } = useAuthContext();

  // Auth 還在初始化 → 什麼都不做
  if (!ready) return null;

  // 沒登入 → 去登入頁
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  // ✅ 已登入，一律先去選長輩
  return <Redirect href="/care-target/select" />;
}
