// app/caregiver/health-report.tsx
import { db } from '@/firebase/firebaseConfig';
import { router } from 'expo-router';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/src/auth/useAuth';
import { useActiveCareTarget } from '@/src/care-target/useActiveCareTarget';
import HealthTrendChart from '@/src/health/HealthTrendChart';
import {
  ChartDataType,
  ChartTimeRange,
  useHealthChartData,
} from '@/src/health/useHealthChartData';
import { translations } from '@/src/i18n/translations';
import { useLanguage } from '@/src/store/LanguageContext';

export default function HealthReportScreen() {
  const { user } = useAuth();
  const { activePatientId } = useActiveCareTarget();
  const { language } = useLanguage();
  const t = translations[language];

  const [activeTab, setActiveTab] = useState<'today' | 'history'>('today');

  const [mealTime, setMealTime] = useState<'before' | 'after'>('before');
  const [formData, setFormData] = useState({
    temperature: '',
    heartRate: '',
    systolic: '',
    diastolic: '',
    bloodSugar: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const [chartDataType, setChartDataType] = useState<ChartDataType>('體溫');
  const [chartTimeRange, setChartTimeRange] = useState<ChartTimeRange>('1周');

  const dataTypes: ChartDataType[] = ['體溫', '心跳', '血壓', '血糖'];
  const timeRanges: ChartTimeRange[] = ['1周', '2周', '1個月', '全部'];
  const dataTypeLabels = [t.temperature, t.heartRate, t.bloodPressure, t.bloodSugar];
  const timeRangeLabels = [
    language === 'zh' ? '1周' : '1W',
    language === 'zh' ? '2周' : '2W',
    language === 'zh' ? '1個月' : '1M',
    language === 'zh' ? '全部' : 'All',
  ];

  const { loading, empty, lineData, bpSysData, bpDiaData } = useHealthChartData({
    patientId: activePatientId ?? undefined,
    chartDataType,
    chartTimeRange,
  });

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!user || !activePatientId) {
      Alert.alert(t.resultErrorTitle, t.noSelectedPatient);
      return;
    }

    const hasData = Object.values(formData).some((val) => val.trim() !== '');
    if (!hasData) {
      Alert.alert(t.prompt, t.noVitals);
      return;
    }

    setIsSaving(true);

    try {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');

      const timeString = `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
      const shortId = activePatientId.slice(-4);
      const customDocId = `${timeString}_rec_${shortId}`;

      const payload: any = {
        patientId: activePatientId,
        caregiverId: user.uid,
        createdAt: serverTimestamp(),
      };

      if (formData.temperature) payload.temperature = Number(formData.temperature);
      if (formData.heartRate) payload.heartRate = Number(formData.heartRate);
      if (formData.systolic) payload.bloodPressureSys = Number(formData.systolic);
      if (formData.diastolic) payload.bloodPressureDia = Number(formData.diastolic);

      if (formData.bloodSugar) {
        payload.bloodSugar = Number(formData.bloodSugar);
        payload.bloodSugarType = mealTime === 'before' ? '空腹' : '餐後';
      }

      const docRef = doc(db, 'health_records', customDocId);
      await setDoc(docRef, payload);

      Alert.alert(t.saveSuccessTitle, t.saveSuccessMessage);

      setFormData({
        temperature: '',
        heartRate: '',
        systolic: '',
        diastolic: '',
        bloodSugar: '',
      });

      setActiveTab('history');
    } catch (error) {
      console.log('Save health record error:', error);
      Alert.alert(t.resultSaveFailedTitle, t.uploadFailedMessage);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topContainer}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← {t.back}</Text>
          </Pressable>
        </View>

        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabButton, activeTab === 'today' && styles.tabButtonActive]}
            onPress={() => setActiveTab('today')}
          >
            <Text
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={[
                styles.tabText,
                activeTab === 'today' ? styles.tabTextActive : styles.tabTextInactive,
              ]}
            >
              {t.todayRecords}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, activeTab === 'history' && styles.tabButtonActive]}
            onPress={() => setActiveTab('history')}
          >
            <Text
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={[
                styles.tabText,
                activeTab === 'history' ? styles.tabTextActive : styles.tabTextInactive,
              ]}
            >
              {t.historyTrend}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'today' ? (
          <View style={styles.formContainer}>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>{t.temperature}:</Text>
              <TextInput
                style={styles.inputField}
                keyboardType="numeric"
                value={formData.temperature}
                onChangeText={(val) => handleInputChange('temperature', val)}
                placeholder="36.5"
                placeholderTextColor="#CCC"
              />
              <Text style={styles.unitText}>°C</Text>
            </View>

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>{t.heartRate}:</Text>
              <TextInput
                style={styles.inputField}
                keyboardType="numeric"
                value={formData.heartRate}
                onChangeText={(val) => handleInputChange('heartRate', val)}
                placeholder="80"
                placeholderTextColor="#CCC"
              />
              <Text style={styles.unitText}>bpm</Text>
            </View>

            <View style={styles.inputRowMulti}>
              <Text style={[styles.inputLabel, { marginTop: 10 }]}>{t.bloodPressure}:</Text>
              <View style={styles.multiInputCol}>
                <View style={styles.subInputRow}>
                  <TextInput
                    style={[styles.inputField, { fontSize: 20 }]}
                    keyboardType="numeric"
                    placeholder={t.systolic}
                    placeholderTextColor="#999"
                    value={formData.systolic}
                    onChangeText={(val) => handleInputChange('systolic', val)}
                  />
                  <Text style={styles.unitText}>mmhg</Text>
                </View>
                <View style={styles.subInputRow}>
                  <TextInput
                    style={[styles.inputField, { fontSize: 20 }]}
                    keyboardType="numeric"
                    placeholder={t.diastolic}
                    placeholderTextColor="#999"
                    value={formData.diastolic}
                    onChangeText={(val) => handleInputChange('diastolic', val)}
                  />
                  <Text style={styles.unitText}>mmhg</Text>
                </View>
              </View>
            </View>

            <View style={styles.inputRowMulti}>
              <Text style={[styles.inputLabel, { marginTop: 10 }]}>{t.bloodSugar}:</Text>
              <View style={styles.multiInputCol}>
                <View style={styles.mealTimeRow}>
                  <Pressable
                    onPress={() => setMealTime('before')}
                    style={[
                      styles.mealBtn,
                      mealTime === 'before' ? styles.mealBtnActive : styles.mealBtnInactive,
                    ]}
                  >
                    <Text
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.65}
                      style={[
                        styles.mealBtnText,
                        mealTime === 'before'
                          ? styles.mealBtnTextActive
                          : styles.mealBtnTextInactive,
                      ]}
                    >
                      {t.fasting}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setMealTime('after')}
                    style={[
                      styles.mealBtn,
                      mealTime === 'after' ? styles.mealBtnActive : styles.mealBtnInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.mealBtnText,
                        mealTime === 'after'
                          ? styles.mealBtnTextActive
                          : styles.mealBtnTextInactive,
                      ]}
                    >
                      {t.afterMeal}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.subInputRow}>
                  <TextInput
                    style={styles.inputField}
                    keyboardType="numeric"
                    value={formData.bloodSugar}
                    onChangeText={(val) => handleInputChange('bloodSugar', val)}
                    placeholder="90"
                    placeholderTextColor="#CCC"
                  />
                  <Text style={styles.unitText}>mg/dL</Text>
                </View>
              </View>
            </View>

            <Pressable
              onPress={handleSave}
              disabled={isSaving}
              style={({ pressed }) => [
                styles.saveButton,
                pressed && { opacity: 0.8 },
                isSaving && { backgroundColor: '#A0A5E8' },
              ]}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveButtonText}>{t.save}</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.historyContainer}>
            <View style={styles.filterRow}>
              {dataTypes.map((type, index) => (
                <Pressable
                  key={type}
                  onPress={() => setChartDataType(type)}
                  style={[
                    styles.filterBtn,
                    chartDataType === type ? styles.filterBtnActive : styles.filterBtnInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterBtnText,
                      chartDataType === type
                        ? styles.filterTextActive
                        : styles.filterTextInactive,
                    ]}
                  >
                    {dataTypeLabels[index]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.filterRow}>
              {timeRanges.map((range, index) => (
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
                    {timeRangeLabels[index]}
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
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  topContainer: {
    backgroundColor: '#F3CDAD',
    paddingTop: 50,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  backButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000',
  },
  tabRow: {
    flexDirection: 'row',
    width: '100%',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#E59752',
  },
  tabText: {
    width: '94%',
    fontSize: 22,
    lineHeight: 25,
    fontWeight: 'bold',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#000',
  },
  tabTextInactive: {
    color: 'rgba(0,0,0,0.6)',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 140,
  },
  formContainer: {
    gap: 24,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inputRowMulti: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  inputLabel: {
    flexShrink: 1,
    fontSize: 21,
    fontWeight: 'bold',
    color: '#000',
    minWidth: 82,
    maxWidth: 130,
    letterSpacing: 0.2,
  },
  inputField: {
    flex: 1,
    maxWidth: 140,
    height: 55,
    backgroundColor: '#EAEAEA',
    borderRadius: 16,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    color: '#000',
  },
  unitText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#000',
  },
  multiInputCol: {
    flex: 1,
    gap: 16,
  },
  subInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  mealBtn: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
  },
  mealBtnActive: {
    backgroundColor: '#F2A25B',
    borderColor: '#F2A25B',
  },
  mealBtnInactive: {
    backgroundColor: 'transparent',
    borderColor: '#9CA3AF',
  },
  mealBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  mealBtnTextActive: {
    color: '#000',
  },
  mealBtnTextInactive: {
    color: '#4B5563',
  },
  saveButton: {
    backgroundColor: '#4F59D5',
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#4F59D5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  saveButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    letterSpacing: 8,
    marginLeft: 8,
  },
  historyContainer: {
    flex: 1,
    gap: 20,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  filterBtn: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  filterBtnActive: {
    backgroundColor: '#EAA161',
    borderColor: '#EAA161',
  },
  filterBtnInactive: {
    backgroundColor: '#FFF',
    borderColor: '#000',
  },
  filterBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  filterTextActive: {
    color: '#000',
  },
  filterTextInactive: {
    color: '#000',
  },
});
