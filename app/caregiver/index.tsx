// app/caregiver/index.tsx
import { db } from "@/firebase/firebaseConfig";
import { router } from "expo-router";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "@/src/auth/useAuth";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";

type CareTarget = {
  id: string;
  name: string;
  notes?: string;
  inviteCode?: string;
  createdAt?: number;
  updatedAt?: number;
};

type Reminder = {
  id: string;
  patientId: string;
  prescriptionId?: string;
  medicineName: string;
  doseText: string;
  scheduleTime: string;
  enabled: boolean;
  notifyUserIds?: string[];
  lastSentDate?: string;
  createdAt?: any;
};

type MedicationLog = {
  id: string;
  reminderId: string;
  patientId: string;
  dateKey: string;
};

function getTaipeiDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function hhmmToMinutes(hhmm?: string) {
  if (!hhmm || !hhmm.includes(":")) return Number.MAX_SAFE_INTEGER;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export default function CaregiverHomeScreen() {
  const { user } = useAuth();
  const { activePatient, activePatientId, ready } = useActiveCareTarget();
  const { language } = useLanguage();
  const t = translations[language];

  const [target, setTarget] = useState<CareTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ total: number; latest?: number }>({
    total: 0,
    latest: undefined,
  });

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [todayLogs, setTodayLogs] = useState<MedicationLog[]>([]);
  const [doneLoading, setDoneLoading] = useState(false);

  const todayKey = useMemo(() => getTaipeiDateKey(), []);

  // ==========================================
  // 邏輯：防呆與權限檢查 (沒有長輩則去加入)
  // ==========================================
  useEffect(() => {
    if (!ready) return;
    if (!user) return;

    setLoading(true);

    if (!activePatient || !activePatientId) {
      setTarget(null);
      setLoading(false);
      router.replace("/care-target/join");
      return;
    }

    setTarget(activePatient as CareTarget);
    setLoading(false);
  }, [ready, user, activePatient, activePatientId]);

  // ==========================================
  // 邏輯：監聽藥單數據
  // ==========================================
  useEffect(() => {
    if (!ready || !user || !activePatientId) {
      setStats({ total: 0, latest: undefined });
      return;
    }

    const q = query(
      collection(db, "prescriptions"),
      where("patientId", "==", activePatientId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => d.data());
        setStats({
          total: rows.length,
          latest: rows[0]?.createdAt,
        });
      },
      (err) => {
        console.log("caregiver home firestore error:", err);
        setStats({ total: 0, latest: undefined });
      }
    );

    return unsub;
  }, [ready, user, activePatientId]);

  // ==========================================
  // 邏輯：監聽目前長輩的提醒
  // ==========================================
  useEffect(() => {
    if (!ready || !user || !activePatientId) {
      setReminders([]);
      return;
    }

    const q = query(
      collection(db, "medication_reminders"),
      where("patientId", "==", activePatientId),
      where("enabled", "==", true)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Reminder[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            patientId: data.patientId ?? "",
            prescriptionId: data.prescriptionId ?? "",
            medicineName: data.medicineName ?? t.unknownMedicine,
            doseText: data.doseText ?? "",
            scheduleTime: data.scheduleTime ?? "",
            enabled: !!data.enabled,
            notifyUserIds: Array.isArray(data.notifyUserIds)
              ? data.notifyUserIds
              : [],
            lastSentDate: data.lastSentDate ?? "",
            createdAt: data.createdAt,
          };
        });

        rows.sort(
          (a, b) =>
            hhmmToMinutes(a.scheduleTime) - hhmmToMinutes(b.scheduleTime)
        );

        setReminders(rows);
      },
      (err) => {
        console.log("reminders snapshot error:", err);
        setReminders([]);
      }
    );

    return unsub;
  }, [ready, user, activePatientId, t.unknownMedicine]);

  // ==========================================
  // 邏輯：監聽今天已完成的服藥紀錄
  // ==========================================
  useEffect(() => {
    if (!ready || !user || !activePatientId) {
      setTodayLogs([]);
      return;
    }

    const q = query(
      collection(db, "medication_logs"),
      where("patientId", "==", activePatientId),
      where("dateKey", "==", todayKey)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: MedicationLog[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            reminderId: data.reminderId ?? "",
            patientId: data.patientId ?? "",
            dateKey: data.dateKey ?? "",
          };
        });
        setTodayLogs(rows);
      },
      (err) => {
        console.log("medication logs snapshot error:", err);
        setTodayLogs([]);
      }
    );

    return unsub;
  }, [ready, user, activePatientId, todayKey]);

  const currentReminder = useMemo(() => {
    if (!reminders.length) return null;

    // 先挑今天還沒完成的第一筆
    const unfinished = reminders.find(
      (r) => !todayLogs.some((log) => log.reminderId === r.id)
    );

    return unfinished ?? reminders[0] ?? null;
  }, [reminders, todayLogs]);

  const currentReminderDone = useMemo(() => {
    if (!currentReminder) return false;
    return todayLogs.some((log) => log.reminderId === currentReminder.id);
  }, [currentReminder, todayLogs]);

  async function handleDonePress() {
    if (!user) {
      Alert.alert(t.cameraNotLoggedInTitle, t.resultNotLoggedIn);
      return;
    }

    if (!activePatientId) {
      Alert.alert(t.cameraNoPatientTitle, t.resultNoPatient);
      return;
    }

    if (!currentReminder) {
      Alert.alert(t.noReminder, t.noReminderAvailable);
      return;
    }

    if (currentReminderDone) {
      Alert.alert(t.alreadyDone, t.reminderAlreadyDone);
      return;
    }

    try {
      setDoneLoading(true);

      await addDoc(collection(db, "medication_logs"), {
        reminderId: currentReminder.id,
        prescriptionId: currentReminder.prescriptionId ?? "",
        patientId: activePatientId,
        medicineName: currentReminder.medicineName,
        doseText: currentReminder.doseText,
        scheduleTime: currentReminder.scheduleTime,
        status: "taken",
        confirmedBy: user.uid,
        takenAt: serverTimestamp(),
        dateKey: todayKey,
        createdAt: serverTimestamp(),
      });

      Alert.alert(t.alreadyDone, t.doneRecorded);
    } catch (error) {
      console.log("done error:", error);
      Alert.alert(t.resultErrorTitle, t.recordFailed);
    } finally {
      setDoneLoading(false);
    }
  }

  if (loading || !ready) {
    return <ActivityIndicator style={{ flex: 1, justifyContent: "center" }} />;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 使用者姓名 (移除了原本的 Header) */}
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{target?.name ?? t.noSelectedPatient}</Text>
        </View>

        {/* 用藥提醒卡片 */}
        <View style={styles.reminderCard}>
          <View style={styles.reminderTitleRow}>
            <Text style={styles.emojiLarge}>⏰</Text>
            <Text style={styles.reminderTitle}>
              {currentReminder
                ? `${currentReminder.scheduleTime} ${t.reminder}`
                : t.noReminder}
            </Text>
          </View>

          <View style={styles.reminderSubRow}>
            <Text style={styles.emojiMedium}>💊</Text>
            <Text style={styles.reminderSubText}>
              {currentReminder
                ? `${currentReminder.medicineName} (${currentReminder.doseText || t.doseAsDirected})`
                : t.buildReminderByScan}
            </Text>
          </View>

          <Pressable
            style={[
              styles.doneBtn,
              (!currentReminder || currentReminderDone || doneLoading) && {
                opacity: 0.5,
              },
            ]}
            onPress={handleDonePress}
            disabled={!currentReminder || currentReminderDone || doneLoading}
          >
            <Text style={styles.doneBtnText}>
              {doneLoading
                ? "..."
                : currentReminderDone
                ? "DONE ✓"
                : "DONE"}
            </Text>
          </Pressable>
        </View>

        {/* 功能選單標題 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t.functionMenu}</Text>
        </View>

        {/* 掃描藥單 */}
        <Pressable
          onPress={() => router.push("/caregiver/camera")}
          style={styles.mainActionButton}
        >
          <Text style={styles.mainActionEmoji}>📷</Text>
          <Text style={styles.mainActionText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>{t.scanPrescription}</Text>
        </Pressable>

        {/* 2x2 功能網格 */}
        <View style={styles.gridContainer}>
          <View style={styles.gridRow}>
            <Pressable
              onPress={() => router.push("/caregiver/list")}
              style={[styles.gridItem, { backgroundColor: "#F4E770" }]}
            >
              <Text style={styles.gridEmoji}>📋</Text>
              <Text style={styles.gridText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{t.viewPrescriptionRecords}</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/caregiver/health-report" as any)}
              style={[styles.gridItem, { backgroundColor: "#EEAC6F" }]}
            >
              <Text style={styles.gridEmoji}>🩺</Text>
              <Text style={styles.gridText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{t.dailyHealthReport}</Text>
            </Pressable>
          </View>

          <View style={styles.gridRow}>
            <Pressable
              onPress={() =>
                router.push("/caregiver/communication-cards" as any)
              }
              style={[styles.gridItem, { backgroundColor: "#81E87A" }]}
            >
              <Text style={styles.gridEmoji}>🖼️</Text>
              <Text style={styles.gridText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{t.communicationCards}</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/caregiver/video-record" as any)}
              style={[styles.gridItem, { backgroundColor: "#7BC6F9" }]}
            >
              <Text style={styles.gridEmoji}>📹</Text>
              <Text style={styles.gridText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{t.conditionRecording}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ==========================================
// 樣式表
// ==========================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingBottom: 80,
    paddingTop: 80, // 稍微加大上方的 Padding，閃開共用導覽列的漢堡按鈕
  },
  userInfo: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  userName: {
    fontSize: 38,
    fontWeight: "bold",
    letterSpacing: 2,
    color: "#000",
  },
  reminderCard: {
    backgroundColor: "#F7F7F7",
    marginHorizontal: 20,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  reminderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    width: "100%",
    justifyContent: "center",
  },
  emojiLarge: {
    fontSize: 36,
  },
  reminderTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#000",
    letterSpacing: 1,
  },
  reminderSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
    width: "100%",
    justifyContent: "center",
  },
  emojiMedium: {
    fontSize: 28,
  },
  reminderSubText: {
    fontSize: 22,
    fontWeight: "600",
    color: "#000",
  },
  doneBtn: {
    width: 110,
    height: 110,
    backgroundColor: "#D9D9D9",
    borderRadius: 55,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  doneBtnText: {
    fontSize: 24,
    fontWeight: "900",
    color: "#000",
    letterSpacing: 1,
  },
  sectionHeader: {
    paddingHorizontal: 24,
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#000",
  },
  mainActionButton: {
    backgroundColor: "#4651DB",
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  mainActionEmoji: {
    fontSize: 24,
  },
  mainActionText: {
    flexShrink: 1,
    fontSize: 22,
    fontWeight: "bold",
    color: "#FFF",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  gridContainer: {
    marginHorizontal: 20,
    gap: 16,
  },
  gridRow: {
    flexDirection: "row",
    gap: 16,
  },
  gridItem: {
    flex: 1,
    height: 120,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  gridEmoji: {
    fontSize: 42,
    marginBottom: 8,
  },
  gridText: {
    width: "92%",
    minHeight: 40,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "bold",
    color: "#000",
    letterSpacing: 0.2,
    textAlign: "center",
    textAlignVertical: "center",
  },
});
