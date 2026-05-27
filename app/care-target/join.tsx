import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/src/auth/useAuth";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db,auth } from "@/firebase/firebaseConfig";

export default function CareTargetJoinScreen() {
  const { user } = useAuth();
  const { setActivePatientId } = useActiveCareTarget();
  const { language } = useLanguage();
  const t = translations[language];
  const [code, setCode] = useState("");

  const normalizedCode = useMemo(() => code.trim().toUpperCase(), [code]);
  const canSubmit = normalizedCode.length >= 4;

  const onJoin = async () => {
    if (!user || !normalizedCode) return;

    try {
      const q = query(
        collection(db, "patients"),
        where("inviteCode", "==", normalizedCode)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        Alert.alert(t.invalidInviteCode, t.checkInviteCode);
        return;
      }

      const foundDoc = snap.docs[0];
      const found = foundDoc.data() as any;

      const roleField = user.role === "family" ? "families" : "caregivers";
      const currentList = Array.isArray(found?.[roleField]) ? found[roleField] : [];

      if (currentList.includes(user.uid)) {
        Alert.alert(t.prompt, t.alreadyJoined, [
          {
            text: t.goUse,
            onPress: async () => {
              await setActivePatientId(foundDoc.id);
              const home = user.role === "caregiver" ? "/caregiver" : "/family";
              router.replace(home as any);
            },
          },
        ]);
        return;
      }

      await updateDoc(doc(db, "patients", foundDoc.id), {
        [roleField]: arrayUnion(user.uid),
      });

      await setActivePatientId(foundDoc.id);

      Alert.alert(t.joinSuccess, found?.name ?? t.selectCareTarget, [
        {
          text: t.startUse,
          onPress: async () => {
            const home = user.role === "caregiver" ? "/caregiver" : "/family";
            router.replace(home as any);
          },
        },
      ]);
    } catch (e: any) {
      console.log("join patient error:", e);

      if (e?.code === "permission-denied") {
        Alert.alert(
          t.joinFailed,
          t.invitePermissionDenied
        );
        return;
      }

      Alert.alert(t.joinFailed, t.tryLater);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 90, gap: 24 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 28, fontWeight: "900" }}>{t.joinCareTarget}</Text>
        <Text style={{ fontSize: 16, color: "#666" }}>{t.askInviteCode}</Text>
      </View>

      <View style={{ gap: 12 }}>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder={t.inviteCodePlaceholder}
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
            backgroundColor: "#F9FBFF",
          }}
        />
      </View>

      <Pressable
        onPress={onJoin}
        disabled={!canSubmit}
        style={{ backgroundColor: canSubmit ? "#007AFF" : "#CCC", padding: 18, borderRadius: 12 }}
      >
        <Text style={{ color: "#FFF", textAlign: "center", fontWeight: "900", fontSize: 18 }}>
          {t.joinNow}
        </Text>
      </Pressable>

      <Pressable
        onPress={async () => {
          try {
            // 1. 強制登出 Firebase Auth 帳號
            await signOut(auth); 
            
            // 2. 清除登入頁面之前的歷史堆疊，強制回到登入頁
            // 💡 根據你的目錄結構，路徑應為 "/(auth)/login"
            router.replace("/(auth)/login"); 
          } catch (error) {
            console.error("登出失敗:", error);
            // 即使登出 API 失敗，通常也建議強制跳轉回登入頁以防卡死
            router.replace("/(auth)/login");
          }
        }}
        style={({ pressed }) => ({
          marginTop: 10,
          padding: 12,
          opacity: pressed ? 0.6 : 1, // 加入簡單的點擊回饋
        })}
      >
        <Text style={{ color: "#666", textAlign: "center", fontWeight: "700", fontSize: 16 }}>
          {t.backToLoginPage}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
