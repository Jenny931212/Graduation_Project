import { db } from "@/firebase/firebaseConfig";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { translations, type Language } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type CareHandbookForm = {
  dailyRoutine: string;
  medicationNotes: string;
  dietNotes: string;
  mobilityNotes: string;
  hygieneNotes: string;
  sleepNotes: string;
  communicationNotes: string;
  emergencyNotes: string;
  otherNotes: string;
};

type CareHandbookDocument = CareHandbookForm & {
  patientId: string;
  updatedAt?: unknown;
  updatedBy: string;
};

type HandbookField = keyof CareHandbookForm;
type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const EMPTY_HANDBOOK: CareHandbookDocument = {
  patientId: "",
  dailyRoutine: "",
  medicationNotes: "",
  dietNotes: "",
  mobilityNotes: "",
  hygieneNotes: "",
  sleepNotes: "",
  communicationNotes: "",
  emergencyNotes: "",
  otherNotes: "",
  updatedBy: "",
};

const localeByLanguage: Record<Language, string> = {
  zh: "zh-TW",
  en: "en-US",
  vi: "vi-VN",
  id: "id-ID",
};

function safeTimestampToDate(value: unknown): Date | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { toDate?: () => unknown };
  if (typeof candidate.toDate !== "function") return null;
  try {
    const date = candidate.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

export default function CaregiverHandbookScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const t = translations[language];
  const { ready, activePatient, activePatientId } = useActiveCareTarget();
  const [handbook, setHandbook] = useState<CareHandbookDocument>(EMPTY_HANDBOOK);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const categories: { key: HandbookField; label: string; icon: IoniconName }[] = [
    { key: "dailyRoutine", label: t.dailyRoutine, icon: "time-outline" },
    { key: "medicationNotes", label: t.medicationNotes, icon: "medkit-outline" },
    { key: "dietNotes", label: t.dietNotes, icon: "restaurant-outline" },
    { key: "mobilityNotes", label: t.mobilityNotes, icon: "walk-outline" },
    { key: "hygieneNotes", label: t.hygieneNotes, icon: "water-outline" },
    { key: "sleepNotes", label: t.sleepNotes, icon: "moon-outline" },
    { key: "communicationNotes", label: t.communicationNotes, icon: "chatbubbles-outline" },
    { key: "emergencyNotes", label: t.emergencyNotes, icon: "alert-circle-outline" },
    { key: "otherNotes", label: t.otherNotes, icon: "information-circle-outline" },
  ];

  useEffect(() => {
    setHandbook(EMPTY_HANDBOOK);
    setLoadError(false);

    if (!ready || !activePatientId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, "patients", activePatientId, "care_handbook", "main"),
      (snapshot) => {
        if (!snapshot.exists()) {
          setHandbook({ ...EMPTY_HANDBOOK, patientId: activePatientId });
        } else {
          const data = snapshot.data();
          setHandbook({
            patientId: typeof data.patientId === "string" ? data.patientId : activePatientId,
            dailyRoutine: typeof data.dailyRoutine === "string" ? data.dailyRoutine : "",
            medicationNotes: typeof data.medicationNotes === "string" ? data.medicationNotes : "",
            dietNotes: typeof data.dietNotes === "string" ? data.dietNotes : "",
            mobilityNotes: typeof data.mobilityNotes === "string" ? data.mobilityNotes : "",
            hygieneNotes: typeof data.hygieneNotes === "string" ? data.hygieneNotes : "",
            sleepNotes: typeof data.sleepNotes === "string" ? data.sleepNotes : "",
            communicationNotes: typeof data.communicationNotes === "string" ? data.communicationNotes : "",
            emergencyNotes: typeof data.emergencyNotes === "string" ? data.emergencyNotes : "",
            otherNotes: typeof data.otherNotes === "string" ? data.otherNotes : "",
            updatedAt: data.updatedAt,
            updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : "",
          });
        }
        setLoadError(false);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to listen to care handbook:", error);
        setLoadError(true);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [activePatientId, ready]);

  const visibleCategories = categories.filter(({ key }) => handbook[key].trim().length > 0);
  const updatedDate = safeTimestampToDate(handbook.updatedAt);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color="#163B3C" />
          <Text style={styles.backText}>{t.back}</Text>
        </Pressable>
        <Text style={styles.title}>{t.handbook}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}>
        <View style={styles.introCard}>
          <Text style={styles.patientName}>{activePatient?.name ?? "—"}</Text>
          <Text style={styles.description}>{t.handbookCaregiverDescription}</Text>
        </View>

        {!ready || loading ? (
          <ActivityIndicator size="large" color="#2A9D8F" style={styles.loader} />
        ) : loadError ? (
          <View style={styles.stateCard}>
            <Ionicons name="cloud-offline-outline" size={42} color="#B42318" />
            <Text style={styles.errorText}>{t.handbookLoadFailed}</Text>
          </View>
        ) : !activePatientId ? (
          <View style={styles.stateCard}>
            <Text style={styles.errorText}>{t.resultNoPatient}</Text>
          </View>
        ) : visibleCategories.length === 0 ? (
          <View style={styles.stateCard}>
            <Ionicons name="book-outline" size={48} color="#6B8E8C" />
            <Text style={styles.emptyTitle}>{t.handbookEmptyTitle}</Text>
            <Text style={styles.emptyMessage}>{t.handbookEmptyMessage}</Text>
          </View>
        ) : (
          <>
            {visibleCategories.map(({ key, label, icon }) => (
              <View key={key} style={styles.categoryCard}>
                <View style={styles.iconCircle}>
                  <Ionicons name={icon} size={25} color="#18766D" />
                </View>
                <View style={styles.categoryText}>
                  <Text style={styles.categoryTitle}>{label}</Text>
                  <Text style={styles.categoryContent}>{handbook[key]}</Text>
                </View>
              </View>
            ))}
            {updatedDate && (
              <Text style={styles.updatedText}>
                {t.lastUpdated}: {updatedDate.toLocaleString(localeByLanguage[language])}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F2F7F6" },
  header: {
    minHeight: 86,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: "#DDE8E6",
  },
  backButton: { flex: 1, flexDirection: "row", alignItems: "center" },
  backText: { color: "#163B3C", fontSize: 16, fontWeight: "600" },
  title: { color: "#163B3C", fontSize: 22, fontWeight: "800" },
  headerSpacer: { flex: 1 },
  content: { padding: 18 },
  introCard: {
    backgroundColor: "#DDF3EF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#A9DAD3",
    padding: 18,
    marginBottom: 18,
  },
  patientName: { color: "#135E57", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  description: { color: "#315F5C", fontSize: 15, lineHeight: 22 },
  loader: { marginVertical: 48 },
  stateCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DDE8E6",
  },
  errorText: { color: "#B42318", textAlign: "center", fontSize: 16, marginTop: 12 },
  emptyTitle: { color: "#244E4B", fontSize: 19, fontWeight: "800", marginTop: 14 },
  emptyMessage: { color: "#607572", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 7 },
  categoryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE8E6",
    padding: 16,
    marginBottom: 13,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#DDF3EF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  categoryText: { flex: 1 },
  categoryTitle: { color: "#1E4C48", fontSize: 17, fontWeight: "800", marginBottom: 7 },
  categoryContent: { color: "#334B49", fontSize: 16, lineHeight: 24 },
  updatedText: { color: "#6A7D7B", fontSize: 13, textAlign: "center", marginTop: 10 },
});
