import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { doc, getDoc, updateDoc } from "firebase/firestore";

import { db } from "@/firebase/firebaseConfig";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";

export default function FamilyEmergencyContactsScreen() {
  const { language } = useLanguage();
  const t = translations[language];
  const { ready, linkedCareTargets, activePatientId } = useActiveCareTarget();

  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready) return;

    if (selectedPatientId && linkedCareTargets.some((item) => item.id === selectedPatientId)) {
      return;
    }

    setSelectedPatientId(activePatientId ?? linkedCareTargets[0]?.id ?? "");
  }, [ready, activePatientId, linkedCareTargets, selectedPatientId]);

  useEffect(() => {
    if (!selectedPatientId) {
      setPhone1("");
      setPhone2("");
      return;
    }

    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const snap = await getDoc(doc(db, "patients", selectedPatientId));
        if (!alive) return;

        if (snap.exists()) {
          const data = snap.data() as any;
          setPhone1(String(data.emergencyPhone1 ?? ""));
          setPhone2(String(data.emergencyPhone2 ?? ""));
        }
      } catch (error) {
        console.log("load emergency contacts failed:", error);
        if (alive) Alert.alert(t.resultErrorTitle, t.emergencyContactsLoadFailed);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatientId]);

  const canSave = useMemo(
    () => !!selectedPatientId && !loading && !saving,
    [selectedPatientId, loading, saving]
  );

  const handleSave = async () => {
    if (!selectedPatientId) return;

    const trimmed1 = phone1.trim();
    const trimmed2 = phone2.trim();

    if (!trimmed1 || !trimmed2) {
      Alert.alert(t.prompt, t.familyPhoneValidation);
      return;
    }

    try {
      setSaving(true);
      await updateDoc(doc(db, "patients", selectedPatientId), {
        emergencyPhone1: trimmed1,
        emergencyPhone2: trimmed2,
      });
      setPhone1(trimmed1);
      setPhone2(trimmed2);
      Alert.alert(t.saveSuccessTitle, t.saveSuccessMessage);
    } catch (error) {
      console.log("save emergency contacts failed:", error);
      Alert.alert(t.resultErrorTitle, t.emergencyContactsSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color="#333" />
          <Text style={styles.backText}>{t.back}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t.emergencyPhoneSettings}</Text>
        <Text style={styles.subtitle}>{t.emergencyContactsSubtitle}</Text>

        {!ready ? (
          <Text style={styles.messageText}>{t.loading}</Text>
        ) : linkedCareTargets.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>{t.emergencyContactsNoPatient}</Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.push("/care-target/create" as any)}
            >
              <Text style={styles.primaryBtnText}>{t.createCareTarget}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {linkedCareTargets.length > 1 && (
              <View style={styles.patientPickerBlock}>
                <Text style={styles.label}>{t.emergencyContactsSelectPatient}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.patientChipsRow}
                  style={styles.patientChipsWrap}
                >
                  {linkedCareTargets.map((patient) => {
                    const active = patient.id === selectedPatientId;
                    return (
                      <Pressable
                        key={patient.id}
                        style={[
                          styles.patientChip,
                          active ? styles.patientChipActive : styles.patientChipInactive,
                        ]}
                        onPress={() => setSelectedPatientId(patient.id)}
                      >
                        <Text
                          style={[
                            styles.patientChipText,
                            active ? styles.patientChipTextActive : styles.patientChipTextInactive,
                          ]}
                        >
                          {patient.name || t.unknown}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <View style={styles.card}>
              {loading ? (
                <Text style={styles.messageText}>{t.loading}</Text>
              ) : (
                <>
                  <View style={styles.inputBox}>
                    <Text style={styles.label}>{t.emergencyPhone1}</Text>
                    <TextInput
                      style={styles.input}
                      value={phone1}
                      onChangeText={setPhone1}
                      keyboardType="phone-pad"
                      placeholder={t.emergencyPhonePlaceholder1}
                      placeholderTextColor="#999"
                    />
                  </View>

                  <View style={styles.inputBox}>
                    <Text style={styles.label}>{t.emergencyPhone2}</Text>
                    <TextInput
                      style={styles.input}
                      value={phone2}
                      onChangeText={setPhone2}
                      keyboardType="phone-pad"
                      placeholder={t.emergencyPhonePlaceholder2}
                      placeholderTextColor="#999"
                    />
                  </View>
                </>
              )}
            </View>

            <Pressable
              style={[styles.primaryBtn, !canSave && styles.primaryBtnDisabled]}
              disabled={!canSave}
              onPress={handleSave}
            >
              <Text style={styles.primaryBtnText}>{saving ? t.loading : t.save}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    height: 100,
    paddingTop: 50,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  backBtn: { flexDirection: "row", alignItems: "center" },
  backText: { fontSize: 20, fontWeight: "bold", color: "#333", marginLeft: 2 },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#000",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginTop: -8,
  },
  card: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: "#fff",
    gap: 16,
  },
  inputBox: { gap: 8 },
  label: { fontSize: 15, color: "#666", fontWeight: "600" },
  input: {
    backgroundColor: "#F5F5F5",
    padding: 14,
    borderRadius: 12,
    fontSize: 16,
    color: "#333",
  },
  patientPickerBlock: { gap: 8 },
  patientChipsWrap: { flexGrow: 0, flexShrink: 0 },
  patientChipsRow: { flexGrow: 0, gap: 8, paddingVertical: 2 },
  patientChip: {
    flexShrink: 0,
    flexGrow: 0,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
  },
  patientChipActive: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  patientChipInactive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DDD",
  },
  patientChipText: { fontSize: 14, fontWeight: "700" },
  patientChipTextActive: { color: "#FFFFFF" },
  patientChipTextInactive: { color: "#444" },
  primaryBtn: {
    backgroundColor: "#007AFF",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryBtnDisabled: {
    backgroundColor: "#B8D4FF",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  emptyText: {
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
  },
  messageText: {
    fontSize: 15,
    color: "#666",
  },
});
