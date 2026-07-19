// app/family/dashboard.tsx
import { db } from "@/firebase/firebaseConfig";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import HealthTrendChart from "@/src/health/HealthTrendChart";
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";
import {
  ChartDataType,
  ChartTimeRange,
  useHealthChartData,
} from "@/src/health/useHealthChartData";
import { PatientThresholds, useHealthThresholds } from "@/src/health/useHealthThresholds";
import { router } from "expo-router";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";

type VitalStatus = "normal" | "abnormal" | "outdated" | "nodata";
type SingleVital = { val: number; ts: number; } | null;
type BloodPressureVital = { sys: number; dia: number; ts: number; } | null;
type VitalsState = {
  temp: SingleVital;
  hr: SingleVital;
  bp: BloodPressureVital;
  sugarFasting: SingleVital;
  sugarAfter: SingleVital;
  hasAnyData: boolean;
};

// ─────────────────────────────────────────
// 醫學 critical 邊界（前端防呆用）
// ─────────────────────────────────────────
const CRITICAL_BOUNDS = {
  temperature: { minSafe: 35.0, maxSafe: 39.0 },
  heartRate:   { minSafe: 40,   maxSafe: 150  },
  systolic:    { minSafe: 80,   maxSafe: 160  },
  diastolic:   { minSafe: 50,   maxSafe: 100  },
  bloodSugarBefore: { minSafe: 60, maxSafe: 200 },
  bloodSugarAfter:  { minSafe: 60, maxSafe: 250 },
};

