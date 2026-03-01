import { db } from "@/firebase/firebaseConfig";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { router } from "expo-router";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

function toMillis(ts: any): number {
  if (ts?.toMillis) return ts.toMillis();
  if (ts?.seconds) return ts.seconds * 1000;
  if (typeof ts === "number") return ts;
  return Date.now();
}

export default function FamilyListScreen() {
  const { activeCareTargetId, activeCareTarget } = useActiveCareTarget();
  const [list, setList] = useState<any[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!activeCareTargetId) return;

    const q = query(
      collection(db, "prescriptions"),
      where("careTargetId", "==", activeCareTargetId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            prescriptionId: d.id,
            title: data.title ?? "未命名藥單",
            createdAt: toMillis(data.createdAt),
            status: data.status ?? "",
            sourceImageUrl: data.sourceImageUrl ?? "",
          };
        });
        setList(rows);
        setReady(true);
      },
      (err) => {
        console.log("prescriptions snapshot error:", err);
        setReady(true);
      }
    );

    return unsub;
  }, [activeCareTargetId]);

  const confirmDelete = (id: string) => {
    Alert.alert("確認刪除", "刪除後無法還原，確定嗎？", [
      { text: "取消", style: "cancel" },
      { text: "確定刪除", style: "destructive", onPress: () => Alert.alert("提示", "刪除功能尚未實作") },
    ]);
  };

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>讀取雲端資料中…</Text>
      </View>
    );
  }

  if (!activeCareTargetId) {
    return (
      <View style={{ flex: 1, padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "800" }}>請先選擇長輩</Text>
        <Pressable onPress={() => router.replace("/family")}>
          <Text style={{ color: "#007AFF" }}>前往選擇頁面</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop:90, gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: "800" }}>藥單紀錄簿</Text>
      <Text style={{ opacity: 0.6 }}>長輩：{activeCareTarget?.name}</Text>

      {list.length === 0 ? (
        <Text style={{ marginTop: 40, textAlign: "center", opacity: 0.5 }}>
          目前沒有紀錄，請點選「掃描藥單」開始
        </Text>
      ) : (
        list.map((p: any) => (
          <View
            key={p.prescriptionId}
            style={{
              padding: 16,
              borderWidth: 1,
              borderRadius: 12,
              borderColor: "#ddd",
              backgroundColor: "#fff",
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: "800", color: "#333" }}>
              {p.title || "未命名藥單"}
            </Text>

            <Text style={{ fontSize: 14, color: "#666" }}>
              日期：{new Date(p.createdAt).toLocaleDateString()}
            </Text>

            <Text style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>
              ID：{p.prescriptionId}
            </Text>

            <View style={{ flexDirection: "row", gap: 16, borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 8 }}>
              <Pressable
                onPress={() => router.push({ pathname: "/family/detail", params: { id: p.prescriptionId } })}
              >
                <Text style={{ color: "#007AFF", fontSize: 16, fontWeight: "700" }}>查看詳情</Text>
              </Pressable>

              <Pressable onPress={() => confirmDelete(p.prescriptionId)}>
                <Text style={{ color: "#FF3B30", fontSize: 16, fontWeight: "700" }}>刪除</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      <Pressable
        onPress={() => router.replace("/family")}
        style={{ marginTop: 20, padding: 16, backgroundColor: "#F2F2F7", borderRadius: 12 }}
      >
        <Text style={{ color: "#666", textAlign: "center", fontWeight: "700", fontSize: 16 }}>返回首頁</Text>
      </Pressable>
    </ScrollView>
  );
}