import { db } from "@/firebase/firebaseConfig";
import { router, useLocalSearchParams } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";

// ✅ 1. 定義中文轉換對照表
const TIME_LABELS: Record<string, string> = {
  morning: "早上",
  noon: "中午",
  afternoon: "下午",
  night: "晚上",
};

type PrescriptionItem = {
  drug_name_zh: string;
  dose: string;
  quantity?: string;
  usage?: string;         // ✅ 新：由 usage_zh 存進來
  time_of_day?: string[]; // 舊欄位：可能不存在
  note_zh?: string;       // 舊欄位：可能不存在
};

type PrescriptionDoc = {
  prescriptionId: string;
  title?: string;
  createdAt?: any;
  sourceImageUrl?: string;
};

function toMillis(ts: any): number {
  if (ts?.toMillis) return ts.toMillis();
  if (ts?.seconds) return ts.seconds * 1000;
  if (typeof ts === "number") return ts;
  return Date.now();
}

export default function FamilyDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [p, setP] = useState<PrescriptionDoc | null>(null);
  const [items, setItems] = useState<PrescriptionItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoaded(true);
      return;
    }

    (async () => {
      try {
        // 1) 主文件 prescriptions/{id}
        const presRef = doc(db, "prescriptions", id);
        const presSnap = await getDoc(presRef);

        if (!presSnap.exists()) {
          setP(null);
          setItems([]);
          setLoaded(true);
          return;
        }

        const data = presSnap.data() as any;

        setP({
          prescriptionId: presSnap.id,
          title: data.title ?? "",
          createdAt: toMillis(data.createdAt),
          sourceImageUrl: data.sourceImageUrl ?? "",
        });

        // 2) items 子集合 prescriptions/{id}/items
        const itemsQ = query(
          collection(db, "prescriptions", id, "items"),
          orderBy("__name__", "asc")
        );
        const itemsSnap = await getDocs(itemsQ);

        const list = itemsSnap.docs.map((d) => {
          const it = d.data() as any;
          return {
            drug_name_zh: it.drug_name_zh ?? "",
            dose: it.dose ?? "",
            quantity: it.quantity ?? "",
            usage: it.usage ?? "",               // ✅ 你現在存的是 usage
            time_of_day: it.time_of_day ?? [],   // 舊欄位可能空
            note_zh: it.note_zh ?? "",           // 舊欄位可能空
          } as PrescriptionItem;
        });

        setItems(list);
        setLoaded(true);
      } catch (e) {
        console.log("detail read error:", e);
        setLoaded(true);
        Alert.alert("讀取失敗", "無法讀取藥單資料");
      }
    })();
  }, [id]);

  if (!loaded) {
    // UI 不變：你原本沒 loading，我這裡也不加新 UI，保持簡單
    return (
      <View style={{ flex: 1, padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "800" }}>讀取中...</Text>
      </View>
    );
  }

  if (!id || !p) {
    return (
      <View style={{ flex: 1, padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "800" }}>找不到資料</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: "#007AFF" }}>回列表</Text>
        </Pressable>
      </View>
    );
  }

  // ✅ 2. 編輯功能：確保傳入 id 避免重複創建
  const goEdit = () => {
    router.push({
      pathname: "/caregiver/edit",
      params: {
        id: p.prescriptionId,
        title: p.title || "",
        imageUri: p.sourceImageUrl || "",
        itemsJson: JSON.stringify(
          items.map((it) => ({
            name: it.drug_name_zh,
            dose: it.dose,
            // ✅ 新：優先用 usage（文字），若你未來又加 time_of_day 也相容
            time: it.usage ? [it.usage] : (it.time_of_day ?? []),
            note: it.note_zh || "",
            quantity: it.quantity || "",
          }))
        ),
      },
    });
  };

  const confirmDelete = () => {
    Alert.alert("確認刪除", "這筆藥單紀錄將會永久移除。", [
      { text: "取消", style: "cancel" },
      {
        text: "確定刪除",
        style: "destructive",
        onPress: async () => {
          try {
            // ⚠️ 先只刪主文件（子集合 items 若要一併刪，需要額外處理或用 Cloud Function）
            await deleteDoc(doc(db, "prescriptions", p.prescriptionId));
            router.back();
          } catch (e) {
            console.log("delete error:", e);
            Alert.alert("刪除失敗", "無法刪除這筆藥單");
          }
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 90, gap: 16 }}>
      {/* ✅ 3. 標題區塊：顯示自訂標題 */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 26, fontWeight: "900", color: "#333" }}>
            {p.title || "藥單詳情"}
          </Text>
          <Text style={{ opacity: 0.5, marginTop: 4 }}>
            錄入日期：{new Date(p.createdAt ?? Date.now()).toLocaleDateString()}
          </Text>
        </View>
        <Pressable
          onPress={goEdit}
          style={({ pressed }) => ({
            paddingHorizontal: 15,
            paddingVertical: 10,
            backgroundColor: pressed ? "#CFDFFF" : "#E1E9FF",
            borderRadius: 10,
            justifyContent: "center",
            alignItems: "center",
            minWidth: 60,
          })}
        >
          <Text style={{ color: "#007AFF", fontWeight: "800", fontSize: 16 }}>編輯</Text>
        </Pressable>
      </View>

      {p.sourceImageUrl && (
        <Image
          source={{ uri: p.sourceImageUrl }}
          style={{ width: "100%", height: 300, borderRadius: 12, backgroundColor: "#eee" }}
          resizeMode="contain"
        />
      )}

      <Text style={{ fontSize: 20, fontWeight: "800", marginTop: 10 }}>藥品明細</Text>

      {items.map((it, idx) => {
        // ✅ 顯示服用時段：優先 usage（中文句子或 morning/noon…）
        const times = it.usage ? [it.usage] : (it.time_of_day ?? []);
        const timeText = times.map((t) => TIME_LABELS[t] || t).join(", ");

        return (
          <View
            key={idx}
            style={{
              padding: 14,
              borderWidth: 1,
              borderColor: "#eee",
              borderRadius: 12,
              backgroundColor: "#fff",
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#007AFF" }}>
              {it.drug_name_zh}
            </Text>
            <Text style={{ fontSize: 16 }}>用法劑量：{it.dose}</Text>

            {/* ✅ 4. 使用對照表將英文時段轉為中文（若是中文句子則原樣顯示） */}
            <Text style={{ fontSize: 16 }}>
              服用時段：{timeText || "未提供"}
            </Text>

            <Text
              style={{
                fontSize: 15,
                color: it.note_zh && it.note_zh.trim() !== "" ? "#666" : "#CCC",
                marginTop: 4,
              }}
            >
              備註：{it.note_zh && it.note_zh.trim() !== "" ? it.note_zh : "無"}
            </Text>
          </View>
        );
      })}

      <View style={{ marginTop: 20, gap: 12 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 16, backgroundColor: "#007AFF", borderRadius: 12 }}>
          <Text style={{ color: "#fff", textAlign: "center", fontSize: 18, fontWeight: "700" }}>返回列表</Text>
        </Pressable>

        <Pressable onPress={confirmDelete} style={{ padding: 12 }}>
          <Text style={{ color: "#FF3B30", textAlign: "center", fontWeight: "600" }}>刪除此筆紀錄</Text>
        </Pressable>

        {/* 把 ID 放在最下面不起眼的地方供開發參考 */}
        <Text style={{ textAlign: "center", fontSize: 10, color: "#ccc" }}>ID: {p.prescriptionId}</Text>
      </View>
    </ScrollView>
  );
}