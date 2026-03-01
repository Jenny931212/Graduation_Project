import { Stack } from "expo-router";

export default function FamilyLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, 
        gestureEnabled: false
      }}
    >
      <Stack.Screen name="index" options={{ title: "家屬端" }} />
      <Stack.Screen name="list" options={{ title: "藥單列表" }} />
      <Stack.Screen name="detail" options={{ title: "藥單詳情" }} />
    </Stack>
  );
}