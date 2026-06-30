import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { db } from "@/firebase/firebaseConfig";
import { useAuth } from "@/src/auth/useAuth";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import {
  ensureFirestoreTranslations,
  pickDynamicLocalizedString,
} from "@/src/i18n/dynamicTranslation";
import { useLanguage } from "@/src/store/LanguageContext";

type CareNote = {
  id: string;
  title: string;
  content: string;
  title_en?: string;
  title_vi?: string;
  title_id?: string;
  content_en?: string;
  content_vi?: string;
  content_id?: string;
  pinned: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy: string;
  caregiverId: string;
  patientId: string;
};

type NoteForm = {
  title: string;
  content: string;
  pinned: boolean;
};

const emptyForm: NoteForm = {
  title: "",
  content: "",
  pinned: false,
};

function formatUpdatedAt(value?: Timestamp | null) {
  if (!value?.toDate) return "--/-- --:--";

  const date = value.toDate();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${month}/${day} ${hour}:${minute}`;
}

function getNoteTime(note: CareNote) {
  return note.updatedAt?.toMillis?.() ?? note.createdAt?.toMillis?.() ?? 0;
}

export default function CaregiverNotebookScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { activePatientId, activePatient, ready } = useActiveCareTarget();
  const { language } = useLanguage();

  const [notes, setNotes] = useState<CareNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<CareNote | null>(null);
  const [form, setForm] = useState<NoteForm>(emptyForm);

  const sortedNotes = useMemo(() => {
    return [...notes].sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return getNoteTime(right) - getNoteTime(left);
    });
  }, [notes]);

  useEffect(() => {
    if (!ready) return;

    if (!activePatientId) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const notesRef = collection(db, "patients", activePatientId, "care_notes");
    const unsubscribe = onSnapshot(
      notesRef,
      (snap) => {
        const rows = snap.docs.map((docSnap) => {
          const data = docSnap.data() as Partial<CareNote>;
          return {
            id: docSnap.id,
            title: data.title ?? "",
            content: data.content ?? "",
            title_en: data.title_en ?? "",
            title_vi: data.title_vi ?? "",
            title_id: data.title_id ?? "",
            content_en: data.content_en ?? "",
            content_vi: data.content_vi ?? "",
            content_id: data.content_id ?? "",
            pinned: data.pinned === true,
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
            createdBy: data.createdBy ?? "",
            caregiverId: data.caregiverId ?? "",
            patientId: data.patientId ?? activePatientId,
          };
        });

        setNotes(rows);
        setLoading(false);
      },
      (error) => {
        console.log("care notes snapshot failed:", error);
        setNotes([]);
        setLoading(false);
        Alert.alert("讀取失敗", "無法讀取照護記事，請稍後再試。");
      }
    );

    return () => unsubscribe();
  }, [activePatientId, ready]);

  useEffect(() => {
    if (!activePatientId || language === "zh") return;

    notes.forEach((note) => {
      void ensureFirestoreTranslations(
        doc(db, "patients", activePatientId, "care_notes", note.id),
        note,
        language,
        [
          { baseName: "title", sourceKeys: ["title"] },
          { baseName: "content", sourceKeys: ["content"] },
        ]
      );
    });
  }, [activePatientId, language, notes]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingNote(null);
  };

  const openCreateModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (note: CareNote) => {
    setEditingNote(note);
    setForm({
      title: note.title,
      content: note.content,
      pinned: note.pinned,
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalVisible(false);
    resetForm();
  };

  const saveNote = async () => {
    if (!user?.uid) {
      Alert.alert("尚未登入", "請先登入後再操作。");
      return;
    }

    if (!activePatientId) {
      Alert.alert("目前沒有照顧對象");
      return;
    }

    const title = form.title.trim();
    const content = form.content.trim();

    if (!title) {
      Alert.alert("請輸入標題", "標題為必填欄位。");
      return;
    }

    try {
      setSaving(true);

      if (editingNote) {
        await updateDoc(doc(db, "patients", activePatientId, "care_notes", editingNote.id), {
          title,
          content,
          pinned: form.pinned,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "patients", activePatientId, "care_notes"), {
          title,
          content,
          pinned: form.pinned,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.uid,
          caregiverId: user.uid,
          patientId: activePatientId,
        });
      }

      setModalVisible(false);
      resetForm();
    } catch (error) {
      console.log("save care note failed:", error);
      Alert.alert("儲存失敗", "無法儲存照護記事，請稍後再試。");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (note: CareNote) => {
    Alert.alert("刪除記事", "確定要刪除這篇記事嗎？", [
      { text: "取消", style: "cancel" },
      {
        text: "刪除",
        style: "destructive",
        onPress: async () => {
          if (!activePatientId) return;

          try {
            await deleteDoc(doc(db, "patients", activePatientId, "care_notes", note.id));
          } catch (error) {
            console.log("delete care note failed:", error);
            Alert.alert("刪除失敗", "無法刪除照護記事，請稍後再試。");
          }
        },
      },
    ]);
  };

  const togglePinned = async (note: CareNote) => {
    if (!activePatientId) return;

    try {
      await updateDoc(doc(db, "patients", activePatientId, "care_notes", note.id), {
        pinned: !note.pinned,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.log("toggle care note pinned failed:", error);
      Alert.alert("操作失敗", "無法更新置頂狀態，請稍後再試。");
    }
  };

  const patientName = activePatient?.name || "陳柏丞";

  if (!ready || loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#6BB8E8" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={30} color="#111827" />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>照護記事</Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              記錄長輩的飲食、情緒、用藥與提醒
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!activePatientId ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>目前沒有照顧對象</Text>
          </View>
        ) : (
          <>
            <View style={styles.patientCard}>
              <View style={styles.patientAccent} />
              <View>
                <Text style={styles.patientLabel}>目前照顧對象</Text>
                <Text style={styles.patientName}>{patientName}</Text>
              </View>
            </View>

            <Pressable style={styles.addButton} onPress={openCreateModal}>
              <Text style={styles.addButtonText}>＋ 新增記事</Text>
            </Pressable>

            <View style={styles.noteList}>
              {sortedNotes.length === 0 ? (
                <View style={styles.emptyNoteCard}>
                  <Text style={styles.emptyNoteText}>尚無照護記事</Text>
                </View>
              ) : (
                sortedNotes.map((note) => {
                  const localizedTitle = pickDynamicLocalizedString(
                    note,
                    "title",
                    language,
                    ["title"],
                    note.title
                  );
                  const localizedContent = pickDynamicLocalizedString(
                    note,
                    "content",
                    language,
                    ["content"],
                    note.content
                  );

                  return (
                  <View key={note.id} style={styles.noteCard}>
                    <View style={styles.noteHeader}>
                      <View style={styles.noteTitleWrap}>
                        <Text style={styles.noteTitle} numberOfLines={2}>
                          {note.pinned ? "📌 " : ""}
                          {localizedTitle}
                        </Text>
                        <Text style={styles.noteTime}>更新時間：{formatUpdatedAt(note.updatedAt)}</Text>
                      </View>

                      <Pressable style={styles.pinButton} onPress={() => togglePinned(note)}>
                        <Text style={styles.pinButtonText}>{note.pinned ? "取消" : "置頂"}</Text>
                      </Pressable>
                    </View>

                    <Text style={styles.noteContent}>{localizedContent || "沒有內容"}</Text>

                    <View style={styles.noteActions}>
                      <Pressable style={styles.editButton} onPress={() => openEditModal(note)}>
                        <Text style={styles.editButtonText}>編輯</Text>
                      </Pressable>
                      <Pressable style={styles.deleteButton} onPress={() => confirmDelete(note)}>
                        <Text style={styles.deleteButtonText}>刪除</Text>
                      </Pressable>
                    </View>
                  </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom + 18, 28) }]}>
            <Text style={styles.modalTitle}>{editingNote ? "編輯記事" : "新增記事"}</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>標題</Text>
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={(title) => setForm((prev) => ({ ...prev, title }))}
                placeholder="例如：今天飲食狀況"
                placeholderTextColor="#A7B0BA"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>內容</Text>
              <TextInput
                style={[styles.input, styles.contentInput]}
                value={form.content}
                onChangeText={(content) => setForm((prev) => ({ ...prev, content }))}
                placeholder="可以記錄長輩狀況、注意事項、提醒..."
                placeholderTextColor="#A7B0BA"
                multiline
                textAlignVertical="top"
              />
            </View>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => setForm((prev) => ({ ...prev, pinned: !prev.pinned }))}
            >
              <View style={[styles.checkbox, form.pinned && styles.checkboxChecked]}>
                {form.pinned && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
              </View>
              <Text style={styles.checkboxText}>置頂這篇記事</Text>
            </Pressable>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={closeModal} disabled={saving}>
                <Text style={styles.cancelButtonText}>取消</Text>
              </Pressable>
              <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={saveNote} disabled={saving}>
                <Text style={styles.saveButtonText}>{saving ? "儲存中" : "儲存"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAFAFA",
  },
  screen: {
    flex: 1,
    backgroundColor: "#FAFAFA",
  },
  container: {
    flex: 1,
    backgroundColor: "#FAFAFA",
  },
  header: {
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "#7BC6F9",
    flexDirection: "row",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.72)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerText: {
    flex: 1,
  },
  headerTextGroup: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#000000",
    letterSpacing: 1,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2937",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  patientCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    borderLeftWidth: 8,
    borderLeftColor: "#7BC6F9",
    marginBottom: 14,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  patientAccent: {
    width: 8,
    borderRadius: 8,
    backgroundColor: "#7BC6F9",
    marginRight: 12,
  },
  patientLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#666666",
    marginBottom: 4,
  },
  patientName: {
    fontSize: 21,
    fontWeight: "900",
    color: "#000000",
  },
  addButton: {
    backgroundColor: "#7BC6F9",
    paddingVertical: 15,
    borderRadius: 18,
    alignItems: "center",
    marginBottom: 18,
    shadowColor: "#7BC6F9",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  addButtonDisabled: {
    backgroundColor: "#BDBDBD",
    shadowOpacity: 0,
    elevation: 0,
  },
  addButtonText: {
    color: "#000000",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1,
  },
  emptyBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingVertical: 38,
    paddingHorizontal: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEEEEE",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#000000",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666666",
    textAlign: "center",
    lineHeight: 22,
  },
  emptyState: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingVertical: 38,
    paddingHorizontal: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEEEEE",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  emptyNoteCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingVertical: 38,
    paddingHorizontal: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEEEEE",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  emptyNoteText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666666",
    textAlign: "center",
    lineHeight: 22,
  },
  noteList: {
    gap: 14,
  },
  notesList: {
    gap: 14,
  },
  noteCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  noteTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  noteHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  noteTitleArea: {
    flex: 1,
  },
  noteTitleWrap: {
    flex: 1,
  },
  noteTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#000000",
  },
  noteTime: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
    color: "#888888",
  },
  iconButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#E6F4FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D7ECFF",
  },
  iconText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#4A90E2",
  },
  pinButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#E6F4FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D7ECFF",
  },
  pinButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#4A90E2",
  },
  noteContent: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    lineHeight: 23,
  },
  noteActions: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  editButton: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: "#E6F4FF",
    borderRadius: 14,
  },
  editButtonText: {
    color: "#4A90E2",
    fontWeight: "900",
  },
  deleteButton: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: "#FEE2E2",
    borderRadius: 14,
  },
  deleteButtonText: {
    color: "#DC2626",
    fontWeight: "900",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    padding: 22,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    padding: 22,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#000000",
    marginBottom: 18,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "900",
    color: "#555555",
    marginBottom: 8,
    marginLeft: 4,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: "900",
    color: "#555555",
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: "#F7F7F7",
    borderWidth: 1,
    borderColor: "#EEEEEE",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "700",
    color: "#000000",
    marginBottom: 16,
  },
  titleInput: {
    backgroundColor: "#F7F7F7",
    borderWidth: 1,
    borderColor: "#EEEEEE",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "700",
    color: "#000000",
    marginBottom: 16,
  },
  contentInput: {
    minHeight: 150,
    backgroundColor: "#F7F7F7",
    borderWidth: 1,
    borderColor: "#EEEEEE",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
    marginBottom: 16,
  },
  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#7BC6F9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  checkboxActive: {
    backgroundColor: "#7BC6F9",
  },
  checkboxChecked: {
    backgroundColor: "#7BC6F9",
  },
  checkboxText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "900",
  },
  pinText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#374151",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
  },
  cancelButtonText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "900",
  },
  saveButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#7BC6F9",
    borderRadius: 14,
  },
  saveButtonDisabled: {
    backgroundColor: "#BDBDBD",
  },
  saveButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "900",
  },
});
