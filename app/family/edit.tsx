import { useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

// 定義資料型別，將 time 改為字串陣列以支援多選
type Item = { name: string; dose: string; time: string[]; note: string };

const TIME_LABELS: Record<string, string> = {
  morning: "早上",
  noon: "中午",
  afternoon: "下午",
  night: "晚上",
};

function safeParseItems(itemsJson?: string): Item[] {
  if (!itemsJson) return [];
  try {
    const data = JSON.parse(itemsJson);
    if (!Array.isArray(data)) return [];

    return data.map((it: any) => {
      // ✅ 修正重點：判斷 time 是否已經是陣列
      let parsedTime: string[] = ["morning"]; // 預設值

      if (Array.isArray(it.time)) {
        // 如果是編輯頁傳回來的 (it.time)
        parsedTime = it.time;
      } else if (Array.isArray(it.time_of_day)) {
        // 如果是從資料庫/詳細頁傳過來的 (it.time_of_day)
        parsedTime = it.time_of_day;
      } else if (typeof it.time === 'string' && it.time) {
        // 如果是舊格式的字串，轉成陣列
        parsedTime = [it.time];
      }

      return {
        name: it.name || it.drug_name_zh || "",
        dose: it.dose || "",
        time: parsedTime, // ✅ 確保這裡一定是字串陣列
        note: it.note || it.note_zh || "",
      };
    });
  } catch {
    return [];
  }
}

export default function FamilyEditScreen() {
  const { imageUri, itemsJson, id, title: initialTitle } = useLocalSearchParams<{ 
    imageUri?: string; 
    itemsJson?: string; 
    id?: string; 
    title?: string 
  }>();

  const initial = useMemo(() => safeParseItems(itemsJson), [itemsJson]);
  const [items, setItems] = useState<Item[]>(
    initial.length > 0 ? initial : [{ name: "", dose: "", time: ["morning"], note: "" }]
  );

  function updateItem(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addRow() {
    setItems((prev) => [...prev, { name: "", dose: "", time: ["morning"], note: "" }]);
  }

  function removeRow(idx: number) {
    if (items.length <= 1) {
      Alert.alert("提醒", "至少需保留一個項目");
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSave() {
    if (items.some(it => !it.name.trim())) {
      Alert.alert("請檢查", "藥名不能為空");
      return;
    }
    // 使用 replace 防止頁面堆疊導致打轉
    router.replace({
      pathname: "/family/result",
      params: {
        id: id ?? "",
        imageUri: imageUri ?? "",
        itemsJson: JSON.stringify(items),
        title: initialTitle ?? "",
      },
    });
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop:90, paddingBottom: 60, gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "800" }}>修正藥單資訊</Text>
      
      {items.map((it, idx) => (
        <View key={idx} style={{ padding: 16, borderWidth: 1, borderColor: "#ddd", borderRadius: 12, backgroundColor: "#fefefe", gap: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontWeight: "800", color: "#007AFF" }}>項目 {idx + 1}</Text>
            <Pressable onPress={() => removeRow(idx)}>
              <Text style={{ color: "#FF3B30", fontWeight: "600" }}>刪除</Text>
            </Pressable>
          </View>

          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: "600" }}>藥名</Text>
            <TextInput
              value={it.name}
              onChangeText={(t) => updateItem(idx, { name: t })}
              style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, backgroundColor: "#fff" }}
            />
          </View>

          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: "600" }}>服用時段 (可多選)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {Object.entries(TIME_LABELS).map(([value, label]) => {
                const isSelected = it.time.includes(value);
                return (
                  <Pressable
                    key={value}
                    onPress={() => {
                      const nextTime = isSelected
                        ? it.time.filter(t => t !== value)
                        : [...it.time, value];
                      updateItem(idx, { time: nextTime });
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: isSelected ? "#007AFF" : "#ccc",
                      backgroundColor: isSelected ? "#007AFF" : "#fff",
                    }}
                  >
                    <Text style={{ color: isSelected ? "#fff" : "#333", fontWeight: '600', fontSize: 13 }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: "600" }}>劑量</Text>
            <TextInput
              value={it.dose}
              onChangeText={(t) => updateItem(idx, { dose: t })}
              style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, backgroundColor: "#fff" }}
            />
          </View>

          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: "600" }}>備註</Text>
            <TextInput
              value={it.note}
              onChangeText={(t) => updateItem(idx, { note: t })}
              placeholder="例如：飯後服用"
              style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, backgroundColor: "#fff" }}
            />
          </View>
        </View>
      ))}

      <Pressable onPress={addRow} style={{ padding: 16, borderStyle: "dashed", borderWidth: 1, borderColor: "#007AFF", borderRadius: 12 }}>
        <Text style={{ color: "#007AFF", textAlign: "center", fontWeight: "700" }}>＋ 新增藥品項目</Text>
      </Pressable>

      <Pressable onPress={onSave} style={{ padding: 16, backgroundColor: "#007AFF", borderRadius: 12, marginTop: 10 }}>
        <Text style={{ color: "#fff", textAlign: "center", fontSize: 18, fontWeight: "700" }}>完成修正並預覽</Text>
      </Pressable>
      <Pressable 
        onPress={() => {
          Alert.alert("取消編輯", "尚未儲存的變更將會消失，確定要取消嗎？", [
            { text: "繼續編輯", style: "cancel" },
            { text: "確定取消", style: "destructive", onPress: () => router.back() }
          ]);
        }} 
        style={{ padding: 12, marginTop: 4 }}
      >
        <Text style={{ color: "#999", textAlign: "center", fontWeight: "600", fontSize: 15 }}>
          取消並返回
        </Text>
      </Pressable>
    </ScrollView>
  );
}