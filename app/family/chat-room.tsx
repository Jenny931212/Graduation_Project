import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { db, storage } from "@/firebase/firebaseConfig";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { useAuth } from "@/src/auth/useAuth";
import {
  ensureFirestoreTranslations,
  pickDynamicLocalizedString,
} from "@/src/i18n/dynamicTranslation";
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";

export default function FamilyChatRoomScreen() {
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const { activePatientId, activePatient } = useActiveCareTarget();
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = translations[language];

  const targetId = patientId || activePatientId;

  const generateCustomId = (pId: string) => {
    const now = new Date();
    const timeStr =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0") +
      "_" +
      String(now.getHours()).padStart(2, "0") +
      "-" +
      String(now.getMinutes()).padStart(2, "0") +
      "-" +
      String(now.getSeconds()).padStart(2, "0");

    const lastFour = pId.slice(-4);
    return `${timeStr}_msg_${lastFour}`;
  };

  useEffect(() => {
    if (!targetId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "chats", targetId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMessages(msgs);
        setLoading(false);
      },
      (error) => {
        console.error("Firebase 錯誤：", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [targetId]);

  useEffect(() => {
    if (!targetId || language === "zh") return;

    messages.forEach((msg) => {
      if (!msg.text) return;
      void ensureFirestoreTranslations(
        doc(db, "chats", targetId, "messages", msg.id),
        msg,
        language,
        [{ baseName: "text", sourceKeys: ["text", "text_original"] }]
      );
    });
  }, [messages, targetId, language]);

  const pickImageAndSend = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert(t.resultErrorTitle, t.albumPermissionNeeded);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
    });

    if (result.canceled || !result.assets?.[0]) return;

    await uploadImage(result.assets[0].uri);
  };

  const uploadImage = async (uri: string) => {
    if (!targetId || !user) return;
    setUploading(true);

    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `${Date.now()}.jpg`;
      const storageRef = ref(storage, `chats/${targetId}/images/${filename}`);
      const uploadTask = uploadBytesResumable(storageRef, blob);

      uploadTask.on(
        "state_changed",
        undefined,
        (error) => {
          console.error("上傳失敗:", error);
          setUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const customId = generateCustomId(targetId);

          await setDoc(doc(db, "chats", targetId, "messages", customId), {
            imageUrl: downloadURL,
            senderId: user.uid,
            createdAt: serverTimestamp(),
          });

          setUploading(false);
        }
      );
    } catch (e) {
      console.error("圖片處理失敗", e);
      setUploading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !targetId || !user) return;

    try {
      const customId = generateCustomId(targetId);

      await setDoc(doc(db, "chats", targetId, "messages", customId), {
        text: inputText,
        text_zh: inputText,
        text_original: inputText,
        senderId: user.uid,
        createdAt: serverTimestamp(),
      });

      setInputText("");
    } catch (e) {
      console.error("發送失敗", e);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
      style={{ flex: 1 }}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} hitSlop={20} style={styles.backBtn}>
            <Text style={styles.backIcon}>＜</Text>
          </Pressable>
          <Text style={styles.headerTitle}>
            {activePatient?.name
              ? language === "zh"
                ? `${activePatient.name}${t.caregiverLabel}`
                : `${activePatient.name} ${t.caregiverLabel}`
              : t.chatRoom}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#9999E5" />
          <Text style={styles.loadingText}>{t.loadingMessages}</Text>
        </View>
      ) : messages.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyText}>{t.noConversation}</Text>
          <Text style={styles.emptySubText}>{t.sendFirstMessage}</Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.chatContainer}
          ref={(ref) => ref?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg) => {
            const isMe = msg.senderId === user?.uid;
            const localizedText = pickDynamicLocalizedString(
              msg,
              "text",
              language,
              ["text", "text_original"],
              msg.text
            );
            const originalText = msg.text || msg.text_original || "";
            const showOriginal = language !== "zh" && localizedText && originalText && localizedText !== originalText;
            return (
              <View
                key={msg.id}
                style={[styles.bubbleWrapper, isMe ? styles.myWrapper : styles.otherWrapper]}
              >
                <View style={[styles.bubble, isMe ? styles.myBubble : styles.otherBubble]}>
                  {msg.imageUrl ? (
                    <Image source={{ uri: msg.imageUrl }} style={styles.sentImage} resizeMode="cover" />
                  ) : showOriginal ? (
                    <>
                      <Text style={[styles.mainText, isMe && { color: "#FFF" }]}>{localizedText}</Text>
                      <View style={styles.divider} />
                      <Text style={[styles.subText, isMe && { color: "rgba(255,255,255,0.8)" }]}>{originalText}</Text>
                    </>
                  ) : (
                    <Text style={[styles.mainText, isMe && { color: "#FFF" }]}>{localizedText || originalText}</Text>
                  )}
                </View>
                <Text style={[styles.timeText, { alignSelf: isMe ? "flex-end" : "flex-start" }]}>
                  {msg.createdAt
                    ? new Date(msg.createdAt.toMillis()).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.inputArea}>
        <Pressable onPress={pickImageAndSend} style={styles.photoBtn} disabled={uploading}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: "#EEE", borderColor: "#CCC", borderWidth: 1 },
            ]}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#999" />
            ) : (
              <Ionicons name="camera" size={22} color="#666" />
            )}
          </View>
        </Pressable>

        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t.inputMessage}
          multiline
        />

        <Pressable
          onPress={sendMessage}
          style={({ pressed }) => [
            styles.sendBtn,
            !inputText.trim() && { opacity: 0.5 },
            pressed && { opacity: 0.7 },
          ]}
          disabled={!inputText.trim()}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="send" size={20} color="#FFF" style={{ marginLeft: 3 }} />
          </View>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: "#FFF" },
  header: {
    backgroundColor: "#9999E5",
    paddingTop: 60,
    paddingBottom: 15,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  backBtn: { padding: 5, marginRight: 5 },
  backIcon: { fontSize: 24, color: "#000", fontWeight: "600" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#000", marginLeft: 5 },

  chatContainer: { padding: 15, paddingBottom: 30 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#666" },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyIcon: { fontSize: 80, marginBottom: 20 },
  emptyText: { fontSize: 20, fontWeight: "700", color: "#333" },
  emptySubText: { fontSize: 16, color: "#999", textAlign: "center", marginTop: 10 },

  bubbleWrapper: { marginBottom: 15, maxWidth: "85%" },
  myWrapper: { alignSelf: "flex-end" },
  otherWrapper: { alignSelf: "flex-start" },
  bubble: {
    padding: 12,
    borderRadius: 16,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  myBubble: {
    backgroundColor: "#9999E5",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  otherBubble: {
    backgroundColor: "#F2F2F7",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  mainText: { fontSize: 17, fontWeight: "600" },
  subText: { fontSize: 14, color: "#666" },
  sentImage: { width: 200, height: 150, borderRadius: 8 },
  divider: { height: 1, backgroundColor: "rgba(0,0,0,0.1)", marginVertical: 6 },
  timeText: { fontSize: 10, color: "#999", marginTop: 4 },

  inputArea: {
    flexDirection: "row",
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 25 : 15,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#EEE",
    backgroundColor: "#FFF",
  },
  input: {
    flex: 1,
    backgroundColor: "#F2F2F7",
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    minHeight: 40,
    maxHeight: 100,
    fontSize: 16,
  },
  photoBtn: { marginRight: 10, padding: 5 },
  sendBtn: { marginLeft: 10, padding: 5 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#9999E5",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
});
