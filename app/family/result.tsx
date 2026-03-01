import { db } from "@/firebase/firebaseConfig";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { router, useLocalSearchParams } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

// ✅ 1. 確保 time 是字串陣列（UI 需要）
type Item = { name: string; dose: string; time: string[]; note: string; quantity?: string };

const TIME_LABELS: Record<string, string> = {
  morning: "早上",
  noon: "中午",
  afternoon: "下午",
  night: "晚上",
};

function safeParseItems(itemsJson?: string): Item[] | null {
  if (!itemsJson) return null;
  try {
    const data = JSON.parse(itemsJson);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function toStringArray(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

export default function ResultScreen() {
  // 🔸 你原本用 id / imageUri / itemsJson / title 都保留（不動 UI）
  const { imageUri, itemsJson, id, title: incomingTitle } = useLocalSearchParams<{
    imageUri?: string;
    itemsJson?: string;
    id?: string;
    title?: string;
  }>();

  const { activeCareTargetId } = useActiveCareTarget();

  const editedItems = useMemo(() => safeParseItems(itemsJson), [itemsJson]);

  const [status, setStatus] = useState<"loading" | "done">("loading");
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState(incomingTitle || "");
  const [submitting, setSubmitting] = useState(false);
  const [finalImageUri, setFinalImageUri] = useState<string | undefined>(imageUri);

  // ✅ 核心：以 Firestore 為主
  useEffect(() => {
    // 1) 如果是從 edit 回來（有 itemsJson），直接顯示 editedItems（不再塞假資料）
    if (editedItems) {
      setItems(editedItems);
      setStatus("done");
      return;
    }

    // 2) 沒 itemsJson：就必須用 id 去 Firestore 讀（否則這頁根本沒真資料）
    if (!id) {
      setStatus("done");
      setItems([]);
      return;
    }

    (async () => {
      try {
        setStatus("loading");

        // 讀主文件
        const presRef = doc(db, "prescriptions", id);
        const presSnap = await getDoc(presRef);

        if (!presSnap.exists()) {
          Alert.alert("錯誤", "找不到藥單資料");
          router.replace("/family/list");
          return;
        }

        const data = presSnap.data() as any;

        setTitle(data.title ?? "");
        setFinalImageUri(data.sourceImageUrl ?? finalImageUri);

        // 讀 items 子集合
        const itemsQ = query(
          collection(db, "prescriptions", id, "items"),
          orderBy("__name__", "asc")
        );
        const itemsSnap = await getDocs(itemsQ);

        const rows: Item[] = itemsSnap.docs.map((d) => {
          const it = d.data() as any;

          // 你現在正規欄位是 usage（文字），time 這裡保持 UI 需要的 string[]
          // 若 usage 是 "morning/noon/night" 這種 key，TIME_LABELS 會轉中文
          const timeArr =
            it.usage ? toStringArray(it.usage) :
            it.time_of_day ? toStringArray(it.time_of_day) :
            [];

          return {
            name: it.drug_name_zh ?? "",
            dose: it.dose ?? "",
            quantity: it.quantity ?? "",
            time: timeArr,
            note: it.note_zh ?? "", // 目前你存的是空字串也沒關係
          };
        });

        setItems(rows);
        setStatus("done");
      } catch (e) {
        console.log("family result read error:", e);
        Alert.alert("讀取失敗", "無法讀取藥單資料");
        router.replace("/family/list");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, editedItems]);

  const goEdit = () => {
    router.replace({
      pathname: "/family/edit",
      params: {
        id: id ?? "",
        imageUri: finalImageUri ?? "",
        itemsJson: JSON.stringify(items),
        title: title,
      },
    });
  };

  // ✅ 以 Firestore 為主：更新主文件 + 重寫 items 子集合
  const onConfirmSave = async () => {
    if (!activeCareTargetId) {
      Alert.alert("錯誤", "請先選擇長輩");
      return;
    }
    if (!id) {
      Alert.alert("錯誤", "缺少藥單 ID，無法儲存");
      return;
    }

    setSubmitting(true);
    try {
      const presRef = doc(db, "prescriptions", id);

      // 1) 更新主文件（title / careTargetId / sourceImageUrl）
      await updateDoc(presRef, {
        careTargetId: activeCareTargetId,
        title: title.trim(),
        sourceImageUrl: finalImageUri ?? "",
        updatedAt: serverTimestamp(),
      });

      // 2) 重寫 items 子集合（先刪舊的，再寫新的）
      const batch = writeBatch(db);

      const oldSnap = await getDocs(collection(db, "prescriptions", id, "items"));
      oldSnap.docs.forEach((d) => batch.delete(d.ref));

      for (const it of items) {
        const itemRef = doc(collection(db, "prescriptions", id, "items"));
        batch.set(itemRef, {
          drug_name_zh: it.name ?? "",
          dose: it.dose ?? "",
          quantity: it.quantity ?? "",
          // ✅ 你目前正規是 usage（文字），這裡把 UI 的 time[] 合成字串存
          usage: (it.time ?? []).join(", "),
          note_zh: it.note ?? "",
        });
      }

      await batch.commit();

      Alert.alert("成功", "紀錄已更新", [
        { text: "確定", onPress: () => router.replace("/family/list") },
      ]);
    } catch (e) {
      console.log("family result save error:", e);
      Alert.alert("儲存失敗");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 90, gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "900", color: "#333" }}>
        {status === "loading" ? "解析中..." : "確認藥單資訊"}
      </Text>

      {finalImageUri && (
        <Image
          source={{ uri: finalImageUri }}
          style={{
            width: "100%",
            height: 200,
            borderRadius: 12,
            backgroundColor: "#eee",
          }}
          resizeMode="contain"
        />
      )}

      {status === "loading" ? (
        <View style={{ padding: 40, alignItems: "center" }}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={{ marginTop: 10, opacity: 0.6 }}>AI 正在努力解析中...</Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ fontWeight: "800", fontSize: 16 }}>紀錄標題</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="例如：1/18 診所感冒藥"
              style={{
                borderWidth: 1,
                borderColor: "#ccc",
                borderRadius: 8,
                padding: 12,
                backgroundColor: "#fff",
              }}
            />
          </View>

          <Text style={{ fontSize: 18, fontWeight: "800", marginTop: 8 }}>藥品明細</Text>

          {items.map((it, idx) => (
            <View
              key={idx}
              style={{
                padding: 16,
                borderWidth: 1,
                borderColor: "#eee",
                borderRadius: 12,
                backgroundColor: "#fff",
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "800", color: "#007AFF" }}>
                {it.name}
              </Text>
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 15, color: "#444" }}>用法劑量：{it.dose}</Text>
                <Text style={{ fontSize: 15, color: "#444" }}>
                  服用時段：{it.time.map((t) => TIME_LABELS[t] || t).join(", ")}
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    color: it.note && it.note.trim() !== "" ? "#666" : "#CCC",
                    marginTop: 2,
                  }}
                >
                  備註：{it.note && it.note.trim() !== "" ? it.note : "無"}
                </Text>
              </View>
            </View>
          ))}

          <View style={{ marginTop: 20, gap: 12 }}>
            <Pressable
              onPress={goEdit}
              style={{ padding: 16, borderWidth: 1, borderColor: "#007AFF", borderRadius: 12 }}
            >
              <Text style={{ color: "#007AFF", textAlign: "center", fontWeight: "700" }}>
                回編輯頁修正
              </Text>
            </Pressable>

            <Pressable
              onPress={onConfirmSave}
              disabled={submitting}
              style={{
                padding: 18,
                backgroundColor: submitting ? "#ccc" : "#007AFF",
                borderRadius: 12,
              }}
            >
              <Text style={{ color: "#fff", textAlign: "center", fontWeight: "800", fontSize: 18 }}>
                儲存更新
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}