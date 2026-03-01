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
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";

// ✅ 1. 定義中文轉換對照表（UI 不動）
const TIME_LABELS: Record<string, string> = {
  morning: "早上",
  noon: "中午",
  afternoon: "下午",
  night: "晚上",
};

// 兼容：把 Firestore item 轉成你 UI/編輯頁需要的格式
function toStringArray(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

export default function FamilyDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [loading, setLoading] = useState(true);
  const [p, setP] = useState<any | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setP(null);
      return;
    }

    (async () => {
      try {
        setLoading(true);

        // 1) 主文件
        const presRef = doc(db, "prescriptions", id);
        const presSnap = await getDoc(presRef);

        if (!presSnap.exists()) {
          setP(null);
          setLoading(false);
          return;
        }

        const data = presSnap.data() as any;

        // 2) items 子集合
        const itemsQ = query(
          collection(db, "prescriptions", id, "items"),
          orderBy("__name__", "asc")
        );
        const itemsSnap = await getDocs(itemsQ);

        const items = itemsSnap.docs.map((d) => {
          const it = d.data() as any;

          // 你目前 items 可能存 usage（文字）或 time_of_day（array）
          const time_of_day =
            it.time_of_day
              ? toStringArray(it.time_of_day)
              : it.usage
              ? toStringArray(it.usage) // usage 是 "morning, night" 的話會變成一個字串陣列
              : [];

          return {
            drug_name_zh: it.drug_name_zh ?? "",
            dose: it.dose ?? "",
            time_of_day,
            note_zh: it.note_zh ?? "",
          };
        });

        // 組成你原本 UI 需要的 p 結構（UI 不動）
        setP({
          prescriptionId: presSnap.id,
          title: data.title ?? "",
          sourceImageUrl: data.sourceImageUrl ?? "",
          createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now(),
          items,
        });

        setLoading(false);
      } catch (e) {
        console.log("family detail read error:", e);
        setP(null);
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={{ flex: 1, padding: 20, gap: 12, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ opacity: 0.7 }}>讀取雲端資料中…</Text>
      </View>
    );
  }

  if (!p) {
    return (
      <View style={{ flex: 1, padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "800" }}>找不到資料</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: "#007AFF" }}>回列表</Text>
        </Pressable>
      </View>
    );
  }

  // ✅ 編輯功能：維持你原本 router params（UI 不動）
  const goEdit = () => {
    router.push({
      pathname: "/family/edit",
      params: {
        id: p.prescriptionId,
        title: p.title || "",
        imageUri: p.sourceImageUrl || "",
        itemsJson: JSON.stringify(
          (p.items ?? []).map((it: any) => ({
            name: it.drug_name_zh,
            dose: it.dose,
            time: it.time_of_day,
            note: it.note_zh || "",
          }))
        ),
      },
    });
  };

  // ✅ 刪除：刪主文件 + 刪子集合 items（不留殘渣）
  const confirmDelete = () => {
    Alert.alert("確認刪除", "這筆藥單紀錄將會永久移除。", [
      { text: "取消", style: "cancel" },
      {
        text: "確定刪除",
        style: "destructive",
        onPress: async () => {
          try {
            const presRef = doc(db, "prescriptions", p.prescriptionId);

            // 1) 先刪 items 子集合
            const itemsSnap = await getDocs(collection(db, "prescriptions", p.prescriptionId, "items"));
            const batch = writeBatch(db);
            itemsSnap.docs.forEach((d) => batch.delete(d.ref));
            await batch.commit();

            // 2) 再刪主文件
            await deleteDoc(presRef);

            router.back();
          } catch (e) {
            console.log("family delete error:", e);
            Alert.alert("刪除失敗", "請稍後再試");
          }
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 90, gap: 16 }}>
      {/* ✅ 標題區塊：UI 不動 */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 26, fontWeight: "900", color: "#333" }}>
            {p.title || "藥單詳情"}
          </Text>
          <Text style={{ opacity: 0.5, marginTop: 4 }}>
            錄入日期：{new Date(p.createdAt).toLocaleDateString()}
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

      {(p.items ?? []).map((it: any, idx: number) => (
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

          <Text style={{ fontSize: 16 }}>
            服用時段：{(it.time_of_day ?? []).map((t: string) => TIME_LABELS[t] || t).join(", ")}
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
      ))}

      <View style={{ marginTop: 20, gap: 12 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 16, backgroundColor: "#007AFF", borderRadius: 12 }}>
          <Text style={{ color: "#fff", textAlign: "center", fontSize: 18, fontWeight: "700" }}>
            返回列表
          </Text>
        </Pressable>

        <Pressable onPress={confirmDelete} style={{ padding: 12 }}>
          <Text style={{ color: "#FF3B30", textAlign: "center", fontWeight: "600" }}>
            刪除此筆紀錄
          </Text>
        </Pressable>

        <Text style={{ textAlign: "center", fontSize: 10, color: "#ccc" }}>
          ID: {p.prescriptionId}
        </Text>
      </View>
    </ScrollView>
  );
}