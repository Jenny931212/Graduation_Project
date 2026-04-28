import { db } from "@/firebase/firebaseConfig";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { Stack, router, useSegments } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";

export default function CaregiverLayout() {
  const segments = useSegments() as string[];
  
  // 💡 取得目前所在的最後一個路徑名稱
  const currentRoute = segments[segments.length - 1];

  // 💡 將需要「隱藏底部導覽列」的頁面統整成一個陣列 (加入 video-record)
  const hideFooterRoutes = ["chat-room", "video-record"];
  const shouldHideFooter = hideFooterRoutes.includes(currentRoute);

  const activeCareTarget = useActiveCareTarget();
  const activePatientId =
    (activeCareTarget as any)?.activePatientId ??
    (activeCareTarget as any)?.activeCareTargetId ??
    "";

  async function makePhoneCall(phone: string) {
    try {
      const url = `tel:${phone}`;
      const supported = await Linking.canOpenURL(url);

      if (!supported) {
        Alert.alert("撥號失敗", "此裝置目前無法開啟撥號功能");
        return;
      }

      await Linking.openURL(url);
    } catch (e) {
      console.log("phone call failed:", e);
      Alert.alert("撥號失敗", "目前無法撥打這支電話");
    }
  }

  async function onEmergencyCall() {
    if (!activePatientId) {
      Alert.alert("提醒", "目前沒有選擇照顧對象");
      return;
    }

    try {
      const patientSnap = await getDoc(doc(db, "patients", activePatientId));

      if (!patientSnap.exists()) {
        Alert.alert("錯誤", "找不到照顧對象資料");
        return;
      }

      const data = patientSnap.data() as any;
      const phone1 = String(data.emergencyPhone1 ?? "").trim();
      const phone2 = String(data.emergencyPhone2 ?? "").trim();

      const phones = [phone1, phone2].filter(Boolean);

      if (phones.length === 0) {
        Alert.alert("尚未設定", "這位長輩尚未設定緊急聯絡電話");
        return;
      }

      if (phones.length === 1) {
        await makePhoneCall(phones[0]);
        return;
      }

      Alert.alert("選擇要撥打的電話", "請選擇緊急聯絡人", [
        {
          text: `聯絡電話 1：${phones[0]}`,
          onPress: () => {
            void makePhoneCall(phones[0]);
          },
        },
        {
          text: `聯絡電話 2：${phones[1]}`,
          onPress: () => {
            void makePhoneCall(phones[1]);
          },
        },
        { text: "取消", style: "cancel" },
      ]);
    } catch (e) {
      console.log("emergency call failed:", e);
      Alert.alert("撥號失敗", "目前無法撥打緊急聯絡電話");
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
      </View>

      {/* 💡 只有在「不需要隱藏」的頁面時，才渲染這塊客製化導覽列 */}
      {!shouldHideFooter && (
        <View style={styles.footerWrapper}>
          <View style={styles.fabContainer}>
            <Pressable style={styles.fabButton} onPress={onEmergencyCall}>
              <Text style={styles.fabIcon}>📞</Text>
            </Pressable>
          </View>

          <View style={styles.bottomNav}>
            <Pressable onPress={() => router.navigate("/caregiver" as any)}>
              <Text style={styles.navIcon}>🏠</Text>
            </Pressable>

            <Pressable onPress={() => Alert.alert("提示", "行事曆功能建置中")}>
              <Text style={[styles.navIcon, { paddingRight: 48 }]}>📅</Text>
            </Pressable>

            <Pressable onPress={() => Alert.alert("提示", "通知功能建置中")}>
              <Text style={[styles.navIcon, { paddingLeft: 48 }]}>🔔</Text>
            </Pressable>

            <Pressable onPress={() => router.push("/caregiver/chat-list" as any)}>
              <Text style={styles.navIcon}>💬</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF" },
  content: { flex: 1 },
  footerWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  fabContainer: {
    position: "absolute",
    bottom: 45,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 50,
  },
  fabButton: {
    width: 80,
    height: 80,
    backgroundColor: "#EF3E3E",
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#EF3E3E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 40,
    marginLeft: 4,
    transform: [{ rotate: "-15deg" }],
  },
  bottomNav: {
    backgroundColor: "#EAEAEA",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
    zIndex: 10,
  },
  navIcon: { fontSize: 32 },
});