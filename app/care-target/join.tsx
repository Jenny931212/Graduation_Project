import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useAuth } from "@/src/auth/useAuth";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";

const KEY_CARE_TARGETS = "careapp_careTargets_v1";
const KEY_LINKS = "careapp_careTarget_links_v1";

export default function CareTargetJoinScreen() {
  const { user } = useAuth();
  const { setActiveCareTargetId } = useActiveCareTarget();
  const [code, setCode] = useState("");

  const onJoin = async () => {
    if (!user || !code) return;
    try {
      const rawTargets = await AsyncStorage.getItem(KEY_CARE_TARGETS);
      const allTargets = rawTargets ? JSON.parse(rawTargets) : [];
      const found = allTargets.find((t: any) => t.inviteCode.toUpperCase() === code.trim().toUpperCase());

      if (!found) {
        Alert.alert("無效的邀請碼", "請確認邀請碼是否正確。");
        return;
      }

      const rawLinks = await AsyncStorage.getItem(KEY_LINKS);
      const allLinks = rawLinks ? JSON.parse(rawLinks) : {};
      const userLinks = allLinks[user.uid] || [];
      
      if (userLinks.includes(found.id)) {
        Alert.alert("提示", "您已經加入過這位長輩了。");
        router.replace("/care-target/select");
        return;
      }

      allLinks[user.uid] = [...userLinks, found.id];
      await AsyncStorage.setItem(KEY_LINKS, JSON.stringify(allLinks));

      Alert.alert("成功加入", `已成功連結到：${found.name}`, [
        { text: "開始使用", 
          onPress: async () => {
            await setActiveCareTargetId(found.id);
            const home = user?.role === "caregiver" ? "/caregiver" : "/family";
            router.replace(home as any);
          }
        },
      ]);
    } catch (e) {
      Alert.alert("加入失敗");
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop:90, gap: 24 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 28, fontWeight: "900" }}>加入照顧對象</Text>
        <Text style={{ fontSize: 16, color: "#666" }}>請向其他護理人員或家屬索取邀請碼</Text>
      </View>

      <View style={{ gap: 12 }}>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="請輸入 6-8 碼邀請碼"
          autoCapitalize="characters"
          style={{ 
            borderWidth: 1, 
            borderColor: "#007AFF", 
            borderRadius: 12, 
            padding: 20, 
            fontSize: 24, 
            fontWeight: "800",
            textAlign: "center",
            letterSpacing: 4,
            backgroundColor: "#F9FBFF"
          }}
        />
      </View>

      <Pressable 
        onPress={onJoin}
        disabled={code.length < 4}
        style={{ backgroundColor: code.length >= 4 ? "#007AFF" : "#CCC", padding: 18, borderRadius: 12 }}
      >
        <Text style={{ color: "#FFF", textAlign: "center", fontWeight: "900", fontSize: 18 }}>立即加入</Text>
      </Pressable>

      <Pressable onPress={() => router.back()}>
        <Text style={{ color: "#666", textAlign: "center", fontWeight: "700" }}>返回</Text>
      </Pressable>
    </ScrollView>
  );
}