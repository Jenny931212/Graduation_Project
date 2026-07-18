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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type VitalStatus = "normal" | "abnormal" | "outdated" | "nodata";

type SingleVital = {
  val: number;
  ts: number;
} | null;

type BloodPressureVital = {
  sys: number;
  dia: number;
  ts: number;
} | null;

type VitalsState = {
  temp: SingleVital;
  hr: SingleVital;
  bp: BloodPressureVital;
  sugarFasting: SingleVital;
  sugarAfter: SingleVital;
  hasAnyData: boolean;
};

export default function FamilyDashboardScreen() {
  const { ready, activePatientId } = useActiveCareTarget();
  const { language } = useLanguage();
  const t = translations[language];

  const [activeTab, setActiveTab] = useState<"history" | "today">("history");

  const [chartDataType, setChartDataType] = useState<ChartDataType>("體溫");
  const [chartTimeRange, setChartTimeRange] = useState<ChartTimeRange>("1周");

  const dataTypes: ChartDataType[] = ["體溫", "心跳", "血壓", "血糖"];
  const timeRanges: ChartTimeRange[] = ["1周", "2周", "1個月", "全部"];

  const { loading, empty, lineData, bpSysData, bpDiaData } = useHealthChartData({
    patientId: activePatientId ?? undefined,
    chartDataType,
    chartTimeRange,
  });

  const [vitals, setVitals] = useState<VitalsState>({
    temp: null,
    hr: null,
    bp: null,
    sugarFasting: null,
    sugarAfter: null,
    hasAnyData: false,
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
      let temp: SingleVital = null;
      let hr: SingleVital = null;
      let bp: BloodPressureVital = null;
      let sugarFasting: SingleVital = null;
      let sugarAfter: SingleVital = null;
      let hasAnyData = false;
      let hasFoundLatestSugar = false;

      snap.docs.forEach((doc) => {
        const d = doc.data() as any;
        const ts = d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.now();
        hasAnyData = true;

        if (!temp && d.temperature !== undefined) {
          temp = { val: d.temperature, ts };
        }

        if (!hr && d.heartRate !== undefined) {
          hr = { val: d.heartRate, ts };
        }

        if (
          !bp &&
          d.bloodPressureSys !== undefined &&
          d.bloodPressureDia !== undefined
        ) {
          bp = { sys: d.bloodPressureSys, dia: d.bloodPressureDia, ts };
        }

        if (!hasFoundLatestSugar && d.bloodSugar !== undefined) {
          hasFoundLatestSugar = true;

          if (d.bloodSugarType === "空腹" || d.bloodSugarType === "飯前") {
            sugarFasting = { val: d.bloodSugar, ts };
          } else if (d.bloodSugarType === "飯後" || d.bloodSugarType === "餐後") {
            sugarAfter = { val: d.bloodSugar, ts };
          }
        }
      });

      setVitals({
        temp,
        hr,
        bp,
        sugarFasting,
        sugarAfter,
        hasAnyData,
      });
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
      if (data.val < 36.0 || data.val > 37.5) return "abnormal";
    } else if (type === "hr" && data && "val" in data) {
      if (data.val < 60 || data.val > 100) return "abnormal";
    } else if (type === "bp" && data && "sys" in data && "dia" in data) {
      if (data.sys < 90 || data.sys > 140 || data.dia < 60 || data.dia > 90) {
        return "abnormal";
      }
    } else if (type === "sugar") {
      let isAbnormal = false;

      if (data && "val" in data && (data.val < 70 || data.val > 130)) {
        isAbnormal = true;
      }

      if (sugarData2 && (sugarData2.val < 70 || sugarData2.val > 180)) {
        isAbnormal = true;
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

  if (!ready) {
    return <ActivityIndicator style={{ flex: 1, justifyContent: "center" }} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.topContainer}>
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
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "history" ? (
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
                <Pressable
                  key={range}
                  onPress={() => setChartTimeRange(range)}
                  style={[
                    styles.filterBtn,
                    chartTimeRange === range
                      ? styles.filterBtnActive
                      : styles.filterBtnInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterBtnText,
                      chartTimeRange === range
                        ? styles.filterTextActive
                        : styles.filterTextInactive,
                    ]}
                  >
                    {range}
                  </Text>
                </Pressable>
              ))}
            </View>

            <HealthTrendChart
              chartDataType={chartDataType}
              loading={loading}
              empty={empty}
              lineData={lineData}
              bpSysData={bpSysData}
              bpDiaData={bpDiaData}
            />
          </View>
        ) : (
          <View style={styles.tabContent}>
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
                const status = checkVitalStatus(
                  "sugar",
                  vitals.sugarFasting,
                  vitals.sugarAfter
                );
                const colors = getCardColors(status);

                let latestTs = vitals.sugarFasting?.ts || 0;
                if (vitals.sugarAfter?.ts && vitals.sugarAfter.ts > latestTs) {
                  latestTs = vitals.sugarAfter.ts;
                }

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
                          <Text style={styles.valueMain}>
                            {vitals.sugarFasting?.val ?? "-"}
                          </Text>
                          <Text style={styles.valueUnitLarge}>mg/dl</Text>
                        </View>
                        <View style={styles.valueCol}>
                          <Text style={styles.valueMain}>
                            {vitals.sugarAfter?.val ?? "-"}
                          </Text>
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  topContainer: { backgroundColor: "#F3CDAD", paddingTop: 50, zIndex: 10 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  backButton: { paddingVertical: 8 },
  backButtonText: { fontSize: 18, fontWeight: "800", color: "#000" },
  tabRow: { flexDirection: "row", width: "100%" },
  tabButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: { backgroundColor: "#E69A57" },
  tabText: { width: "94%", fontSize: 24, lineHeight: 27, fontWeight: "bold", letterSpacing: 0.3, textAlign: "center" },
  tabTextActive: { color: "#000" },
  tabTextInactive: { color: "rgba(0,0,0,0.6)" },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 140,
  },
  tabContent: { flex: 1 },

  filterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 8,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  filterBtnActive: { backgroundColor: "#EAA161", borderColor: "transparent" },
  filterBtnInactive: { backgroundColor: "#FFF", borderColor: "#000" },
  filterBtnText: { width: "96%", fontSize: 18, lineHeight: 20, fontWeight: "bold", textAlign: "center" },
  filterTextActive: { color: "#000" },
  filterTextInactive: { color: "#000" },

  gridRow: { flexDirection: "row", gap: 16, marginBottom: 16 },
  gridCard: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
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
  timeBadge: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  timeBadgeText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "bold",
    letterSpacing: 1,
  },

  fullCard: {
    borderRadius: 16,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    marginBottom: 16,
  },
  fullCardHeader: { paddingTop: 8, paddingBottom: 4, alignItems: "center" },
  headerSubRow: { flexDirection: "row", marginTop: 4, width: "100%" },
  headerSubText: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
    color: "rgba(0,0,0,0.7)",
  },
  fullCardBody: { paddingVertical: 16, alignItems: "center" },
  fullCardValueRow: { flexDirection: "row", width: "100%", marginBottom: 12 },
  valueCol: { flex: 1, alignItems: "center" },
  valueUnitLarge: { fontSize: 22, fontWeight: "500", color: "#000" },
});
