import { Stack } from "expo-router";

export default function CareTargetLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, headerTitleAlign: "center", gestureEnabled: false, headerLeft: () => null,}}>
      <Stack.Screen name="select" options={{ title: "選擇長輩" , headerLeft: () => null,}} />
      <Stack.Screen name="create" options={{ title: "新增長輩" , headerLeft: undefined, gestureEnabled: true}} />
      <Stack.Screen name="join" options={{ title: "輸入邀請碼" , headerLeft: undefined, gestureEnabled: true}} />
    </Stack>
  );
}
