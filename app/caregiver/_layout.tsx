import { Stack } from "expo-router";

export default function CaregiverLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // ✅ 全域隱藏原生表頭
        contentStyle: { backgroundColor: "#FFF" }, // ✅ 統一頁面背景為純白
        gestureEnabled: false
      }}
    >
      <Stack.Screen name="index" options={{ gestureEnabled: false }} />
    </Stack>
  );
}