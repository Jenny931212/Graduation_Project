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
} from "firebase/firestore";
import { useEffect, useState } from "react";
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

// ====== 型別（不影響 UI） ======
type Item = {
  name: string;
  dose: string;
  quantity: string;
  time: string[];
  note: string;
};

function toArray(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

// Firestore items -> UI Item
function mapItemFromFirestore(it: any): Item {
  return {
    // 你在 camera.tsx 存的是 drug_name_zh（由 API drug_name 映射過來）
    name: it.drug_name_zh ?? it.drug_name ?? it.name ?? "（未辨識藥品名稱）",

    // 你在 camera.tsx 存的是 dose（由 API dosage 映射過來）
    dose: it.dose ?? it.dosage ?? "未提供",

    // 你在 camera.tsx 存的是 quantity（由 API quantity 映射過來）
    quantity: it.quantity ?? "依醫囑",

    // 你在 camera.tsx 存的是 usage（由 API usage_zh 映射過來）
    // UI 原本期待 time: string[]，所以這裡包成陣列
    time: toArray(it.usage ?? it.time_of_day ?? it.time),

    note: it.note_zh ?? "",
  };
}

const TIME_LABELS: Record<string, string> = {
  morning: "早上",
  noon: "中午",
  afternoon: "下午",
  night: "晚上",
};

export default function ResultScreen() {
  // ✅ 現在只接受 prescriptionId
  const { prescriptionId } = useLocalSearchParams<{ prescriptionId?: string }>();
  const { activeCareTargetId } = useActiveCareTarget();

  // ====== UI 原本就有的 state（保留） ======
  const [status, setStatus] = useState<"loading" | "done">("loading");
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);
  const [globalMemo, setGlobalMemo] = useState("");

  // ====== 從 Firestore 讀資料（改成：主文件 + items 子集合） ======
  useEffect(() => {
    if (!prescriptionId) {
      Alert.alert("錯誤", "缺少藥單 ID");
      router.replace("/caregiver");
      return;
    }

    (async () => {
      try {
        // 1) 讀主文件 prescriptions/{id}
        const ref = doc(db, "prescriptions", prescriptionId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          Alert.alert("錯誤", "找不到藥單資料");
          router.replace("/caregiver");
          return;
        }

        const data = snap.data() as any;

        // ✅ 你現在 camera.tsx 寫入的是 sourceImageUrl / memo / title
        setImageUri(data.sourceImageUrl);
        setTitle(data.title ?? "");
        setGlobalMemo(data.memo ?? "");

        // 2) 讀子集合 prescriptions/{id}/items
        const itemsQ = query(
          collection(db, "prescriptions", prescriptionId, "items"),
          orderBy("__name__", "asc")
        );
        const itemsSnap = await getDocs(itemsQ);

        const mapped = itemsSnap.docs.map((d) => mapItemFromFirestore(d.data()));
        setItems(mapped);

        setStatus("done");
      } catch (e) {
        console.log("read prescription error:", e);
        Alert.alert("讀取失敗", "無法讀取藥單資料");
        router.replace("/caregiver");
      }
    })();
  }, [prescriptionId]);

  // ====== UI（完全照你原本的） ======
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 90, gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "900", color: "#333" }}>
        {status === "loading" ? "解析中..." : "確認藥單資訊"}
      </Text>

      {imageUri && (
        <Image
          source={{ uri: imageUri }}
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
          <Text style={{ marginTop: 10, opacity: 0.6 }}>
            AI 正在努力解析中...
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ fontWeight: "800", fontSize: 16 }}>紀錄標題</Text>
            <TextInput
              value={title}
              editable={false} // ❗ UI 不變，只是唯讀
              style={{
                borderWidth: 1,
                borderColor: "#ccc",
                borderRadius: 8,
                padding: 12,
                backgroundColor: "#f5f5f5",
              }}
            />
          </View>

          <Text style={{ fontSize: 18, fontWeight: "800", marginTop: 8 }}>
            藥品明細
          </Text>

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
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: "#007AFF",
                }}
              >
                {it.name}
              </Text>
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 15, color: "#444" }}>
                  用法劑量：{it.dose}
                </Text>
                <Text style={{ fontSize: 15, color: "#444" }}>
                  數量：{it.quantity}
                </Text>
                <Text style={{ fontSize: 15, color: "#444" }}>
                  服用時段：
                  {it.time.map((t) => TIME_LABELS[t] || t).join(", ")}
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    color: globalMemo ? "#666" : "#CCC",
                    marginTop: 2,
                  }}
                >
                  備註：{globalMemo || "無"}
                </Text>
              </View>
            </View>
          ))}

          <View style={{ marginTop: 20, gap: 12 }}>
            <Pressable
              onPress={() => router.replace("/caregiver/list")}
              style={{
                padding: 18,
                backgroundColor: "#007AFF",
                borderRadius: 12,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  textAlign: "center",
                  fontWeight: "800",
                  fontSize: 18,
                }}
              >
                返回藥單列表
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}