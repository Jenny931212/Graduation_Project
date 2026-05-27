import { auth, db } from "@/firebase/firebaseConfig";
import { useAuth } from "@/src/auth/useAuth";
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

function genInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function genPatientsId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function CareTargetCreateScreen() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = translations[language];
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const onCreate = async () => {
    if (!user) return;

    if (user.role !== "family") {
      Alert.alert(t.cannotCreate, t.createFamilyOnly);
      return;
    }

    const trimmedName = name.trim();
    const trimmedNotes = notes.trim();

    if (!trimmedName) {
      Alert.alert(t.prompt, t.enterElderName);
      return;
    }

    const code = genInviteCode();

    try {
      let emergencyPhone1 = "";
      let emergencyPhone2 = "";

      try {
        const q = query(collection(db, "users"), where("uid", "==", user.uid));
        const snap = await getDocs(q);

        if (!snap.empty) {
          const userData = snap.docs[0].data() as any;
          emergencyPhone1 = String(userData.emergencyPhone1 ?? "").trim();
          emergencyPhone2 = String(userData.emergencyPhone2 ?? "").trim();
        }
      } catch (e) {
        console.log("load family emergency phones failed:", e);
      }

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");

      const timeString = `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;

      let patientsId = "";
      let patientRef;
      let customDocId = "";

      for (let i = 0; i < 10; i++) {
        const newPatientsId = genPatientsId();
        const last4 = newPatientsId.slice(-4);
        const newDocId = `${timeString}_pat_${last4}`;
        const newRef = doc(db, "patients", newDocId);

        const existed = await getDocs(query(collection(db, "patients"), where("patientsId", "==", newPatientsId)));
        if (existed.empty) {
          patientsId = newPatientsId;
          customDocId = newDocId;
          patientRef = newRef;
          break;
        }
      }

      if (!patientsId || !patientRef || !customDocId) {
        throw new Error("failed to generate unique patientsId");
      }

      const payload = {
        patientsId,
        name: trimmedName,
        notes: trimmedNotes,
        inviteCode: code,
        caregivers: [],
        families: [user.uid],
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        emergencyPhone1,
        emergencyPhone2,
      };

      await setDoc(patientRef, payload);

      try {
        const q = query(collection(db, "users"), where("uid", "==", user.uid));
        const snap = await getDocs(q);

        if (snap.empty) {
          throw new Error("user not found");
        }

        const userDocRef = doc(db, "users", snap.docs[0].id);

        await updateDoc(userDocRef, {
          activePatientId: customDocId,
        });
      } catch (e) {
        console.log("sync activePatientId error:", e);
      }

      Alert.alert(
        t.createSuccess,
        `${trimmedName}\n${t.inviteCode}：${code}`,
        [
          {
            text: t.copyAndEnterHome,
            onPress: async () => {
              await Clipboard.setStringAsync(code);
              router.replace("/family");
            },
          },
        ]
      );
    } catch (e: any) {
      console.log("create patient error:", e);

      if (e?.code === "permission-denied") {
        Alert.alert(t.createFailed, t.noCreatePermission);
        return;
      }

      Alert.alert(t.createFailed, t.tryLater);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 90, gap: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: "900" }}>{t.createCareTarget}</Text>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: "#444" }}>{t.elderName}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t.elderNamePlaceholder}
          style={{
            borderWidth: 1,
            borderColor: "#DDD",
            borderRadius: 12,
            padding: 16,
            fontSize: 16,
            backgroundColor: "#FFF",
          }}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: "#444" }}>{t.careNotesOptional}</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={t.careNotesPlaceholder}
          multiline
          numberOfLines={4}
          style={{
            borderWidth: 1,
            borderColor: "#DDD",
            borderRadius: 12,
            padding: 16,
            fontSize: 16,
            backgroundColor: "#FFF",
            height: 120,
            textAlignVertical: "top",
          }}
        />
      </View>

      <Pressable
        onPress={onCreate}
        disabled={!name.trim()}
        style={{
          backgroundColor: name.trim() ? "#007AFF" : "#CCC",
          padding: 18,
          borderRadius: 12,
          marginTop: 10,
        }}
      >
        <Text style={{ color: "#FFF", textAlign: "center", fontWeight: "900", fontSize: 18 }}>
          {t.confirmCreate}
        </Text>
      </Pressable>

      <Pressable
        onPress={async () => {
          try {
            await signOut(auth);
            router.replace("/login");
          } catch (error) {
            console.error("登出失敗:", error);
          }
        }}
      >
        <Text style={{ color: "#666", textAlign: "center", fontWeight: "700" }}>{t.logoutAndBack}</Text>
      </Pressable>
    </ScrollView>
  );
}
