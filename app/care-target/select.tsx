import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/src/auth/useAuth";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget"; 
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";
import * as Clipboard from "expo-clipboard";

type CareTarget = {
  id: string;
  name: string;
  notes?: string;
  inviteCode: string;
};

export default function CareTargetSelectScreen() {
  const { user, ready } = useAuth();
  const { language } = useLanguage();
  const t = translations[language];
  const {
    ready: ctReady,
    activePatientId,              // ✅ 改這裡
    linkedCareTargets,
    setActivePatientId,           // ✅ 改這裡
  } = useActiveCareTarget();

  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/(auth)/login" as any);
  }, [ready, user]);

  const copyToClipboard = async (code: string | undefined) => {
    if (!code) {
      Alert.alert(t.prompt, t.noInviteCodeToCopy);
      return;
    }
    await Clipboard.setStringAsync(code);
    Alert.alert(t.copySuccess, `${t.inviteCode} ${code} ${t.inviteCodeCopied}`);
  };

  async function pick(id: string) {
    if (!user) return;
    try {
      setSubmittingId(id);
      await setActivePatientId(id); // ✅ 改這裡
      const home = user.role === "caregiver" ? "/caregiver" : "/family";
      router.replace(home as any);
    } catch (e) {
      Alert.alert(t.resultErrorTitle, t.switchTargetFailed);
    } finally {
      setSubmittingId(null);
    }
  }

  if (!ctReady) return <ActivityIndicator style={{ flex: 1 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop:90, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: "900", color: "#333", marginBottom: 8 }}>
        {t.selectCareTarget}
      </Text>

      {(linkedCareTargets as CareTarget[]).map((ct) => {
        const isSelected = ct.id === activePatientId; // ✅ 改這裡
        return (
          <View 
            key={ct.id}
            style={{
              borderRadius: 16,
              backgroundColor: isSelected ? "#E1E9FF" : "#FFF",
              borderWidth: 2,
              borderColor: isSelected ? "#007AFF" : "#EEE",
              padding: 16,
              gap: 10
            }}
          >
            <Pressable onPress={() => pick(ct.id)} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 22, fontWeight: "900", color: isSelected ? "#007AFF" : "#333" }}>
                  {ct.name}
                </Text>
                {isSelected && <Text style={{ color: "#007AFF", fontWeight: "800" }}>{t.active}</Text>}
              </View>

              {ct.notes ? (
                <Text style={{ color: "#666", fontSize: 14 }} numberOfLines={2}>
                  {t.note}：{ct.notes}
                </Text>
              ) : (
                <Text style={{ color: "#CCC", fontSize: 14 }}>{t.noNote}</Text>
              )}
            </Pressable>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: isSelected ? "#C0D1FF" : "#F2F2F7", paddingTop: 10 }}>
              <View style={{ flex: 1, backgroundColor: isSelected ? "#FFF" : "#F2F2F7", padding: 8, borderRadius: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#666" }}>
                  {t.inviteCode}：<Text style={{ color: "#007AFF" }}>{ct.inviteCode}</Text>
                </Text>
              </View>
              <Pressable 
                onPress={() => copyToClipboard(ct.inviteCode)}
                style={{ backgroundColor: "#007AFF", paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 }}
              >
                <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>{t.copy}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <View style={{ gap: 12, marginTop: 10 }}>
        <Pressable 
          onPress={() => router.push("/care-target/create")} 
          style={{ padding: 18, backgroundColor: "#007AFF", borderRadius: 12 }}
        >
          <Text style={{ color: "#fff", textAlign: "center", fontWeight: "800", fontSize: 16 }}>{t.addCareTarget}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/care-target/join")}
          style={{ padding: 18, borderWidth: 1, borderColor: "#007AFF",borderRadius: 12, backgroundColor: "#fff"}}
        >
          <Text style={{ color: "#007AFF", textAlign: "center", fontWeight: "800", fontSize: 16 }}>{t.joinByInviteCode}</Text>
        </Pressable>
        <Pressable 
          onPress={() => {
            const home = user?.role === "caregiver" ? "/caregiver" : "/family";
            router.replace(home as any);
          }} 
          style={{ marginTop: 8, paddingVertical: 10 }}
        >
          <Text style={{ color: "#666", textAlign: "center", fontWeight: "700" }}>{t.home}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
