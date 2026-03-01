import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator, ScrollView } from "react-native";
import { router, Stack } from "expo-router";
import { useAuth } from "@/src/auth/useAuth";
import type { Role } from "@/src/auth/AuthProvider";

export default function RegisterScreen() {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("caregiver");
  const [loading, setLoading] = useState(false);

  async function onRegister() {
    if (!email || password.length < 6) {
      Alert.alert("提示", "Email 為必填，且密碼至少需 6 碼");
      return;
    }
    try {
      setLoading(true);
      await register(email, password, role);
      router.replace("/");
    } catch (e: any) {
      Alert.alert("註冊失敗", e?.message ?? "註冊過程發生錯誤");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 32, backgroundColor: "#FFF", justifyContent: "center" }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ marginBottom: 32 }}>
        <Text style={{ fontSize: 36, fontWeight: "900", color: "#333" }}>建立帳號</Text>
        <Text style={{ fontSize: 16, color: "#666", marginTop: 8 }}>選擇您的身份，開始管理照護計畫</Text>
      </View>

      <View style={{ gap: 20 }}>
        {/* 角色切換區塊 */}
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#666", marginLeft: 4 }}>您的身份</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              onPress={() => setRole("caregiver")}
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: role === "caregiver" ? "#007AFF" : "#EEE",
                backgroundColor: role === "caregiver" ? "#E1E9FF" : "#FFF",
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: "900", color: role === "caregiver" ? "#007AFF" : "#999" }}>看護</Text>
            </Pressable>

            <Pressable
              onPress={() => setRole("family")}
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: role === "family" ? "#007AFF" : "#EEE",
                backgroundColor: role === "family" ? "#E1E9FF" : "#FFF",
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: "900", color: role === "family" ? "#007AFF" : "#999" }}>家屬</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#666", marginLeft: 4 }}>EMAIL</Text>
          <TextInput
            placeholder="example@mail.com"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            style={{ backgroundColor: "#F2F2F7", borderRadius: 14, padding: 16, fontSize: 16, borderWidth: 1, borderColor: "#EEE" }}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#666", marginLeft: 4 }}>設定密碼</Text>
          <TextInput
            placeholder="請設定至少 6 位密碼"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={{ backgroundColor: "#F2F2F7", borderRadius: 14, padding: 16, fontSize: 16, borderWidth: 1, borderColor: "#EEE" }}
          />
        </View>

        <Pressable
          onPress={onRegister}
          disabled={loading}
          style={({ pressed }) => ({
            marginTop: 10,
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
            <Text style={{ color: "#FFF", fontSize: 18, fontWeight: "900" }}>完成並註冊</Text>
          )}
        </Pressable>
      </View>

      <Pressable onPress={() => router.back()} style={{ marginTop: 24, alignSelf: "center" }}>
        <Text style={{ color: "#666", fontSize: 15, fontWeight: "600" }}>已有帳號？<Text style={{ color: "#007AFF", fontWeight: "900" }}>返回登入</Text></Text>
      </Pressable>
    </ScrollView>
  );
}