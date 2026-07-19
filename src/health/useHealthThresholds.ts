// src/health/useHealthThresholds.ts
import { db } from "@/firebase/firebaseConfig";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from 'react';

// 定義每個數值的上下限型別
export type ThresholdRange = {
  min: string;     // 使用 string 方便 TextInput 綁定
  max: string;
  enabled: boolean;
};

// 血糖比較特別，分飯前飯後
export type BloodSugarRange = {
  beforeMin: string;
  beforeMax: string;
  afterMin: string;
  afterMax: string;
  enabled: boolean;
};

// 統整整個長輩的閾值設定結構
export type PatientThresholds = {
  temperature: ThresholdRange;
  heartRate: ThresholdRange;
  systolic: ThresholdRange;
  diastolic: ThresholdRange;
  bloodSugar: BloodSugarRange;
};

// 💡 系統預設的安全標準 (當家屬沒設定時的退路)
export const DEFAULT_THRESHOLDS: PatientThresholds = {
  temperature: { min: "36.0", max: "37.5", enabled: false },
  heartRate:   { min: "60", max: "100", enabled: false },
  systolic:    { min: "90", max: "140", enabled: false },
  diastolic:   { min: "60", max: "90", enabled: false },
  bloodSugar:  { beforeMin: "70", beforeMax: "130", afterMin: "70", afterMax: "180", enabled: false },
};

export function useHealthThresholds(patientId: string) {
  const [thresholds, setThresholds] = useState<PatientThresholds>(DEFAULT_THRESHOLDS);
  const [loading, setLoading] = useState(true);

  // 1. 監聽 Firestore 中的閾值設定
  useEffect(() => {
    if (!patientId) {
      setThresholds(DEFAULT_THRESHOLDS);
      setLoading(false);
      return;
    }

    const docRef = doc(db, "health_thresholds", patientId);
    
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        // 如果資料庫有存，就用資料庫的覆蓋預設值
        const data = docSnap.data() as PatientThresholds;
        setThresholds({
          ...DEFAULT_THRESHOLDS,
          ...data 
        });
      } else {
        // 如果是新長輩，還沒設定過，就給預設值
        setThresholds(DEFAULT_THRESHOLDS);
      }
      setLoading(false);
    }, (error) => {
      console.log("讀取閾值失敗:", error);
      setLoading(false);
    });

    return unsub;
  }, [patientId]);

  // 2. 提供給前端儲存設定的函數
  const saveThresholds = async (newThresholds: PatientThresholds) => {
    if (!patientId) return;
    try {
      const docRef = doc(db, "health_thresholds", patientId);
      // 使用 setDoc 搭配 merge: true，確保寫入或覆蓋資料
      await setDoc(docRef, newThresholds, { merge: true });
      return true;
    } catch (error) {
      console.error("儲存閾值失敗:", error);
      throw error;
    }
  };

  return { thresholds, loading, saveThresholds };
}