import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitleAlign: "center",
      }}
    >
      <Stack.Screen
        name="login"
        options={{ title: "登入" }}
      />
      <Stack.Screen
        name="register"
        options={{ title: "註冊" }}
      />
    </Stack>
  );
}
