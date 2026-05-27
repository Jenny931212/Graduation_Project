// app/(auth)/login.tsx
import { useAuth } from "@/src/auth/useAuth";
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";

export default function LoginScreen() {
  const { login } = useAuth();
  const { language } = useLanguage();
  const t = translations[language];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    if (!email || !password) {
      Alert.alert(t.prompt, t.loginRequiredFields);
      return;
    }
    try {
      setLoading(true);
      await login(email, password);
      
      // 💡 登入成功後，跳轉到根目錄的轉運站 (app/index.tsx)
      // 轉運站會自動根據使用者的身分 (role)，派發到 /family 或 /caregiver 的主畫面
      //router.replace("/");
      
    } catch (e: any) {
      Alert.alert(t.loginFailed, e?.message ?? t.loginFailedFallback);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 32, backgroundColor: "#FFF", justifyContent: "center" }}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={{ marginBottom: 40 }}>
        <Text style={{ fontSize: 36, fontWeight: "900", color: "#333" }}>{t.welcomeBack}</Text>
        <Text style={{ fontSize: 16, color: "#666", marginTop: 8 }}>{t.loginSubtitle}</Text>
      </View>

      <View style={{ gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#666", marginLeft: 4 }}>EMAIL</Text>
          <TextInput
            placeholder={t.emailPlaceholder}
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
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#666", marginLeft: 4 }}>{t.password}</Text>
          <TextInput
            placeholder={t.passwordPlaceholder}
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
            <Text style={{ color: "#FFF", fontSize: 18, fontWeight: "900" }}>{t.loginNow}</Text>
          )}
        </Pressable>
      </View>

      <View style={{ marginTop: 32, alignItems: "center" }}>
        <Pressable onPress={() => router.push("/(auth)/register")}>
          <Text style={{ color: "#666", fontSize: 15, fontWeight: "600" }}>
            {t.noAccount}<Text style={{ color: "#007AFF", fontWeight: "900" }}>{t.goRegister}</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
