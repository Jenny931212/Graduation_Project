import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/src/auth/useAuth";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";

function RoleDot({ role }: { role: "caregiver" | "family" }) {
  const label = role === "caregiver" ? "看護" : "家屬";
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ fontWeight: "800" }}>{label}</Text>
    </View>
  );
}

export default function ActiveCareTargetBanner() {
  const { user } = useAuth();
  const { activeCareTarget, activeCareTargetId } = useActiveCareTarget();

  // 未登入或還沒有資料：不顯示（避免一直跳）
  if (!user) return null;

  const name = activeCareTarget?.name ?? "(尚未選擇長輩)";
  const hint = activeCareTargetId ? `ID：${activeCareTargetId}` : "請先選擇要查看的長輩";

  return (
    <View
      style={{
        borderWidth: 1,
        borderRadius: 14,
        padding: 14,
        gap: 8,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "900" }}>目前長輩</Text>
          <Text style={{ fontSize: 18, fontWeight: "900", marginTop: 4 }}>{name}</Text>
          <Text style={{ opacity: 0.7, marginTop: 2 }}>{hint}</Text>
        </View>

        <RoleDot role={user.role} />
      </View>

      <Pressable
        onPress={() => router.push("/care-target/select" as any)}
        style={{ paddingVertical: 8 }}
      >
        <Text style={{ color: "#007AFF", fontSize: 16, fontWeight: "800" }}>
          切換長輩
        </Text>
      </Pressable>
    </View>
  );
}
