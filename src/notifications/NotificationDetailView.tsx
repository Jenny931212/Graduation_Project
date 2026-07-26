import { doc, getDoc } from "firebase/firestore";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { db } from "@/firebase/firebaseConfig";
import { useAuth } from "@/src/auth/useAuth";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import {
  NOTIFICATIONS_COLLECTION,
  type NotificationDocument,
} from "@/src/notifications/notificationSchema";
import { translations } from "@/src/i18n/translations";
import {
  buildNotificationBody,
  getNotificationTitle,
  pickText,
} from "@/src/notifications/notificationText";
import { useLanguage } from "@/src/store/LanguageContext";
import {
  CATEGORY_LABEL_KEY,
  getNotificationVisual,
  getSourceLabel,
} from "@/src/notifications/notificationCategories";
import { formatNotificationDateTime } from "@/src/notifications/formatNotificationDateTime";

type NotificationDetail = NotificationDocument & Record<string, any>;
type TranslationSet = (typeof translations)[keyof typeof translations];

function firstValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function buildDetailBody(data: NotificationDetail | null) {
  if (!data) return "";

  const eventTime = pickText(data, ["time", "scheduleTime", "eventTime"]);
  const patientName = pickText(data, ["patientName", "name", "personName"]);
  const eventTitle = pickText(data, ["eventTitle", "medicineName", "eventName"]);
  const location = pickText(data, ["location", "place"]);
  const summary = [patientName, eventTitle, location].filter(Boolean).join("  ");

  if (eventTime || summary) {
    return [eventTime, summary].filter(Boolean).join("\n");
  }

  return data.body ?? "";
}

function buildInfoRows(
  data: NotificationDetail | null,
  t: TranslationSet,
  patientNameById: Map<string, string>
) {
  if (!data) return [];

  const rows: { label: string; value: string }[] = [];

  const patientName =
    patientNameById.get(data.patientId ?? "") ||
    pickText(data, ["patientName", "name", "personName"]);
  if (patientName) rows.push({ label: t.notificationFieldPatientName, value: patientName });

  const eventTitle = pickText(data, ["eventTitle", "medicineName", "eventName", "itemTitle"]);
  if (eventTitle) rows.push({ label: t.notificationFieldEventTitle, value: eventTitle });

  const eventDate = pickText(data, ["eventDate"]);
  if (eventDate) rows.push({ label: t.notificationFieldEventDate, value: eventDate });

  const eventTime = pickText(data, ["time", "scheduleTime", "eventTime"]);
  if (eventTime) rows.push({ label: t.notificationFieldEventTime, value: eventTime });

  const location = pickText(data, ["location", "place"]);
  if (location) rows.push({ label: t.notificationFieldLocation, value: location });

  const sourceLabel = getSourceLabel(data.sourceCollection, t);
  if (sourceLabel) rows.push({ label: t.notificationFieldSource, value: sourceLabel });

  return rows;
}

export function NotificationDetailView() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const { user: currentUser } = useAuth();
  const { language } = useLanguage();
  const t = translations[language];
  const { linkedCareTargets } = useActiveCareTarget();
  const notificationId = firstValue(params.id);
  const [notification, setNotification] = useState<NotificationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadNotification() {
      if (!notificationId) {
        setErrorText(t.notFoundNotification);
        setLoading(false);
        return;
      }

      if (!currentUser?.uid) return;

      try {
        setLoading(true);
        setErrorText("");

        const snap = await getDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId));
        if (!alive) return;

        if (!snap.exists()) {
          setNotification(null);
          setErrorText(t.notFoundNotification);
          return;
        }

        const data = snap.data() as NotificationDetail;
        if (data.recipientUid !== currentUser.uid) {
          setNotification(null);
          setErrorText(t.noPermissionNotification);
          return;
        }

        if (!alive) return;
        setNotification(data);
      } catch (error) {
        console.log("notification detail load failed:", error);
        if (alive) {
          setNotification(null);
          setErrorText(t.notificationReadFailed);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadNotification();

    return () => {
      alive = false;
    };
  }, [currentUser?.uid, notificationId, language, t]);

  const displayBody = useMemo(() => buildDetailBody(notification), [notification]);
  const displayTitle = getNotificationTitle(notification, t);
  const localizedBody = buildNotificationBody(notification, t) || displayBody;
  const displayDateTime = formatNotificationDateTime(notification?.createdAt, t, language);
  const patientNameById = useMemo(
    () => new Map(linkedCareTargets.map((patient) => [patient.id, patient.name])),
    [linkedCareTargets]
  );
  const infoRows = useMemo(
    () => buildInfoRows(notification, t, patientNameById),
    [notification, t, patientNameById]
  );
  const visual = getNotificationVisual(notification);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backText}>‹ {t.back}</Text>
        </Pressable>
        <Text style={styles.menuIcon}>☰</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.messageText}>{t.reading}</Text>
        ) : errorText ? (
          <Text style={styles.messageText}>{errorText}</Text>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.title}>{displayTitle}</Text>

              <View style={styles.tagRow}>
                <View style={[styles.tag, { backgroundColor: visual.tintSoft }]}>
                  <Text style={[styles.tagText, { color: visual.tint }]}>
                    {t[CATEGORY_LABEL_KEY[visual.category]]}
                  </Text>
                </View>
                {visual.level ? (
                  <View style={[styles.tag, { backgroundColor: visual.tintSoft }]}>
                    <Text style={[styles.tagText, { color: visual.tint }]}>
                      {visual.level === "critical"
                        ? t.notificationLevelCritical
                        : t.notificationLevelWarning}
                    </Text>
                  </View>
                ) : null}
              </View>

              {!!displayDateTime && <Text style={styles.dateTime}>{displayDateTime}</Text>}
            </View>

            {!!localizedBody && (
              <View style={styles.card}>
                <Text style={styles.body}>{localizedBody}</Text>
              </View>
            )}

            {infoRows.length > 0 && (
              <View style={styles.card}>
                {infoRows.map((row, index) => (
                  <View
                    key={row.label}
                    style={[styles.infoRow, index === infoRows.length - 1 && styles.infoRowLast]}
                  >
                    <Text style={styles.infoLabel}>{row.label}</Text>
                    <Text style={styles.infoValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFAFA",
  },
  header: {
    height: 112,
    backgroundColor: "#D9D4F3",
    paddingTop: 54,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 12,
  },
  backText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  menuIcon: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 14,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },
  tagRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "700",
  },
  dateTime: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  body: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: "500",
    color: "#111827",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  infoRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  infoLabel: {
    fontSize: 14,
    color: "#9CA3AF",
    fontWeight: "600",
  },
  infoValue: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    fontWeight: "600",
    textAlign: "right",
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#374151",
  },
});
