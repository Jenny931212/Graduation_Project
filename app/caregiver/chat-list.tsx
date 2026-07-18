import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/firebase/firebaseConfig";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";

export default function CaregiverChatListScreen() {
  const { activePatientId, activePatient } = useActiveCareTarget();
  const { language } = useLanguage();
  const t = translations[language];
  const [lastMessage, setLastMessage] = useState<any>(null);

  useEffect(() => {
    if (!activePatientId) {
      setLastMessage(null);
      return;
    }

    const q = query(
      collection(db, "chats", activePatientId, "messages"),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          setLastMessage(snap.docs[0].data());
        } else {
          setLastMessage(null);
        }
      },
      (error) => {
        console.log("caregiver chat-list snapshot failed:", error);
        setLastMessage(null);
      }
    );

    return () => unsub();
  }, [activePatientId]);

  return (
    <View style={styles.container}>
      <View style={styles.headerSpacer} />

      <ScrollView>
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/caregiver/chat-room",
              params: { patientId: activePatientId ?? "" },
            })
          }
          style={({ pressed }) => [
            styles.chatItem,
            pressed && { backgroundColor: "#F5F5F5" },
          ]}
          disabled={!activePatientId}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {activePatient?.name ? activePatient.name.substring(0, 1) : ""}
            </Text>
          </View>

          <View style={styles.chatInfo}>
            <View style={styles.chatHeader}>
              <Text style={styles.caregiverName}>
                {activePatient?.name
                  ? language === "zh"
                    ? `${activePatient.name}${t.familyLabel}`
                    : `${activePatient.name} ${t.familyLabel}`
                  : t.chatRoom}
              </Text>

              <Text style={styles.timeText}>
                {lastMessage?.createdAt?.toMillis
                  ? new Date(lastMessage.createdAt.toMillis()).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "上午 8:00"}
              </Text>
            </View>

            <Text style={styles.lastMsgText} numberOfLines={1}>
              {lastMessage
                ? lastMessage.imageUrl
                  ? "[照片]"
                  : lastMessage.text ?? ""
                : t.noChatRecords}
            </Text>
          </View>
        </Pressable>

        <View style={styles.divider} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF" },
  headerSpacer: {
    backgroundColor: "#9999E5",
    paddingTop: Platform.OS === "ios" ? 90 : 50,
    paddingBottom: 25,
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  chatItem: {
    flexDirection: "row",
    padding: 20,
    alignItems: "center",
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#E0E0E0",
    marginRight: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#000",
    fontSize: 24,
    fontWeight: "bold",
  },
  chatInfo: {
    flex: 1,
    gap: 5,
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  caregiverName: {
    fontSize: 20,
    fontWeight: "900",
    color: "#000",
  },
  timeText: {
    fontSize: 14,
    color: "#999",
  },
  lastMsgText: {
    fontSize: 16,
    color: "#666",
  },
  divider: {
    height: 1,
    backgroundColor: "#EEE",
    marginHorizontal: 20,
  },
});
