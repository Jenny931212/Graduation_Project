import { db } from "@/firebase/firebaseConfig";
import { useAuth } from "@/src/auth/useAuth";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
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

type FormField = keyof CareHandbookForm;

const EMPTY_FORM: CareHandbookForm = {
  dailyRoutine: "",
  medicationNotes: "",
  dietNotes: "",
  mobilityNotes: "",
  hygieneNotes: "",
  sleepNotes: "",
  communicationNotes: "",
  emergencyNotes: "",
  otherNotes: "",
};

export default function FamilyHandbookScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const t = translations[language];
  const { user } = useAuth();
  const { ready, activePatient, activePatientId } = useActiveCareTarget();
  const [form, setForm] = useState<CareHandbookForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const fields: { key: FormField; label: string; placeholder: string }[] = [
    { key: "dailyRoutine", label: t.dailyRoutine, placeholder: t.dailyRoutinePlaceholder },
    { key: "medicationNotes", label: t.medicationNotes, placeholder: t.medicationNotesPlaceholder },
    { key: "dietNotes", label: t.dietNotes, placeholder: t.dietNotesPlaceholder },
    { key: "mobilityNotes", label: t.mobilityNotes, placeholder: t.mobilityNotesPlaceholder },
    { key: "hygieneNotes", label: t.hygieneNotes, placeholder: t.hygieneNotesPlaceholder },
    { key: "sleepNotes", label: t.sleepNotes, placeholder: t.sleepNotesPlaceholder },
    { key: "communicationNotes", label: t.communicationNotes, placeholder: t.communicationNotesPlaceholder },
    { key: "emergencyNotes", label: t.emergencyNotes, placeholder: t.emergencyNotesPlaceholder },
    { key: "otherNotes", label: t.otherNotes, placeholder: t.otherNotesPlaceholder },
  ];

  useEffect(() => {
    let cancelled = false;
    setForm(EMPTY_FORM);
    setLoadError(false);

    if (!ready || !activePatientId) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void getDoc(doc(db, "patients", activePatientId, "care_handbook", "main"))
      .then((snapshot) => {
        if (cancelled || !snapshot.exists()) return;
        const data = snapshot.data();
        setForm({
          dailyRoutine: typeof data.dailyRoutine === "string" ? data.dailyRoutine : "",
          medicationNotes: typeof data.medicationNotes === "string" ? data.medicationNotes : "",
          dietNotes: typeof data.dietNotes === "string" ? data.dietNotes : "",
          mobilityNotes: typeof data.mobilityNotes === "string" ? data.mobilityNotes : "",
          hygieneNotes: typeof data.hygieneNotes === "string" ? data.hygieneNotes : "",
          sleepNotes: typeof data.sleepNotes === "string" ? data.sleepNotes : "",
          communicationNotes: typeof data.communicationNotes === "string" ? data.communicationNotes : "",
          emergencyNotes: typeof data.emergencyNotes === "string" ? data.emergencyNotes : "",
          otherNotes: typeof data.otherNotes === "string" ? data.otherNotes : "",
        });
      })
      .catch((error: unknown) => {
        console.error("Failed to load care handbook:", error);
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activePatientId, ready]);

  const updateField = (key: FormField, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveHandbook = async () => {
    if (saving) return;
    if (!user) {
      Alert.alert(t.resultErrorTitle, t.resultNotLoggedIn);
      return;
    }
    if (!activePatientId) {
      Alert.alert(t.resultErrorTitle, t.resultNoPatient);
      return;
    }

    const trimmedForm = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value.trim()])
    ) as CareHandbookForm;

    try {
      setSaving(true);
      await setDoc(
        doc(db, "patients", activePatientId, "care_handbook", "main"),
        {
          patientId: activePatientId,
          ...trimmedForm,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );
      setForm(trimmedForm);
      Alert.alert(t.handbookSavedTitle, t.handbookSavedMessage);
    } catch (error: unknown) {
      console.error("Failed to save care handbook:", error);
      Alert.alert(t.resultErrorTitle, t.handbookSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color="#2F2F2F" />
          <Text style={styles.backText}>{t.back}</Text>
        </Pressable>
        <Text style={styles.title}>{t.handbook}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.introCard}>
          <Text style={styles.patientName}>{activePatient?.name ?? "—"}</Text>
          <Text style={styles.description}>{t.handbookDescription}</Text>
        </View>

        {!ready || loading ? (
          <ActivityIndicator size="large" color="#F5A623" style={styles.loader} />
        ) : loadError ? (
          <Text style={styles.errorText}>{t.handbookLoadFailed}</Text>
        ) : !activePatientId ? (
          <Text style={styles.errorText}>{t.resultNoPatient}</Text>
        ) : (
          <>
            {fields.map((field) => (
              <View key={field.key} style={styles.inputCard}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <TextInput
                  value={form[field.key]}
                  onChangeText={(value) => updateField(field.key, value)}
                  placeholder={field.placeholder}
                  placeholderTextColor="#9CA3AF"
                  multiline
                  textAlignVertical="top"
                  style={styles.input}
                />
              </View>
            ))}

            <Pressable
              style={({ pressed }) => [
                styles.saveButton,
                (pressed || saving) && styles.saveButtonPressed,
              ]}
              onPress={() => void saveHandbook()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons name="save-outline" size={22} color="#FFFFFF" />
              )}
              <Text style={styles.saveButtonText}>{saving ? t.saving : t.saveHandbook}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F7F7" },
  header: {
    minHeight: 86,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: { flex: 1, flexDirection: "row", alignItems: "center" },
  backText: { color: "#2F2F2F", fontSize: 16, fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "800", color: "#242424" },
  headerSpacer: { flex: 1 },
  content: { padding: 18 },
  introCard: {
    backgroundColor: "#FFF5E3",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F5C66F",
    padding: 18,
    marginBottom: 18,
  },
  patientName: { fontSize: 22, fontWeight: "800", color: "#8A5400", marginBottom: 8 },
  description: { fontSize: 15, lineHeight: 22, color: "#604A2A" },
  loader: { marginVertical: 48 },
  errorText: { textAlign: "center", color: "#B42318", fontSize: 16, marginVertical: 36 },
  inputCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E4E8",
    padding: 16,
    marginBottom: 14,
  },
  fieldLabel: { fontSize: 17, fontWeight: "700", color: "#333333", marginBottom: 10 },
  input: {
    minHeight: 92,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D9DCE1",
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 23,
    color: "#222222",
  },
  saveButton: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: "#F5A623",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 8,
  },
  saveButtonPressed: { opacity: 0.68 },
  saveButtonText: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
});
