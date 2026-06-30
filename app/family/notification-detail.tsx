import { db } from "@/firebase/firebaseConfig";
import { useAuth } from "@/src/auth/useAuth";
import {
  NOTIFICATIONS_COLLECTION,
  type NotificationDocument,
} from "@/src/notifications/notificationSchema";
import { translations } from "@/src/i18n/translations";
import {
  buildNotificationBody,
  getNotificationTitle,
} from "@/src/notifications/notificationText";
import { useLanguage } from "@/src/store/LanguageContext";
import { doc, getDoc } from "firebase/firestore";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type NotificationDetail = NotificationDocument & Record<string, any>;

function firstValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function textValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function pickText(data: NotificationDetail | null, keys: string[]) {
  if (!data) return "";

  for (const key of keys) {
    const direct = textValue(data[key]);
    if (direct) return direct;

    const metadata = data.metadata;
    if (metadata && typeof metadata === "object") {
      const nested = textValue(metadata[key]);
      if (nested) return nested;
    }
  }

  return "";
}

function formatCreatedAt(createdAt: NotificationDocument["createdAt"] | undefined) {
  if (!createdAt) return "";
  return createdAt.toDate().toLocaleTimeString("zh-TW", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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

export default function FamilyNotificationDetailScreen() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const { user: currentUser } = useAuth();
  const { language } = useLanguage();
  const t = translations[language];
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
        console.log("family notification detail load failed:", error);
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
  const displayTime =
    pickText(notification, ["time", "scheduleTime", "eventTime"]) ||
    formatCreatedAt(notification?.createdAt);

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
            <View style={styles.titleRow}>
              <Text style={styles.title}>{displayTitle}</Text>
              {!!displayTime && <Text style={styles.time}>{displayTime}</Text>}
            </View>
            {!!localizedBody && <Text style={styles.body}>{localizedBody}</Text>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
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
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 32,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 24,
  },
  title: {
    flex: 1,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    color: "#111827",
  },
  time: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
    color: "#374151",
    marginTop: 4,
  },
  body: {
    fontSize: 22,
    lineHeight: 34,
    fontWeight: "500",
    color: "#111827",
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#374151",
  },
});
