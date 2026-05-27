import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, Alert, StyleSheet, StatusBar } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuthContext } from "@/src/auth/AuthProvider";
import { Ionicons } from "@expo/vector-icons";
import { doc, collection, getDoc, getDocs, query, where, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase/firebaseConfig";
import { createMedicationReminders } from "@/src/reminders/createMedicationReminders";
import { pickLocalizedString, translations, type Language } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";

type EditItem = {
  itemId?: string;
  name: string;
  dosage: string;
  usage_type: string;
  usage_time: string;
  memo: string;
};

function safeParseItems(itemsJson: string | undefined, language: Language): EditItem[] {
  if (!itemsJson) return [{ itemId: undefined, name: "", dosage: "", usage_type: "", usage_time: "", memo: "" }];
  try {
    const data = JSON.parse(itemsJson);
    return data.map((it: any) => {
      const usage = pickLocalizedString(it.raw ?? it, "usage", language, it.usage_zh ?? it.usage ?? it.time_of_day ?? it.time ?? "");
      const parts = usage.includes(",") ? usage.split(",") : [usage, ""];
      return {
        itemId: it.itemId ?? it.id ?? undefined,
        name: pickLocalizedString(it.raw ?? it, "drug_name", language, it.drug_name_zh ?? it.drug_name ?? it.name ?? ""),
        dosage: it.dose ?? it.dosage ?? "",
        usage_type: parts[0] || "",
        usage_time: parts.slice(1).join(",") || "",
        memo: pickLocalizedString(it.raw ?? it, "note", language, it.note_zh ?? it.memo ?? it.note ?? ""),
      };
    });
  } catch (e) {
    return [{ itemId: undefined, name: "", dosage: "", usage_type: "", usage_time: "", memo: "" }];
  }
}

export default function CaregiverEditScreen() {
  const { id, itemsJson } = useLocalSearchParams<{ id?: string; itemsJson?: string }>();
  const { ready } = useAuthContext();
  const { language } = useLanguage();
  const t = translations[language];
  const initialItems = useMemo(() => safeParseItems(itemsJson, language), [itemsJson, language]);
  const [items, setItems] = useState<EditItem[]>(initialItems);

  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        const itemsSnap = await getDocs(query(collection(db, "prescriptions", id, "items")));
        const fetchedItems: EditItem[] = itemsSnap.docs.map((docSnap) => {
          const it = docSnap.data() as any;
          const usage = pickLocalizedString(it, "usage", language, it.usage_zh ?? it.usage ?? it.time_of_day ?? it.time ?? "");
          const parts = usage.includes(",") ? usage.split(",") : [usage, ""];

          return {
            itemId: docSnap.id,
            name: pickLocalizedString(it, "drug_name", language, it.drug_name_zh ?? it.drug_name ?? it.name ?? ""),
            dosage: it.dose ?? it.dosage ?? "",
            usage_type: parts[0] || "",
            usage_time: parts.slice(1).join(",") || "",
            memo: pickLocalizedString(it, "note", language, it.note_zh ?? it.memo ?? it.note ?? ""),
          };
        });

        if (fetchedItems.length > 0) {
          setItems(fetchedItems);
        }
      } catch (e) {
        console.log("caregiver edit load items error:", e);
      }
    })();
  }, [id, language]);

  const updateItem = (index: number, field: keyof EditItem, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSave = async () => {
    if (!id) return;
    try {
      const batch = writeBatch(db);
      const presRef = doc(db, "prescriptions", id);
      batch.update(presRef, { updatedAt: serverTimestamp() });

      items.forEach((it) => {
        if (!it.itemId) return;

        const itemRef = doc(db, "prescriptions", id, "items", it.itemId);
        const combinedUsage = `${it.usage_type}${it.usage_time ? "," + it.usage_time : ""}`;

        batch.update(itemRef, {
          drug_name_zh: it.name,
          drug_name: it.name,
          dose: it.dosage,
          dosage: it.dosage,
          usage_zh: combinedUsage,
          note_zh: it.memo,
          memo: it.memo,
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
      const presSnap = await getDoc(presRef);
      const patientId = String(presSnap.data()?.patientId ?? "");

      const remindersBatch = writeBatch(db);
      const remindersSnap = await getDocs(
        query(collection(db, "medication_reminders"), where("prescriptionId", "==", id))
      );
      remindersSnap.docs.forEach((docSnap) => {
        remindersBatch.delete(docSnap.ref);
      });
      await remindersBatch.commit();

      await createMedicationReminders({
        patientId,
        prescriptionId: id,
        items: items.map((it) => ({
          drug_name_zh: it.name,
          dose: it.dosage,
          time_of_day: `${it.usage_type}${it.usage_time ? "," + it.usage_time : ""}`,
        })),
      });
      Alert.alert(t.saveSuccessTitle, t.saveSuccessMessage, [{ text: t.confirm, onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert(t.resultErrorTitle, t.inputFailedCloud);
    }
  };

  if (!ready) return <View style={styles.center}><Text>{t.loading}</Text></View>;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color="#333" /><Text style={styles.backText}>{t.back}</Text>
        </Pressable>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>{t.editPrescriptionInfo}</Text>
        <Pressable onPress={handleSave} style={styles.saveBtn}><Text style={styles.saveBtnText}>{t.save}</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {items.map((it, idx) => (
          <View key={it.itemId ?? idx} style={styles.editCard}>
            <Text style={styles.itemTag}>{t.medicineItem} {idx + 1}</Text>
            <View style={styles.inputBox}><Text style={styles.label}>{t.medicineName}</Text><TextInput style={styles.input} value={it.name} onChangeText={(text) => updateItem(idx, "name", text)} /></View>
            <View style={styles.inputBox}><Text style={styles.label}>{t.dosage}</Text><TextInput style={styles.input} value={it.dosage} onChangeText={(text) => updateItem(idx, "dosage", text)} /></View>
            <View style={styles.inputBox}><Text style={styles.label}>{t.usageExample}</Text><TextInput style={styles.input} value={it.usage_type} onChangeText={(text) => updateItem(idx, "usage_type", text)} /></View>
            <View style={styles.inputBox}><Text style={styles.label}>{t.usageTimeExample}</Text><TextInput style={styles.input} value={it.usage_time} onChangeText={(text) => updateItem(idx, "usage_time", text)} /></View>
            <View style={styles.inputBox}><Text style={styles.label}>{t.note}</Text><TextInput style={[styles.input, styles.memoInput]} value={it.memo} multiline onChangeText={(text) => updateItem(idx, "memo", text)} /></View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { backgroundColor: "#FFE043", height: 100, paddingTop: 50, paddingHorizontal: 15, flexDirection: "row", alignItems: "center" },
  backBtn: { flexDirection: "row", alignItems: "center" },
  backText: { fontSize: 20, fontWeight: "bold", color: "#000", marginLeft: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 15 },
  pageTitle: { fontSize: 26, fontWeight: "900", color: "#000" },
  saveBtn: { backgroundColor: "#A7C7FF", paddingHorizontal: 18, paddingVertical: 8, borderRadius: 12 },
  saveBtnText: { color: "#0863f6", fontWeight: "bold", fontSize: 16 },
  scrollContent: { padding: 20, gap: 20 },
  editCard: { padding: 20, borderRadius: 20, borderWidth: 1, borderColor: "#E0E0E0", backgroundColor: "#fff", gap: 15 },
  itemTag: { color: "#007AFF", fontWeight: "bold", fontSize: 16 },
  inputBox: { gap: 8 },
  label: { fontSize: 15, color: "#666", fontWeight: "600" },
  input: { backgroundColor: "#F5F5F5", padding: 12, borderRadius: 10, fontSize: 16 },
  memoInput: { height: 80, textAlignVertical: "top" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
