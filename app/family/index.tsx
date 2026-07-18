// app/family/index.tsx
import { db } from "@/firebase/firebaseConfig";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";

// 定義生理數據狀態型別
type VitalStatus = 'normal' | 'abnormal' | 'outdated' | 'nodata';
type SingleVital = { val: number; ts: number } | null;
type BloodPressureVital = { sys: number; dia: number; ts: number } | null;
type SugarVital = { val: number; type: string; ts: number } | null;

export default function FamilyHomeScreen() {
  const { ready, activePatient, activePatientId, linkedCareTargets, setActivePatientId } = useActiveCareTarget();
  const { language } = useLanguage();
  const t = translations[language];

  // 存放最新的生理數據
  const [vitals, setVitals] = useState<any>({
    temp: null,
    hr: null,
    bp: null,
    sugar: null,
    hasAnyData: false
  });

  useEffect(() => {
    if (!ready) return;
    if (linkedCareTargets.length === 0) {
      router.replace("/care-target/create");
    }
  }, [ready, linkedCareTargets.length]);

  // ==========================================
  // 邏輯：監聽健康紀錄，抓出最新數值
  // ==========================================
  useEffect(() => {
    if (!ready || !activePatientId) return;

    // 抓取最近 10 筆健康紀錄，來拼湊出最新的各項生理數值
    const q = query(
      collection(db, "health_records"),
      where("patientId", "==", activePatientId),
      orderBy("createdAt", "desc"),
      limit(10)
    );

    const unsub = onSnapshot(q, (snap) => {
      let temp: SingleVital = null;
      let hr: SingleVital = null;
      let bp: BloodPressureVital = null;
      let sugar: SugarVital = null;
      let hasAnyData = false;

      snap.docs.forEach(doc => {
        const d = doc.data();
        const ts = d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.now();
        hasAnyData = true;

        // 如果還沒找到該項目的最新值，且這份文件有該數值，就填入
        if (!temp && d.temperature) temp = { val: d.temperature, ts };
        if (!hr && d.heartRate) hr = { val: d.heartRate, ts };
        if (!bp && d.bloodPressureSys && d.bloodPressureDia) bp = { sys: d.bloodPressureSys, dia: d.bloodPressureDia, ts };
        if (!sugar && d.bloodSugar) sugar = { val: d.bloodSugar, type: d.bloodSugarType || t.fasting, ts };
      });

      setVitals({ temp, hr, bp, sugar, hasAnyData });
    });

    return unsub;
  }, [ready, activePatientId]);

  const copyInviteCode = async () => {
    if (activePatient?.inviteCode) {
      await Clipboard.setStringAsync(activePatient.inviteCode);
      Alert.alert(t.copiedTitle, t.copiedInviteCode);
    }
  };

  if (!ready || linkedCareTargets.length === 0) {
    return <ActivityIndicator style={{ flex: 1, justifyContent: "center" }} />;
  }

  // 💡 假資料變數 (藥單部分保留假資料)
  const stats = { total: 0 }; 

  // ==========================================
  // UI 輔助函式：判斷醫學數值正常與否 & 時效
  // ==========================================
  const checkVitalStatus = (type: string, data: any): VitalStatus => {
    if (!data) return 'nodata';
    
    // 檢查是否超過 24 小時未更新 (灰色)
    const isOutdated = (Date.now() - data.ts) > 24 * 60 * 60 * 1000;
    if (isOutdated) return 'outdated';

    // 醫學判斷邏輯 (紅色/綠色)
    if (type === 'temp') {
      if (data.val < 36.0 || data.val > 37.5) return 'abnormal';
    } else if (type === 'hr') {
      if (data.val < 60 || data.val > 100) return 'abnormal';
    } else if (type === 'bp') {
      // 收縮壓 90~140，舒張壓 60~90 算正常 (長輩標準)
      if (data.sys < 90 || data.sys > 120 || data.dia < 60 || data.dia > 90) return 'abnormal';
    } else if (type === 'sugar') {
      if ((data.type === '空腹' || data.type === t.fasting) && (data.val < 70 || data.val > 100)) return 'abnormal';
      if ((data.type === '飯後' || data.type === t.afterMeal) && (data.val < 70 || data.val > 140)) return 'abnormal';
    }
    return 'normal';
  };

  // 根據狀態取得對應色號
  const getVitalColors = (status: VitalStatus) => {
    if (status === 'normal') return { top: '#7AEE90', bottom: '#849F84' }; // 綠色
    if (status === 'abnormal') return { top: '#FA7474', bottom: '#987A7A' }; // 紅色
    return { top: '#D4D4D4', bottom: '#8E8E8E' }; // 灰色 (過期或無資料)
  };

  // 格式化時間 (顯示 8:00 今日/昨天/X月X日)
  const formatTime = (ts: number | undefined) => {
    if (!ts) return { time: '--:--', label: '--' };
    const d = new Date(ts);
    const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label = `${d.getMonth() + 1}月${d.getDate()}日`;
    if (d.toDateString() === today.toDateString()) label = t.today;
    else if (d.toDateString() === yesterday.toDateString()) label = t.yesterday;

    return { time, label };
  };

  // 渲染獨立的生理卡片
  const renderVitalBlock = (title: string, type: 'temp'|'hr'|'bp'|'sugar', data: any) => {
    const status = checkVitalStatus(type, data);
    const colors = getVitalColors(status);
    const { time, label } = formatTime(data?.ts);

    return (
      <View style={styles.vitalBlock}>
        <Text
          style={styles.vitalTitle}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
        >
          {title}
        </Text>
        <View style={styles.vitalCardWrap}>
          {/* 上半部：數據區 */}
          <View style={[styles.vitalCardTop, { backgroundColor: colors.top }]}>
            {data ? (
              type === 'bp' ? (
                <>
                  <Text style={[styles.vitalValue, { fontSize: 26 }]}>{data.sys}</Text>
                  <Text style={[styles.vitalValue, { fontSize: 26, marginBottom: 2 }]}>{data.dia}</Text>
                  <Text style={[styles.vitalUnit, { fontSize: 12 }]}>mmhg</Text>
                </>
              ) : type === 'sugar' ? (
                <>
                  <Text style={[styles.vitalValue, { fontSize: 28, marginTop: 4, marginBottom: 2 }]}>{data.val}</Text>
                  <Text style={[styles.vitalUnit, { fontSize: 12 }]}>{data.type}</Text>
                  <Text style={[styles.vitalUnit, { fontSize: 12 }]}>mg/dl</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.vitalValue, { fontSize: 34, marginBottom: 2 }]}>{data.val}</Text>
                  <Text style={[styles.vitalUnit, { fontSize: 14 }]}>{type === 'temp' ? '°C' : 'bpm'}</Text>
                </>
              )
            ) : (
              <Text style={styles.vitalValue}>--</Text>
            )}
          </View>
          {/* 下半部：時間區 */}
          <View style={[styles.vitalCardBottom, { backgroundColor: colors.bottom }]}>
            <Text style={styles.vitalTimeText}>{time}</Text>
            <Text style={styles.vitalLabelText}>{label}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Header 區塊：長輩切換頭像列 (已移除舊的漢堡選單) */}
        <View style={styles.header}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarList}>
            {linkedCareTargets.map((target) => {
              const isActive = target.id === activePatientId;
              return (
                <Pressable key={target.id} onPress={() => setActivePatientId(target.id)}>
                  <View style={[styles.avatar, isActive ? styles.avatarActive : styles.avatarInactive]}>
                    <Text style={[styles.avatarText, isActive ? styles.textWhite : styles.textGray]}>
                      {target.name ? target.name.charAt(0) : "?"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            <Pressable onPress={() => router.push("/care-target/create")}>
              <View style={styles.avatarAdd}><Text style={styles.avatarAddText}>+</Text></View>
            </Pressable>
          </ScrollView>
        </View>

        {/* 使用者資訊區塊 */}
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{activePatient?.name ?? t.noSelectedPatient}</Text>
          <View style={styles.inviteBadge}><Text style={styles.inviteText}>{t.inviteCode}:{activePatient?.inviteCode ?? t.none}</Text></View>
          <Pressable onPress={copyInviteCode} style={styles.copyIconWrap}>
            <View style={styles.copyIconBack} /><View style={styles.copyIconFront} />
          </Pressable>
        </View>

        {/* 今日用藥進度卡片 */}
        <View style={styles.medCard}>
          <Text style={styles.medTitle}>{t.todayMedicationProgress}</Text>
          {stats.total > 0 ? (
            <><Text style={styles.medProgress}>{t.ready}</Text><Text style={styles.medDetail}>{t.waitingMedicationReport}</Text></>
          ) : (
            <View style={{ alignItems: "center", marginTop: 10 }}>
              <Text style={{ fontSize: 16, color: "#999", fontWeight: "bold" }}>{t.noPrescriptions}</Text>
              <Text style={{ fontSize: 14, color: "#CCC", marginTop: 4 }}>{t.askCaregiverAddPrescription}</Text>
            </View>
          )}
        </View>

        {/* 生理數據卡片 (✅ 動態資料綁定) */}
        <View style={styles.vitalsOuterCard}>
          {!vitals.hasAnyData ? (
            <View style={{ paddingVertical: 30, alignItems: "center" }}>
              <Text style={{ fontSize: 18, color: "#999", fontWeight: "bold" }}>{t.noVitals}</Text>
              <Text style={{ fontSize: 14, color: "#CCC", marginTop: 8 }}>{t.vitalsWillShow}</Text>
            </View>
          ) : (
            <View style={styles.vitalsGrid}>
              {renderVitalBlock(t.temperature, 'temp', vitals.temp)}
              {renderVitalBlock(t.heartRate, 'hr', vitals.hr)}
              {renderVitalBlock(t.bloodPressure, 'bp', vitals.bp)}
              {renderVitalBlock(t.bloodSugar, 'sugar', vitals.sugar)}
            </View>
          )}
          <Pressable onPress={() => router.push("/family/dashboard" as any)} style={styles.chartBtn}>
            <Text style={styles.chartBtnText}>{t.viewChart}</Text>
          </Pressable>
        </View>

        {/* 底部三大功能按鈕 */}
        <View style={styles.actionsRow}>
          <Pressable onPress={() => router.push("/family/list")} style={[styles.actionBtn, { backgroundColor: '#F4E770' }]}>
            <Text style={styles.actionEmoji}>📋</Text><Text style={styles.actionText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{t.prescriptionRecords}</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/family/condition" as any)} style={[styles.actionBtn, { backgroundColor: '#85C6F9' }]}>
            <Text style={styles.actionEmoji}>📹</Text><Text style={styles.actionText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{t.conditionView}</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/family/voice")} style={[styles.actionBtn, { backgroundColor: '#85E785' }]}>
            <Text style={styles.actionEmoji}>🎙️</Text><Text style={styles.actionText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{t.recordVoice}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  scrollContent: { paddingBottom: 100, paddingTop: 80 }, // 🌟 調整了 padding，閃開全域漢堡選單
  header: { flexDirection: "row", justifyContent: "flex-start", alignItems: "center", paddingHorizontal: 20, paddingVertical: 8 },
  avatarList: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center" },
  avatarActive: { backgroundColor: "#000" },
  avatarInactive: { backgroundColor: "#D9D9D9" },
  avatarText: { fontSize: 20, fontWeight: "bold" },
  textWhite: { color: "#FFF" },
  textGray: { color: "#666" },
  avatarAdd: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#E0E0E0", justifyContent: "center", alignItems: "center" },
  avatarAddText: { fontSize: 24, fontWeight: "bold", color: "#000", marginBottom: 4 },
  
  userInfo: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginTop: 8, marginBottom: 16 },
  userName: { fontSize: 28, fontWeight: "bold", letterSpacing: 2, color: "#000", marginRight: 12 },
  inviteBadge: { backgroundColor: "#E5E5E5", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 12 },
  inviteText: { color: "#4B5563", fontWeight: "600", fontSize: 14 },
  copyIconWrap: { width: 24, height: 24, position: "relative" },
  copyIconBack: { position: "absolute", top: 2, left: 2, width: 18, height: 18, borderWidth: 2, borderColor: "#000", borderRadius: 4 },
  copyIconFront: { position: "absolute", bottom: 2, right: 2, width: 18, height: 18, borderWidth: 2, borderColor: "#000", borderRadius: 4, backgroundColor: "#FFF" },
  
  // 藥單卡片
  medCard: { backgroundColor: "#F7F7F7", marginHorizontal: 20, borderRadius: 20, paddingVertical: 20, paddingHorizontal: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  medTitle: { fontSize: 22, fontWeight: "bold", textAlign: "center", color: "#000", letterSpacing: 1, marginBottom: 8 },
  medProgress: { fontSize: 26, fontWeight: "bold", textAlign: "center", color: "#000", marginBottom: 12 },
  medDetail: { fontSize: 16, textAlign: "center", color: "#000", fontWeight: "500" },
  
  // 生理數據卡片外框
  vitalsOuterCard: { backgroundColor: "#F2F2F2", marginHorizontal: 20, marginTop: 16, borderRadius: 20, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  vitalsGrid: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  
  // 獨立的生理數據小方塊
  vitalBlock: { flex: 1, alignItems: "center" },
  vitalTitle: {
    width: "100%",
    height: 44,
    fontSize: 18,
    lineHeight: 21,
    fontWeight: "bold",
    color: "#000",
    letterSpacing: 0.3,
    marginBottom: 8,
    textAlign: "center",
    textAlignVertical: "center",
  },
  vitalCardWrap: { width: "100%", height: 130, borderRadius: 12, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
  
  vitalCardTop: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 2 },
  vitalCardBottom: { height: 46, justifyContent: "center", alignItems: "center" },
  
  vitalValue: { color: "#000", fontWeight: "500" }, 
  vitalUnit: { color: "#000", fontWeight: "400" },
  
  vitalTimeText: { color: "#FFF", fontSize: 15, fontWeight: "500" },
  vitalLabelText: { color: "#F3F4F6", fontSize: 13 },
  
  chartBtn: { backgroundColor: "#F5A623", borderRadius: 24, paddingVertical: 10, paddingHorizontal: 24, alignSelf: "center", marginTop: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  chartBtnText: { color: "#FFF", fontSize: 17, fontWeight: "bold" },
  actionsRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginHorizontal: 20, marginTop: 20 },
  actionBtn: { flex: 1, aspectRatio: 1, borderRadius: 20, justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
  actionEmoji: { fontSize: 40, marginBottom: 8 },
  actionText: {
    width: "92%",
    minHeight: 38,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "bold",
    color: "#000",
    letterSpacing: 0.2,
    textAlign: "center",
    textAlignVertical: "center",
  }
});
