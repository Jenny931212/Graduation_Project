import { useAuth } from "@/src/auth/useAuth";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";


export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    if (!email || !password) {
      Alert.alert("提示", "請輸入 Email 與密碼");
      return;
    }
    try {
      setLoading(true);
      await login(email, password);
    } catch (e: any) {
      Alert.alert("登入失敗", e?.message ?? "帳號或密碼錯誤");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 32, backgroundColor: "#FFF", justifyContent: "center" }}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={{ marginBottom: 40 }}>
        <Text style={{ fontSize: 36, fontWeight: "900", color: "#333" }}>歡迎回來</Text>
        <Text style={{ fontSize: 16, color: "#666", marginTop: 8 }}>請登入您的照護帳號</Text>
      </View>

      <View style={{ gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#666", marginLeft: 4 }}>EMAIL</Text>
          <TextInput
            placeholder="請輸入 Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={{ 
              backgroundColor: "#F2F2F7", 
              borderRadius: 14, 
              padding: 16, 
              fontSize: 16,
              borderWidth: 1,
              borderColor: "#EEE"
            }}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#666", marginLeft: 4 }}>密碼</Text>
          <TextInput
            placeholder="請輸入密碼"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={{ 
              backgroundColor: "#F2F2F7", 
              borderRadius: 14, 
              padding: 16, 
              fontSize: 16,
              borderWidth: 1,
              borderColor: "#EEE"
            }}
          />
        </View>

        <Pressable
          onPress={onLogin}
          disabled={loading}
          style={({ pressed }) => ({
            marginTop: 20,
            padding: 18,
            borderRadius: 16,
            backgroundColor: loading ? "#CCC" : "#007AFF",
            alignItems: "center",
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={{ color: "#FFF", fontSize: 18, fontWeight: "900" }}>立即登入</Text>
          )}
        </Pressable>
      </View>

      <View style={{ marginTop: 32, alignItems: "center" }}>
        <Pressable onPress={() => router.push("/(auth)/register")}>
          <Text style={{ color: "#666", fontSize: 15, fontWeight: "600" }}>
            沒有帳號嗎？<Text style={{ color: "#007AFF", fontWeight: "900" }}>去註冊</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}