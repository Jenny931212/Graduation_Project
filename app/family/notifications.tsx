import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { router } from "expo-router";

import { db } from "@/firebase/firebaseConfig";
import { useAuth } from "@/src/auth/useAuth";
import { translations } from "@/src/i18n/translations";
import { getNotificationText } from "@/src/notifications/notificationText";
import {
  NOTIFICATIONS_COLLECTION,
  type NotificationDocument,
} from "@/src/notifications/notificationSchema";
import { useLanguage } from "@/src/store/LanguageContext";

type NotificationRow = NotificationDocument & {
  id: string;
};

export default function FamilyNotificationsScreen() {
  const { user: currentUser } = useAuth();
  const { language } = useLanguage();
  const t = translations[language];
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  useEffect(() => {
    if (!currentUser?.uid) {
      setNotifications([]);
      return;
    }

    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where("recipientUid", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotifications(
          snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as NotificationDocument),
          }))
        );
      },
      (error) => {
        console.log("family notifications snapshot failed:", error);
        setNotifications([]);
      }
    );

    return () => unsub();
  }, [currentUser?.uid]);

  const formatTime = (createdAt: NotificationDocument["createdAt"]) => {
    if (!createdAt) return "";
    return createdAt.toDate().toLocaleTimeString("zh-TW", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const handleNotificationPress = async (item: NotificationRow) => {
    try {
      await updateDoc(doc(db, NOTIFICATIONS_COLLECTION, item.id), {
        isRead: true,
      });

      router.push({
        pathname: "/family/notification-detail",
        params: { id: item.id },
      } as any);
    } catch (error) {
      console.log("family notification press failed:", error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header} />

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {notifications.map((item, index) => {
          const isUnread = item.isRead !== true;
          const { title, body } = getNotificationText(item, t);

          return (
            <Pressable
              key={item.id || `${item.title}-${index}`}
              style={[styles.row, isUnread ? styles.unreadRow : styles.readRow]}
              onPress={() => handleNotificationPress(item)}
            >
              {isUnread ? <View style={styles.unreadDot} /> : null}

              <View style={styles.avatar} />

              <View style={styles.body}>
                <View style={styles.topLine}>
                  <Text
                    style={[
                      styles.title,
                      isUnread ? styles.unreadTitle : styles.readTitle,
                    ]}
                  >
                    {title}
                  </Text>
                  <Text
                    style={[
                      styles.time,
                      isUnread ? styles.unreadTime : styles.readTime,
                    ]}
                  >
                    {formatTime(item.createdAt)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.content,
                    isUnread ? styles.unreadContent : styles.readContent,
                  ]}
                >
                  {body}
                </Text>
              </View>
            </Pressable>
          );
        })}
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
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    position: "relative",
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  unreadRow: {
    backgroundColor: "#F1EDFF",
  },
  readRow: {
    backgroundColor: "#FFFFFF",
  },
  unreadDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#D1D5DB",
    marginRight: 14,
    marginTop: 1,
  },
  body: {
    flex: 1,
    gap: 5,
  },
  topLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 22,
  },
  unreadTitle: {
    fontWeight: "700",
    color: "#111827",
  },
  readTitle: {
    fontWeight: "600",
    color: "#6B7280",
  },
  time: {
    fontSize: 13,
    marginTop: 2,
  },
  unreadTime: {
    color: "#6B7280",
  },
  readTime: {
    color: "#9CA3AF",
  },
  content: {
    fontSize: 15,
    lineHeight: 21,
  },
  unreadContent: {
    color: "#4B5563",
  },
  readContent: {
    color: "#9CA3AF",
  },
});
