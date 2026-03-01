import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/src/auth/useAuth";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget"; 
import * as Clipboard from "expo-clipboard";

type CareTarget = {
  id: string;
  name: string;
  notes?: string;
  inviteCode: string;
};

export default function CareTargetSelectScreen() {
  const { user, ready } = useAuth();
  const {
    ready: ctReady,
    activeCareTargetId,
    linkedCareTargets,
    setActiveCareTargetId,
  } = useActiveCareTarget();

  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/(auth)/login" as any);
  }, [ready, user]);

  const copyToClipboard = async (code: string | undefined) => {
    if (!code) {
      Alert.alert("提示", "無邀請碼可複製");
      return;
    }
    await Clipboard.setStringAsync(code);
    Alert.alert("複製成功", `邀請碼 ${code} 已存入剪貼簿`);
  };

  async function pick(id: string) {
    if (!user) return;
    try {
      setSubmittingId(id);
      await setActiveCareTargetId(id);
      const home = user.role === "caregiver" ? "/caregiver" : "/family";
      router.replace(home as any);
    } catch (e) {
      Alert.alert("錯誤", "切換對象失敗");
    } finally {
      setSubmittingId(null);
    }
  }

  if (!ctReady) return <ActivityIndicator style={{ flex: 1 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop:90, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: "900", color: "#333", marginBottom: 8 }}>
        選擇照顧對象
      </Text>

      {(linkedCareTargets as CareTarget[]).map((ct) => {
        const isSelected = ct.id === activeCareTargetId;
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
                {isSelected && <Text style={{ color: "#007AFF", fontWeight: "800" }}>使用中</Text>}
              </View>

              {/* ✅ 顯示備註內容 */}
              {ct.notes ? (
                <Text style={{ color: "#666", fontSize: 14 }} numberOfLines={2}>
                  備註：{ct.notes}
                </Text>
              ) : (
                <Text style={{ color: "#CCC", fontSize: 14 }}>無備註</Text>
              )}
            </Pressable>

            {/* 邀請碼與複製區 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: isSelected ? "#C0D1FF" : "#F2F2F7", paddingTop: 10 }}>
              <View style={{ flex: 1, backgroundColor: isSelected ? "#FFF" : "#F2F2F7", padding: 8, borderRadius: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#666" }}>
                  邀請碼：<Text style={{ color: "#007AFF" }}>{ct.inviteCode}</Text>
                </Text>
              </View>
              <Pressable 
                onPress={() => copyToClipboard(ct.inviteCode)}
                style={{ backgroundColor: "#007AFF", paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 }}
              >
                <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>複製</Text>
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
          <Text style={{ color: "#fff", textAlign: "center", fontWeight: "800", fontSize: 16 }}>＋ 新增長輩</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/care-target/join")}
          style={{ padding: 18, borderWidth: 1, borderColor: "#007AFF",borderRadius: 12, backgroundColor: "#fff"}}
        >
          <Text style={{ color: "#007AFF", textAlign: "center", fontWeight: "800", fontSize: 16 }}>🔑 輸入邀請碼加入</Text>
        </Pressable>
        <Pressable 
          onPress={() => {
            const home = user?.role === "caregiver" ? "/caregiver" : "/family";
            router.replace(home as any);
          }} 
          style={{ marginTop: 8, paddingVertical: 10 }}
        >
          <Text style={{ color: "#666", textAlign: "center", fontWeight: "700" }}>回首頁</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}