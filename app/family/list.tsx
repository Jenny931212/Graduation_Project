import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, StatusBar, Alert } from "react-native";
import { router } from "expo-router";
import { collection, onSnapshot, orderBy, query, where, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "@/firebase/firebaseConfig";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { useAuthContext } from "@/src/auth/AuthProvider";
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";
import { Ionicons } from "@expo/vector-icons";

async function deletePrescriptionCascade(prescriptionId: string) {
  const batch = writeBatch(db);

  const itemsSnap = await getDocs(collection(db, "prescriptions", prescriptionId, "items"));
  itemsSnap.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  const remindersSnap = await getDocs(
    query(collection(db, "medication_reminders"), where("prescriptionId", "==", prescriptionId))
  );
  remindersSnap.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  const logsSnap = await getDocs(
    query(collection(db, "medication_logs"), where("prescriptionId", "==", prescriptionId))
  );
  logsSnap.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  batch.delete(doc(db, "prescriptions", prescriptionId));
  await batch.commit();
}

export default function FamilyListScreen() {
  const { activePatientId } = useActiveCareTarget();
  const { ready } = useAuthContext();
  const { language } = useLanguage();
  const t = translations[language];
  const [list, setList] = useState<any[]>([]);

  useEffect(() => {
    if (!activePatientId) return;

    const q = query(
      collection(db, "prescriptions"),
      where("patientId", "==", activePatientId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setList(snap.docs.map(d => {
        const data = d.data() as any;
        return {
          prescriptionId: d.id,
          title: data.title || t.cameraDefaultDraftTitle,
          createdAt: data.createdAt,
        };
      }));
    });
    return unsub;
  }, [activePatientId, t.cameraDefaultDraftTitle]);

  const handleDelete = (id: string) => {
    Alert.alert(t.deletePrescriptionTitle, t.deletePrescriptionMessage, [
      { text: t.cancel, style: "cancel" },
      { text: t.deleteConfirm, style: "destructive", onPress: async () => {
        try {
          await deletePrescriptionCascade(id);
        } catch (e) {
          Alert.alert(t.resultErrorTitle, t.deleteFailed);
        }
      }}
    ]);
  };

  if (!ready) return <View style={styles.center}><Text>{t.loading}</Text></View>;

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
        {list.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={60} color="#CCC" />
            <Text style={styles.emptyText}>{t.noPrescriptionRecords}</Text>
          </View>
        ) : (
          list.map((p) => (
            <View key={p.prescriptionId} style={styles.card}>
              <View style={{ gap: 4 }}>
                <Text style={styles.cardTitle}>{p.title || t.prescriptionName}</Text>
                <Text style={styles.cardDate}>
                  {t.date}：{
                    typeof p.createdAt === 'string' 
                      ? p.createdAt 
                      : (p.createdAt?.seconds 
                          ? new Date(p.createdAt.seconds * 1000).toLocaleDateString() 
                          : t.unknown)
                  }
                </Text>
              </View>
              {/* 💡 底部按鈕排版 */}
              <View style={styles.cardFooter}>
                <Pressable onPress={() => router.push({ pathname: "/family/detail", params: { id: p.prescriptionId } })}>
                  <Text style={styles.detailText}>{t.viewDetails}</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(p.prescriptionId)}>
                  <Text style={styles.deleteText}>{t.delete}</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { 
    backgroundColor: "#F4E770", 
    height: 100, 
    paddingTop: 50, 
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: { flexDirection: "row", alignItems: "center" },
  backText: { fontSize: 20, fontWeight: 'bold', color: '#000', marginLeft: 2 },
  scrollContent: { padding: 20, gap: 15 },
  emptyContainer: { marginTop: 100, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { fontSize: 18, fontWeight: "bold", color: "#666" },
  card: { 
    padding: 18, 
    borderRadius: 15, 
    borderWidth: 1, 
    borderColor: "#E0E0E0", 
    backgroundColor: "#fff", 
    gap: 12 
  },
  cardTitle: { fontSize: 20, fontWeight: "bold", color: "#333" },
  cardDate: { fontSize: 14, color: "#999" },
  cardFooter: { 
    flexDirection: "row", 
    borderTopWidth: 1, 
    borderTopColor: "#EEE", 
    paddingTop: 10, 
    gap: 15 
  },
  detailText: { color: "#007AFF", fontWeight: "bold", fontSize: 16 },
  deleteText: { color: "#FF3B30", fontWeight: "bold", fontSize: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" }
});
