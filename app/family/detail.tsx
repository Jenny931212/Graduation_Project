import React, { useState, useCallback } from "react";
import { View, Text, Pressable, ScrollView, Image, StyleSheet, StatusBar } from "react-native";
import { router, useLocalSearchParams, useFocusEffect, Tabs } from "expo-router"; 
import { doc, getDoc, collection, getDocs, query } from "firebase/firestore";
import { db } from "@/firebase/firebaseConfig";
import { useAuthContext } from "@/src/auth/AuthProvider";
import {
  ensureFirestoreTranslations,
  PRESCRIPTION_ITEM_TRANSLATION_SPECS,
} from "@/src/i18n/dynamicTranslation";
import { pickLocalizedString, translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";
import { Ionicons } from "@expo/vector-icons";

export default function FamilyDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { ready } = useAuthContext();
  const { language } = useLanguage();
  const t = translations[language];
  const [p, setP] = useState<any | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const presRef = doc(db, "prescriptions", id);
      const presSnap = await getDoc(presRef);
      
      if (presSnap.exists()) {
        const data = presSnap.data() as any;

        // 1. 抓取子集合資料
        const itemsSnap = await getDocs(query(collection(db, "prescriptions", id, "items")));
        const translatedItems = await Promise.all(
          itemsSnap.docs.map(async (d) => {
            const raw = d.data() as any;
            const translated = await ensureFirestoreTranslations(
              doc(db, "prescriptions", id, "items", d.id),
              raw,
              language,
              PRESCRIPTION_ITEM_TRANSLATION_SPECS
            );
            return { raw: { ...raw, ...translated } };
          })
        );
        const mappedItems = translatedItems.map((d) => {
          const raw = d.raw;
          const it = {
            ...raw,
            drug_name: pickLocalizedString(raw, "drug_name", language, raw.name ?? ""),
            dosage: raw.dose ?? raw.dosage ?? "",
            usage_zh: pickLocalizedString(raw, "usage", language),
            memo: pickLocalizedString(raw, "note", language),
          };
          return {
            raw,
            name: it.drug_name ?? it.name ?? t.unknownMedicine,
            dosage: it.dosage ?? it.dose ?? "",
            usage_zh: it.usage_zh ?? it.usage ?? "",
            memo: it.memo ?? it.note_zh ?? it.note ?? "",
          };
        });
        setP({ 
          ...data, 
          prescriptionId: presSnap.id, 
          items: mappedItems 
        });
      }
    } catch (error) {
      console.error("讀取詳情失敗:", error);
    }
  }, [id, language, t.unknownMedicine]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  if (!ready || !p) return <View style={styles.center}><Text>{t.loading}</Text></View>;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#333" />
          <Text style={styles.backText}>{t.back}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.mainTitle}>{p.title || t.prescriptionDetail}</Text>
            <Text style={styles.subInfo}>
              {t.recordDate}：{p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000).toLocaleDateString() : t.unknown}
            </Text>
          </View>
          <Pressable 
            onPress={() => router.push({
              pathname: "/family/edit",
              params: { id: p.prescriptionId, itemsJson: JSON.stringify(p.items) }
            })} 
            style={styles.editBtn}
          >
            <Text style={styles.editBtnText}>{t.edit}</Text>
          </Pressable>
        </View>

        {p.sourceImageUrl ? (
          <Image
            source={{ uri: p.sourceImageUrl }}
            style={styles.img}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.img, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }]}>
            <Ionicons name="image-outline" size={40} color="#ccc" />
            <Text style={{ color: '#999', marginTop: 8 }}>{t.noPrescriptionImage}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>{t.medicineContent}</Text>
        
        {p.items?.map((it: any, idx: number) => {
          // 💡 邏輯：將 usage_zh 以逗號拆分為「用法」與「時段」
          const usageString = it.usage_zh || "";
          const parts = usageString.includes(",") ? usageString.split(",") : [usageString, ""];
          const method = parts[0] || t.notSet;
          const timeDetail = parts.slice(1).join(",") || t.asDirectedUsage;

          return (
            <View key={idx} style={styles.itemCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.itemName} numberOfLines={2}>{it.name}</Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t.dosage}：</Text>
                <Text style={styles.infoValue}>{it.dosage}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t.method}：</Text>
                <Text style={styles.infoValue}>{method}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t.usageTime}：</Text>
                <Text style={styles.infoValue}>{timeDetail}</Text>
              </View>

              {it.memo ? (
                <View style={styles.noteBox}>
                  <Text style={styles.noteText}>{t.note}：{it.memo}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { 
    backgroundColor: "#F4E770", 
    height: 100, 
    paddingTop: 50, 
    paddingHorizontal: 15, 
    flexDirection: "row", 
    alignItems: "center" 
  },
  backButton: { flexDirection: "row", alignItems: "center", minWidth: 100 },
  backText: { fontSize: 20, fontWeight: 'bold', color: '#333', marginLeft: 2 },
  scrollContent: { padding: 20 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  mainTitle: { fontSize: 28, fontWeight: "900", color: "#333" },
  subInfo: { fontSize: 14, color: "#999", marginTop: 4 },
  editBtn: { backgroundColor: "#A7C7FF", paddingHorizontal: 18, paddingVertical: 8, borderRadius: 12 },
  editBtnText: { color: "#0863f6", fontWeight: "bold", fontSize: 16 },
  img: { 
    width: "100%", 
    height: 300,
    borderRadius: 15, 
    backgroundColor: "#f0f0f0", 
    marginBottom: 25,
  },
  sectionTitle: { fontSize: 22, fontWeight: "800", color: "#333", marginBottom: 15 },
  itemCard: { 
    padding: 18, 
    borderRadius: 16, 
    backgroundColor: "#F9F9F9", 
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#EEE"
  },
  cardHeader: { marginBottom: 10 },
  itemName: { fontSize: 19, fontWeight: "800", color: "#007AFF" },
  infoRow: { flexDirection: "row", marginBottom: 8, alignItems: 'flex-start' },
  infoLabel: { fontSize: 15, color: "#666", width: 85 },
  infoValue: { fontSize: 15, color: "#333", fontWeight: "600", flex: 1 },
  noteBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#EEE" },
  noteText: { fontSize: 14, color: "#888", fontStyle: "italic" }
});
