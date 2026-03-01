import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * =========================
 * Types
 * =========================
 */
export type TimeOfDay = "morning" | "noon" | "afternoon" | "night";

export type PrescriptionItem = {
  itemId: string;
  drug_name_zh: string;
  drug_name_translated?: string;
  dose: string;
  time_of_day: TimeOfDay[];
  note_zh?: string;
  note_translated?: string;
};

export type Prescription = {
  prescriptionId: string;
  careTargetId: string;
  title?: string;
  createdAt: number;
  /** 本機：存 FileSystem 的永久路徑；未來換 Firebase Storage URL 也一樣放這裡 */
  sourceImageUrl?: string;
  /** parsed：AI/解析完成；need_manual_fix：需要人為修正（UI 可用顏色/標籤顯示） */
  status: "parsed" | "need_manual_fix";
  ocrRawText?: string;
  items: PrescriptionItem[];
};

type StoreValue = {
  /** ✅ 本地持久化讀取完成才會 ready */
  ready: boolean;

  prescriptions: Prescription[];

  addPrescription: (input: Omit<Prescription, "prescriptionId" | "createdAt">) => string;

  deletePrescription: (prescriptionId: string) => void;

  updatePrescription: (id: string, data: Partial<Prescription>) => void;
  
  updatePrescriptionImage: (prescriptionId: string, imageUrl: string) => void;

  getPrescriptionsByCareTargetId: (careTargetId: string) => Prescription[];

  getPrescriptionById: (id: string) => Prescription | undefined;

  resetStore: () => void;
};

const StoreContext = createContext<StoreValue | null>(null);

/**
 * ✅ 你的 store 持久化就是靠這個 KEY
 * 之後如果你要做到「每個帳號/每個長輩各自資料」，可以把 KEY 變成帶 uid / careTargetId 的版本
 */
const KEY_PRESCRIPTIONS = "careapp_prescriptions_v2";

/** 產生比較不容易撞的 id（避免同毫秒連點造成重複 key） */
function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);

  // ✅ App 啟動：讀 AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY_PRESCRIPTIONS);
        if (raw) {
          const parsed = JSON.parse(raw) as Prescription[];
          if (Array.isArray(parsed)) setPrescriptions(parsed);
        }
      } catch (e) {
        // 讀取失敗就當空資料，不要讓 app 掛掉
        console.warn("Load prescriptions failed:", e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // ✅ 任何 prescriptions 變動 → 寫回 AsyncStorage
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        await AsyncStorage.setItem(KEY_PRESCRIPTIONS, JSON.stringify(prescriptions));
      } catch (e) {
        console.warn("Save prescriptions failed:", e);
      }
    })();
  }, [prescriptions, ready]);

  const value = useMemo<StoreValue>(() => {
    function addPrescription(input: Omit<Prescription, "prescriptionId" | "createdAt">) {
      const prescriptionId = makeId("p");

      const itemsWithId: PrescriptionItem[] = input.items.map((it) => ({
        ...it,
        // ✅ itemId 如果是空字串/undefined，就補一個（避免 React key 重複）
        itemId: it.itemId && it.itemId.trim() ? it.itemId : makeId("it"),
      }));

      const record: Prescription = {
        prescriptionId,
        careTargetId: input.careTargetId,
        title: input.title,
        createdAt: Date.now(),
        sourceImageUrl: input.sourceImageUrl,
        status: input.status,
        ocrRawText: input.ocrRawText,
        items: itemsWithId,
      };

      // 新的放最前面
      setPrescriptions((prev) => [record, ...prev]);
      return prescriptionId;
    }

    function deletePrescription(prescriptionId: string) {
      setPrescriptions((prev) => prev.filter((p) => p.prescriptionId !== prescriptionId));
    }

    function updatePrescription(id: string, data: Partial<Prescription>) {
      setPrescriptions((prev) =>
        prev.map((p) => (p.prescriptionId === id ? { ...p, ...data } : p))
      );
    }
    
    function updatePrescriptionImage(prescriptionId: string, imageUrl: string) {
      setPrescriptions((prev) =>
        prev.map((p) => (p.prescriptionId === prescriptionId ? { ...p, sourceImageUrl: imageUrl } : p))
      );
    }

    function getPrescriptionsByCareTargetId(careTargetId: string) {
      return prescriptions.filter((p) => p.careTargetId === careTargetId);
    }

    function getPrescriptionById(id: string) {
      return prescriptions.find((p) => p.prescriptionId === id);
    }

    function resetStore() {
      setPrescriptions([]);
    }

    return {
      ready,
      prescriptions,
      addPrescription,
      deletePrescription,
      updatePrescription,
      updatePrescriptionImage,
      getPrescriptionsByCareTargetId,
      getPrescriptionById,
      resetStore,
    };
  }, [prescriptions, ready]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStoreContext() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