export default function FamilyDashboardScreen() {
  const { ready, activePatientId } = useActiveCareTarget();
  const { language } = useLanguage();
  const t = translations[language];

  const [activeTab, setActiveTab] = useState<"history" | "today" | "settings">("today");
  const [chartDataType, setChartDataType] = useState<ChartDataType>("體溫");
  const [chartTimeRange, setChartTimeRange] = useState<ChartTimeRange>("1周");

  const dataTypes: ChartDataType[] = ["體溫", "心跳", "血壓", "血糖"];
  const timeRanges: ChartTimeRange[] = ["1周", "2周", "1個月", "全部"];

  const { loading, empty, lineData, bpSysData, bpDiaData } = useHealthChartData({
    patientId: activePatientId ?? undefined,
    chartDataType,
    chartTimeRange,
  });

  const { thresholds: dbThresholds, loading: thresholdsLoading, saveThresholds } = useHealthThresholds(activePatientId ?? "");
  const [localThresholds, setLocalThresholds] = useState<PatientThresholds>(dbThresholds);

  useEffect(() => {
    if (!thresholdsLoading) {
      setLocalThresholds(dbThresholds);
    }
  }, [dbThresholds, thresholdsLoading]);

  const [vitals, setVitals] = useState<VitalsState>({
    temp: null, hr: null, bp: null, sugarFasting: null, sugarAfter: null, hasAnyData: false,
  });

  useEffect(() => {
    if (!ready || !activePatientId) return;

    const q = query(
      collection(db, "health_records"),
      where("patientId", "==", activePatientId),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsub = onSnapshot(q, (snap) => {
      let temp: SingleVital = null; let hr: SingleVital = null; let bp: BloodPressureVital = null;
      let sugarFasting: SingleVital = null; let sugarAfter: SingleVital = null;
      let hasAnyData = false; let hasFoundLatestSugar = false;

      snap.docs.forEach((doc) => {
        const d = doc.data() as any;
        const ts = d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.now();
        hasAnyData = true;

        if (!temp && d.temperature !== undefined) temp = { val: d.temperature, ts };
        if (!hr && d.heartRate !== undefined) hr = { val: d.heartRate, ts };
        if (!bp && d.bloodPressureSys !== undefined && d.bloodPressureDia !== undefined) {
          bp = { sys: d.bloodPressureSys, dia: d.bloodPressureDia, ts };
        }
        if (!hasFoundLatestSugar && d.bloodSugar !== undefined) {
          hasFoundLatestSugar = true;
          if (d.bloodSugarType === "空腹") {
            sugarFasting = { val: d.bloodSugar, ts };
          } else if (d.bloodSugarType === "飯後" || d.bloodSugarType === "餐後") {
            sugarAfter = { val: d.bloodSugar, ts };
          }
        }
      });

      setVitals({ temp, hr, bp, sugarFasting, sugarAfter, hasAnyData });
    });

    return unsub;
  }, [ready, activePatientId]);

  const checkVitalStatus = (
    type: string,
    data: SingleVital | BloodPressureVital,
    sugarData2?: SingleVital
  ): VitalStatus => {
    if (!data && !sugarData2) return "nodata";

    let latestTs = data?.ts || 0;
    if (sugarData2?.ts && sugarData2.ts > latestTs) latestTs = sugarData2.ts;

    const isOutdated = Date.now() - latestTs > 24 * 60 * 60 * 1000;
    if (isOutdated && latestTs !== 0) return "outdated";

    if (type === "temp" && data && "val" in data) {
      const min = dbThresholds.temperature.enabled ? Number(dbThresholds.temperature.min) : 36.0;
      const max = dbThresholds.temperature.enabled ? Number(dbThresholds.temperature.max) : 37.5;
      if (data.val < min || data.val > max) return "abnormal";
    } else if (type === "hr" && data && "val" in data) {
      const min = dbThresholds.heartRate.enabled ? Number(dbThresholds.heartRate.min) : 60;
      const max = dbThresholds.heartRate.enabled ? Number(dbThresholds.heartRate.max) : 100;
      if (data.val < min || data.val > max) return "abnormal";
    } else if (type === "bp" && data && "sys" in data && "dia" in data) {
      const sysMin = dbThresholds.systolic.enabled ? Number(dbThresholds.systolic.min) : 90;
      const sysMax = dbThresholds.systolic.enabled ? Number(dbThresholds.systolic.max) : 140;
      const diaMin = dbThresholds.diastolic.enabled ? Number(dbThresholds.diastolic.min) : 60;
      const diaMax = dbThresholds.diastolic.enabled ? Number(dbThresholds.diastolic.max) : 90;
      if (data.sys < sysMin || data.sys > sysMax || data.dia < diaMin || data.dia > diaMax) {
        return "abnormal";
      }
    } else if (type === "sugar") {
      let isAbnormal = false;
      if (data && "val" in data) {
        const beforeMin = dbThresholds.bloodSugar.enabled ? Number(dbThresholds.bloodSugar.beforeMin) : 70;
        const beforeMax = dbThresholds.bloodSugar.enabled ? Number(dbThresholds.bloodSugar.beforeMax) : 130;
        if (data.val < beforeMin || data.val > beforeMax) isAbnormal = true;
      }
      if (sugarData2) {
        const afterMin = dbThresholds.bloodSugar.enabled ? Number(dbThresholds.bloodSugar.afterMin) : 70;
        const afterMax = dbThresholds.bloodSugar.enabled ? Number(dbThresholds.bloodSugar.afterMax) : 180;
        if (sugarData2.val < afterMin || sugarData2.val > afterMax) isAbnormal = true;
      }
      if (isAbnormal) return "abnormal";
    }

    return "normal";
  };

  const getCardColors = (status: VitalStatus) => {
    if (status === "normal") return { top: "#76C25F", bottom: "#98F698" };
    if (status === "abnormal") return { top: "#EE6A6E", bottom: "#F9A4A6" };
    return { top: "#A8A3A3", bottom: "#E6E6E6" };
  };

  const formatTime = (ts: number | undefined) => {
    if (!ts) return "";
    const d = new Date(ts);
    const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label = `${d.getMonth() + 1}/${d.getDate()}`;
    if (d.toDateString() === today.toDateString()) label = t.today;
    else if (d.toDateString() === yesterday.toDateString()) label = t.yesterday;

    return `${label} ${time}`;
  };

  const handleThresholdChange = (field: keyof PatientThresholds, key: string, value: string) => {
    setLocalThresholds(prev => ({
      ...prev,
      [field]: { ...prev[field], [key]: value }
    }));
  };

  const toggleThreshold = (field: keyof PatientThresholds) => {
    setLocalThresholds(prev => ({
      ...prev,
      [field]: { ...prev[field], enabled: !prev[field].enabled }
    }));
  };

  // ─────────────────────────────────────────
  // 防呆：檢查有沒有超過 critical 邊界的設定
  // ─────────────────────────────────────────
  const checkCriticalWarnings = (): string[] => {
    const warnings: string[] = [];

    const fmt = (template: string, val: number, safe: number) =>
      template.replace('{val}', String(val)).replace('{safe}', String(safe));

    if (localThresholds.temperature.enabled) {
      const max = Number(localThresholds.temperature.max);
      const min = Number(localThresholds.temperature.min);
      if (max >= CRITICAL_BOUNDS.temperature.maxSafe)
        warnings.push(fmt(t.tempMaxCriticalWarning, max, CRITICAL_BOUNDS.temperature.maxSafe));
      if (min <= CRITICAL_BOUNDS.temperature.minSafe)
        warnings.push(fmt(t.tempMinCriticalWarning, min, CRITICAL_BOUNDS.temperature.minSafe));
    }

    if (localThresholds.heartRate.enabled) {
      const max = Number(localThresholds.heartRate.max);
      const min = Number(localThresholds.heartRate.min);
      if (max >= CRITICAL_BOUNDS.heartRate.maxSafe)
        warnings.push(fmt(t.hrMaxCriticalWarning, max, CRITICAL_BOUNDS.heartRate.maxSafe));
      if (min <= CRITICAL_BOUNDS.heartRate.minSafe)
        warnings.push(fmt(t.hrMinCriticalWarning, min, CRITICAL_BOUNDS.heartRate.minSafe));
    }

    if (localThresholds.systolic.enabled) {
      const max = Number(localThresholds.systolic.max);
      const min = Number(localThresholds.systolic.min);
      if (max >= CRITICAL_BOUNDS.systolic.maxSafe)
        warnings.push(fmt(t.sysMaxCriticalWarning, max, CRITICAL_BOUNDS.systolic.maxSafe));
      if (min <= CRITICAL_BOUNDS.systolic.minSafe)
        warnings.push(fmt(t.sysMinCriticalWarning, min, CRITICAL_BOUNDS.systolic.minSafe));
    }

    if (localThresholds.diastolic.enabled) {
      const max = Number(localThresholds.diastolic.max);
      const min = Number(localThresholds.diastolic.min);
      if (max >= CRITICAL_BOUNDS.diastolic.maxSafe)
        warnings.push(fmt(t.diaMaxCriticalWarning, max, CRITICAL_BOUNDS.diastolic.maxSafe));
      if (min <= CRITICAL_BOUNDS.diastolic.minSafe)
        warnings.push(fmt(t.diaMinCriticalWarning, min, CRITICAL_BOUNDS.diastolic.minSafe));
    }

    if (localThresholds.bloodSugar.enabled) {
      const beforeMax = Number(localThresholds.bloodSugar.beforeMax);
      const beforeMin = Number(localThresholds.bloodSugar.beforeMin);
      const afterMax  = Number(localThresholds.bloodSugar.afterMax);
      const afterMin  = Number(localThresholds.bloodSugar.afterMin);
      if (beforeMax >= CRITICAL_BOUNDS.bloodSugarBefore.maxSafe)
        warnings.push(fmt(t.sugarBeforeMaxCriticalWarning, beforeMax, CRITICAL_BOUNDS.bloodSugarBefore.maxSafe));
      if (beforeMin <= CRITICAL_BOUNDS.bloodSugarBefore.minSafe)
        warnings.push(fmt(t.sugarBeforeMinCriticalWarning, beforeMin, CRITICAL_BOUNDS.bloodSugarBefore.minSafe));
      if (afterMax >= CRITICAL_BOUNDS.bloodSugarAfter.maxSafe)
        warnings.push(fmt(t.sugarAfterMaxCriticalWarning, afterMax, CRITICAL_BOUNDS.bloodSugarAfter.maxSafe));
      if (afterMin <= CRITICAL_BOUNDS.bloodSugarAfter.minSafe)
        warnings.push(fmt(t.sugarAfterMinCriticalWarning, afterMin, CRITICAL_BOUNDS.bloodSugarAfter.minSafe));
    }

    return warnings;
  };

  const doSave = async () => {
    try {
      await saveThresholds(localThresholds);
      Alert.alert(t.saveSuccessTitle, t.thresholdSaveSuccessMessage);
      setActiveTab("today");
    } catch (error) {
      Alert.alert(t.resultErrorTitle, t.thresholdSaveFailedMessage);
    }
  };

  const handleSave = () => {
    const warnings = checkCriticalWarnings();

    if (warnings.length > 0) {
      Alert.alert(
        t.thresholdWarningTitle,
        `${t.thresholdWarningBody}\n\n${warnings.join("\n")}`,
        [
          { text: t.resetSetting, style: "cancel" },
          { text: t.confirmSaveAnyway, style: "destructive", onPress: doSave },
        ]
      );
      return;
    }

    doSave();
  };

  const handleBackPress = () => {
    const hasChanges = JSON.stringify(dbThresholds) !== JSON.stringify(localThresholds);
    if (hasChanges) {
      Alert.alert(
        t.unsavedChangesTitle,
        t.unsavedChangesMessage,
        [
          { text: t.continueEditingLabel, style: "cancel" },
          {
            text: t.discardChangesLabel,
            style: "destructive",
            onPress: () => {
              setLocalThresholds(dbThresholds);
              setActiveTab("today");
            },
          },
        ]
      );
    } else {
      setActiveTab("today");
    }
  };

  if (!ready || thresholdsLoading) {
    return <ActivityIndicator style={{ flex: 1, justifyContent: "center" }} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.topContainer}>
        {activeTab === "settings" ? (
          <View style={[styles.headerRow, styles.settingsHeader]}>
            <Pressable onPress={handleBackPress} style={styles.settingsBackButton}>
              <Text style={styles.backButtonText}>← {t.back}</Text>
            </Pressable>
            <Text style={styles.settingsTitle}>{t.customThresholdTitle}</Text>
          </View>
        ) : (
          <>
            <View style={styles.headerRow}>
              <Pressable onPress={() => router.back()} style={styles.backButton}>
                <Text style={styles.backButtonText}>{t.backHome}</Text>
              </Pressable>
            </View>

            <View style={styles.tabRow}>
              <Pressable
                style={[styles.tabButton, activeTab === "history" && styles.tabButtonActive]}
                onPress={() => setActiveTab("history")}
              >
                <Text
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={[
                    styles.tabText,
                    activeTab === "history" ? styles.tabTextActive : styles.tabTextInactive,
                  ]}
                >
                  {t.historyTrend}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tabButton, activeTab === "today" && styles.tabButtonActive]}
                onPress={() => setActiveTab("today")}
              >
                <Text
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={[
                    styles.tabText,
                    activeTab === "today" ? styles.tabTextActive : styles.tabTextInactive,
                  ]}
                >
                  {t.todayRecords}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ================= 歷史趨勢 ================= */}
        {activeTab === "history" && (
          <View style={styles.tabContent}>
            <View style={styles.filterRow}>
              {dataTypes.map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setChartDataType(type)}
                  style={[
                    styles.filterBtn,
                    chartDataType === type ? styles.filterBtnActive : styles.filterBtnInactive,
                  ]}
                >
                  <Text
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                    style={[
                      styles.filterBtnText,
                      chartDataType === type
                        ? styles.filterTextActive
                        : styles.filterTextInactive,
                    ]}
                  >
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.filterRow}>
              {timeRanges.map((range) => (
                <Pressable key={range} onPress={() => setChartTimeRange(range)} style={[styles.filterBtn, chartTimeRange === range ? styles.filterBtnActive : styles.filterBtnInactive]}>
                  <Text style={[styles.filterBtnText, chartTimeRange === range ? styles.filterTextActive : styles.filterTextInactive]}>{range}</Text>
                </Pressable>
              ))}
            </View>
            <HealthTrendChart chartDataType={chartDataType} loading={loading} empty={empty} lineData={lineData} bpSysData={bpSysData} bpDiaData={bpDiaData} />
          </View>
        )}

        {/* ================= 本日紀錄 ================= */}
        {activeTab === "today" && (
          <View style={styles.tabContent}>
            <View style={{ alignItems: 'flex-end', marginBottom: 16 }}>
              <Pressable onPress={() => setActiveTab("settings")} style={styles.settingsBtn}>
                <Text style={styles.settingsBtnText}>{t.settingsButtonLabel}</Text>
              </Pressable>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCard}>
                {(() => {
                  const status = checkVitalStatus("temp", vitals.temp);
                  const colors = getCardColors(status);
                  return (
                    <>
                      <View style={[styles.cardHeader, { backgroundColor: colors.top }]}>
                        <Text style={styles.cardTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{t.temperature}</Text>
                      </View>
                      <View style={[styles.cardBody, { backgroundColor: colors.bottom }]}>
                        <View style={styles.valueRow}>
                          <Text style={styles.valueMain}>{vitals.temp?.val ?? "-"}</Text>
                          <Text style={styles.valueUnit}>°C</Text>
                        </View>
                        <View style={styles.timeBadge}>
                          <Text style={styles.timeBadgeText}>
                            {vitals.temp ? formatTime(vitals.temp.ts) : t.noRecord}
                          </Text>
                        </View>
                      </View>
                    </>
                  );
                })()}
              </View>

              <View style={styles.gridCard}>
                {(() => {
                  const status = checkVitalStatus("hr", vitals.hr);
                  const colors = getCardColors(status);
                  return (
                    <>
                      <View style={[styles.cardHeader, { backgroundColor: colors.top }]}>
                        <Text style={styles.cardTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{t.heartRate}</Text>
                      </View>
                      <View style={[styles.cardBody, { backgroundColor: colors.bottom }]}>
                        <View style={styles.valueRow}>
                          <Text style={styles.valueMain}>{vitals.hr?.val ?? "-"}</Text>
                          <Text style={styles.valueUnit}>bpm</Text>
                        </View>
                        <View style={styles.timeBadge}>
                          <Text style={styles.timeBadgeText}>
                            {vitals.hr ? formatTime(vitals.hr.ts) : t.noRecord}
                          </Text>
                        </View>
                      </View>
                    </>
                  );
                })()}
              </View>
            </View>

            <View style={styles.fullCard}>
              {(() => {
                const status = checkVitalStatus("bp", vitals.bp);
                const colors = getCardColors(status);
                return (
                  <>
                    <View style={[styles.fullCardHeader, { backgroundColor: colors.top }]}>
                      <Text style={styles.cardTitle}>{t.bloodPressure}</Text>
                      <View style={styles.headerSubRow}>
                        <Text style={styles.headerSubText}>{t.systolic}</Text>
                        <Text style={styles.headerSubText}>{t.diastolic}</Text>
                      </View>
                    </View>
                    <View style={[styles.fullCardBody, { backgroundColor: colors.bottom }]}>
                      <View style={styles.fullCardValueRow}>
                        <View style={styles.valueCol}>
                          <Text style={styles.valueMain}>{vitals.bp?.sys ?? "-"}</Text>
                          <Text style={styles.valueUnitLarge}>mmhg</Text>
                        </View>
                        <View style={styles.valueCol}>
                          <Text style={styles.valueMain}>{vitals.bp?.dia ?? "-"}</Text>
                          <Text style={styles.valueUnitLarge}>mmhg</Text>
                        </View>
                      </View>
                      <View style={[styles.timeBadge, { paddingHorizontal: 32 }]}>
                        <Text style={styles.timeBadgeText}>
                          {vitals.bp ? formatTime(vitals.bp.ts) : t.noRecord}
                        </Text>
                      </View>
                    </View>
                  </>
                );
              })()}
            </View>

            <View style={styles.fullCard}>
              {(() => {
                const status = checkVitalStatus("sugar", vitals.sugarFasting, vitals.sugarAfter);
                const colors = getCardColors(status);
                let latestTs = vitals.sugarFasting?.ts || 0;
                if (vitals.sugarAfter?.ts && vitals.sugarAfter.ts > latestTs) latestTs = vitals.sugarAfter.ts;
                return (
                  <>
                    <View style={[styles.fullCardHeader, { backgroundColor: colors.top }]}>
                      <Text style={styles.cardTitle}>{t.bloodSugar}</Text>
                      <View style={styles.headerSubRow}>
                        <Text style={styles.headerSubText}>{t.fasting}</Text>
                        <Text style={styles.headerSubText}>{t.afterMeal}</Text>
                      </View>
                    </View>
                    <View style={[styles.fullCardBody, { backgroundColor: colors.bottom }]}>
                      <View style={styles.fullCardValueRow}>
                        <View style={styles.valueCol}>
                          <Text style={styles.valueMain}>{vitals.sugarFasting?.val ?? "-"}</Text>
                          <Text style={styles.valueUnitLarge}>mg/dl</Text>
                        </View>
                        <View style={styles.valueCol}>
                          <Text style={styles.valueMain}>{vitals.sugarAfter?.val ?? "-"}</Text>
                          <Text style={styles.valueUnitLarge}>mg/dl</Text>
                        </View>
                      </View>
                      <View style={[styles.timeBadge, { paddingHorizontal: 32 }]}>
                        <Text style={styles.timeBadgeText}>
                          {latestTs > 0 ? formatTime(latestTs) : t.noRecord}
                        </Text>
                      </View>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        )}

        {/* ================= 設定閾值畫面 ================= */}
        {activeTab === "settings" && (
          <View style={styles.settingsContent}>

            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>
                {t.thresholdInfoBanner}
              </Text>
            </View>

            {/* 1. 體溫設定 */}
            <View style={[styles.settingCard, localThresholds.temperature.enabled ? styles.settingCardActive : styles.settingCardInactive]}>
              <View style={styles.settingCardHeader}>
                <Text style={styles.settingCardTitle}>{t.temperatureWithUnit}</Text>
                <View style={styles.switchContainer}>
                  <Text style={[styles.switchLabel, localThresholds.temperature.enabled ? styles.switchLabelActive : styles.switchLabelInactive]}>
                    {localThresholds.temperature.enabled ? t.enabledCustomThreshold : t.useSystemDefaultThreshold}
                  </Text>
                  <Switch
                    value={localThresholds.temperature.enabled}
                    onValueChange={() => toggleThreshold("temperature")}
                    trackColor={{ false: "#D1D5DB", true: "#4A8B46" }}
                  />
                </View>
              </View>
              {localThresholds.temperature.enabled ? (
                <View style={styles.settingInputRow}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>{t.minSafeValue}</Text>
                    <TextInput style={styles.textInput} keyboardType="numeric" value={localThresholds.temperature.min} onChangeText={(v) => handleThresholdChange("temperature", "min", v)} />
                  </View>
                  <Text style={styles.inputTilde}>~</Text>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>{t.maxSafeValue}</Text>
                    <TextInput style={styles.textInput} keyboardType="numeric" value={localThresholds.temperature.max} onChangeText={(v) => handleThresholdChange("temperature", "max", v)} />
                  </View>
                </View>
              ) : (
                <Text style={styles.disabledText}>{t.thresholdDisabledHint}</Text>
              )}
            </View>

            {/* 2. 心跳設定 */}
            <View style={[styles.settingCard, localThresholds.heartRate.enabled ? styles.settingCardActive : styles.settingCardInactive]}>
              <View style={styles.settingCardHeader}>
                <Text style={styles.settingCardTitle}>{t.heartRateWithUnit}</Text>
                <View style={styles.switchContainer}>
                  <Text style={[styles.switchLabel, localThresholds.heartRate.enabled ? styles.switchLabelActive : styles.switchLabelInactive]}>
                    {localThresholds.heartRate.enabled ? t.enabledCustomThreshold : t.useSystemDefaultThreshold}
                  </Text>
                  <Switch
                    value={localThresholds.heartRate.enabled}
                    onValueChange={() => toggleThreshold("heartRate")}
                    trackColor={{ false: "#D1D5DB", true: "#4A8B46" }}
                  />
                </View>
              </View>
              {localThresholds.heartRate.enabled ? (
                <View style={styles.settingInputRow}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>{t.minHeartRateValue}</Text>
                    <TextInput style={styles.textInput} keyboardType="numeric" value={localThresholds.heartRate.min} onChangeText={(v) => handleThresholdChange("heartRate", "min", v)} />
                  </View>
                  <Text style={styles.inputTilde}>~</Text>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>{t.maxHeartRateValue}</Text>
                    <TextInput style={styles.textInput} keyboardType="numeric" value={localThresholds.heartRate.max} onChangeText={(v) => handleThresholdChange("heartRate", "max", v)} />
                  </View>
                </View>
              ) : (
                <Text style={styles.disabledText}>{t.thresholdDisabledHint}</Text>
              )}
            </View>

            {/* 3. 血壓設定 */}
            <View style={[styles.settingCard, localThresholds.systolic.enabled ? styles.settingCardActive : styles.settingCardInactive]}>
              <View style={styles.settingCardHeader}>
                <Text style={styles.settingCardTitle}>{t.bloodPressureWithUnit}</Text>
                <View style={styles.switchContainer}>
                  <Text style={[styles.switchLabel, localThresholds.systolic.enabled ? styles.switchLabelActive : styles.switchLabelInactive]}>
                    {localThresholds.systolic.enabled ? t.enabledCustomThreshold : t.useSystemDefaultThreshold}
                  </Text>
                  <Switch
                    value={localThresholds.systolic.enabled}
                    onValueChange={() => { toggleThreshold("systolic"); toggleThreshold("diastolic"); }}
                    trackColor={{ false: "#D1D5DB", true: "#4A8B46" }}
                  />
                </View>
              </View>
              {localThresholds.systolic.enabled ? (
                <>
                  <View style={styles.settingInputRow}>
                    <Text style={styles.inputSideLabel}>{t.systolic}</Text>
                    <TextInput style={styles.textInputFlex} keyboardType="numeric" value={localThresholds.systolic.min} onChangeText={(v) => handleThresholdChange("systolic", "min", v)} />
                    <Text style={styles.inputTildeSmall}>~</Text>
                    <TextInput style={styles.textInputFlex} keyboardType="numeric" value={localThresholds.systolic.max} onChangeText={(v) => handleThresholdChange("systolic", "max", v)} />
                  </View>
                  <View style={[styles.settingInputRow, { marginTop: 12 }]}>
                    <Text style={styles.inputSideLabel}>{t.diastolic}</Text>
                    <TextInput style={styles.textInputFlex} keyboardType="numeric" value={localThresholds.diastolic.min} onChangeText={(v) => handleThresholdChange("diastolic", "min", v)} />
                    <Text style={styles.inputTildeSmall}>~</Text>
                    <TextInput style={styles.textInputFlex} keyboardType="numeric" value={localThresholds.diastolic.max} onChangeText={(v) => handleThresholdChange("diastolic", "max", v)} />
                  </View>
                </>
              ) : (
                <Text style={styles.disabledText}>{t.thresholdDisabledHint}</Text>
              )}
            </View>

            {/* 4. 血糖設定 */}
            <View style={[styles.settingCard, localThresholds.bloodSugar.enabled ? styles.settingCardActive : styles.settingCardInactive]}>
              <View style={styles.settingCardHeader}>
                <Text style={styles.settingCardTitle}>{t.bloodSugarWithUnit}</Text>
                <View style={styles.switchContainer}>
                  <Text style={[styles.switchLabel, localThresholds.bloodSugar.enabled ? styles.switchLabelActive : styles.switchLabelInactive]}>
                    {localThresholds.bloodSugar.enabled ? t.enabledCustomThreshold : t.useSystemDefaultThreshold}
                  </Text>
                  <Switch
                    value={localThresholds.bloodSugar.enabled}
                    onValueChange={() => toggleThreshold("bloodSugar")}
                    trackColor={{ false: "#D1D5DB", true: "#4A8B46" }}
                  />
                </View>
              </View>
              {localThresholds.bloodSugar.enabled ? (
                <>
                  <View style={styles.settingInputRow}>
                    <Text style={styles.inputSideLabel}>{t.fasting}</Text>
                    <TextInput style={styles.textInputFlex} keyboardType="numeric" value={localThresholds.bloodSugar.beforeMin} onChangeText={(v) => handleThresholdChange("bloodSugar", "beforeMin", v)} />
                    <Text style={styles.inputTildeSmall}>~</Text>
                    <TextInput style={styles.textInputFlex} keyboardType="numeric" value={localThresholds.bloodSugar.beforeMax} onChangeText={(v) => handleThresholdChange("bloodSugar", "beforeMax", v)} />
                  </View>
                  <View style={[styles.settingInputRow, { marginTop: 12 }]}>
                    <Text style={styles.inputSideLabel}>{t.afterMeal}</Text>
                    <TextInput style={styles.textInputFlex} keyboardType="numeric" value={localThresholds.bloodSugar.afterMin} onChangeText={(v) => handleThresholdChange("bloodSugar", "afterMin", v)} />
                    <Text style={styles.inputTildeSmall}>~</Text>
                    <TextInput style={styles.textInputFlex} keyboardType="numeric" value={localThresholds.bloodSugar.afterMax} onChangeText={(v) => handleThresholdChange("bloodSugar", "afterMax", v)} />
                  </View>
                </>
              ) : (
                <Text style={styles.disabledText}>{t.thresholdDisabledHint}</Text>
              )}
            </View>

            <Pressable style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>{t.saveThresholdSettings}</Text>
            </Pressable>

          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  topContainer: { backgroundColor: "#F3CDAD", paddingTop: 50, zIndex: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 10 },
  backButton: { paddingVertical: 8 },
  backButtonText: { fontSize: 18, fontWeight: "800", color: "#000" },
  settingsHeader: { justifyContent: "center", position: "relative", paddingVertical: 10 },
  settingsBackButton: { position: "absolute", left: 20, zIndex: 1, paddingVertical: 8 },
  settingsTitle: { fontSize: 22, fontWeight: "bold", color: "#000" },
  tabRow: { flexDirection: "row", width: "100%" },
  tabButton: { flex: 1, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  tabButtonActive: { backgroundColor: "#E69A57" },
  tabText: { width: "94%", fontSize: 24, lineHeight: 27, fontWeight: "bold", letterSpacing: 0.3, textAlign: "center" },
  tabTextActive: { color: "#000" },
  tabTextInactive: { color: "rgba(0,0,0,0.6)" },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 140 },
  tabContent: { flex: 1 },
  filterRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16, gap: 8 },
  filterBtn: { flex: 1, paddingVertical: 8, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  filterBtnActive: { backgroundColor: "#EAA161", borderColor: "transparent" },
  filterBtnInactive: { backgroundColor: "#FFF", borderColor: "#000" },
  filterBtnText: { width: "96%", fontSize: 18, lineHeight: 20, fontWeight: "bold", textAlign: "center" },
  filterTextActive: { color: "#000" },
  filterTextInactive: { color: "#000" },
  gridRow: { flexDirection: "row", gap: 16, marginBottom: 16 },
  gridCard: { flex: 1, borderRadius: 16, overflow: "hidden", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  cardHeader: { paddingVertical: 8, alignItems: "center" },
  cardTitle: {
    width: "96%",
    fontSize: 22,
    lineHeight: 25,
    fontWeight: "bold",
    letterSpacing: 0.3,
    color: "#000",
    textAlign: "center",
  },
  cardBody: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "space-between",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginBottom: 12,
  },
  valueMain: { fontSize: 36, fontWeight: "500", color: "#000" },
  valueUnit: { fontSize: 24, fontWeight: "500", color: "#000" },
  timeBadge: { backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4 },
  timeBadgeText: { color: "#FFF", fontSize: 14, fontWeight: "bold", letterSpacing: 1 },
  fullCard: { borderRadius: 16, overflow: "hidden", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, marginBottom: 16 },
  fullCardHeader: { paddingTop: 8, paddingBottom: 4, alignItems: "center" },
  headerSubRow: { flexDirection: "row", marginTop: 4, width: "100%" },
  headerSubText: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "bold", color: "rgba(0,0,0,0.7)" },
  fullCardBody: { paddingVertical: 16, alignItems: "center" },
  fullCardValueRow: { flexDirection: "row", width: "100%", marginBottom: 12 },
  valueCol: { flex: 1, alignItems: "center" },
  valueUnitLarge: { fontSize: 22, fontWeight: "500", color: "#000" },
  settingsBtn: { backgroundColor: "#FFF4E5", borderColor: "#F2A25B", borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
  settingsBtnText: { color: "#D37B2B", fontWeight: "bold", fontSize: 14 },
  settingsContent: { flex: 1 },
  infoBanner: { backgroundColor: "#FFF4E5", borderColor: "#F2A25B", borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 20 },
  infoBannerText: { color: "#D37B2B", fontWeight: "bold", fontSize: 14, lineHeight: 22 },
  settingCard: { backgroundColor: "#FFF", borderWidth: 2, borderRadius: 20, padding: 16, marginBottom: 16 },
  settingCardActive: { borderColor: "#E59752", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  settingCardInactive: { borderColor: "#E5E5E5", opacity: 0.7 },
  settingCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  settingCardTitle: { fontSize: 20, fontWeight: "bold", color: "#000" },
  switchContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  switchLabel: { fontSize: 14, fontWeight: "bold" },
  switchLabelActive: { color: "#4A8B46" },
  switchLabelInactive: { color: "#9CA3AF" },
  disabledText: { fontSize: 14, color: "#6B7280", lineHeight: 20, marginTop: 8 },
  settingInputRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inputCol: { flex: 1, flexDirection: "column" },
  inputLabel: { fontSize: 12, color: "#6B7280", fontWeight: "bold", marginBottom: 4, marginLeft: 4 },
  textInput: { backgroundColor: "#F5F5F5", height: 48, borderRadius: 12, textAlign: "center", fontSize: 20, fontWeight: "bold", color: "#000" },
  inputTilde: { fontSize: 24, color: "#9CA3AF", marginHorizontal: 12, marginTop: 16 },
  inputSideLabel: { fontSize: 14, fontWeight: "bold", color: "#374151", width: 48, textAlign: "center" },
  textInputFlex: { flex: 1, backgroundColor: "#F5F5F5", height: 48, borderRadius: 12, textAlign: "center", fontSize: 20, fontWeight: "bold", color: "#000" },
  inputTildeSmall: { fontSize: 20, color: "#9CA3AF", marginHorizontal: 8 },
  saveBtn: { backgroundColor: "#4F59D5", borderRadius: 18, paddingVertical: 16, alignItems: "center", marginTop: 16, shadowColor: "#4F59D5", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  saveBtnText: { color: "#FFF", fontSize: 22, fontWeight: "bold", letterSpacing: 2 },
});
