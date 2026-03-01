// src/store/prescriptions.ts
//
// ✅ Repository（資料存取層）：
// - UI 透過這裡提供的函式 add/list/get/update 進行資料操作
// - 統一處理資料格式轉換（例如將 UI 的 Item 轉為資料庫存儲的 PrescriptionItem）

import type { Prescription, PrescriptionItem, TimeOfDay } from "./StoreProvider";
import { useStore } from "./useStore";

// ----------------------------
// 對齊共同規格的輸入格式
// ----------------------------
export type AddPrescriptionInput = {
  careTargetId: string;
  title?: string;                     // 藥單標題
  sourceImageUrl?: string;            // 圖片路徑
  status: "parsed" | "need_manual_fix";
  ocrRawText?: string;
  items: Array<{
    drug_name_zh: string;
    drug_name_translated?: string;
    dose: string;
    time_of_day: TimeOfDay[];
    note_zh?: string;
    note_translated?: string;
  }>;
};

export function usePrescriptionsRepo() {
  const { 
    addPrescription, 
    updatePrescription, // ✅ 確保 StoreProvider 有提供此函式
    getPrescriptionsByCareTargetId, 
    getPrescriptionById 
  } = useStore() as any; // 暫時使用 any 避免型別定義未同步的錯誤

  return {
    /**
     * 新增一筆藥單
     */
    async create(input: AddPrescriptionInput): Promise<string> {
      const items: PrescriptionItem[] = input.items.map((it, idx) => ({
        itemId: `it_${Date.now()}_${idx}`,
        drug_name_zh: it.drug_name_zh,
        drug_name_translated: it.drug_name_translated,
        dose: it.dose,
        time_of_day: it.time_of_day,
        note_zh: it.note_zh,
        note_translated: it.note_translated,
      }));

      const id = addPrescription({
        careTargetId: input.careTargetId,
        title: input.title,
        sourceImageUrl: input.sourceImageUrl,
        status: input.status,
        ocrRawText: input.ocrRawText,
        items,
      });

      return id;
    },

    /**
     * ✅ 更新現有藥單（不改變 ID）
     */
    async update(id: string, input: Partial<AddPrescriptionInput>): Promise<void> {
      // 如果有傳入新的項目清單，需要重新格式化並生成 itemId
      let updatedItems: PrescriptionItem[] | undefined;
      
      if (input.items) {
        updatedItems = input.items.map((it, idx) => ({
          itemId: `it_${Date.now()}_${idx}`,
          drug_name_zh: it.drug_name_zh,
          dose: it.dose,
          time_of_day: it.time_of_day,
          note_zh: it.note_zh,
          drug_name_translated: it.drug_name_translated,
          note_translated: it.note_translated,
        }));
      }

      // 呼叫 StoreProvider 的更新邏輯
      updatePrescription(id, {
        title: input.title,
        status: input.status,
        items: updatedItems,
        sourceImageUrl: input.sourceImageUrl,
        ocrRawText: input.ocrRawText,
      });
    },

    /**
     * 依照 careTargetId 列出藥單
     */
    async listByCareTargetId(careTargetId: string): Promise<Prescription[]> {
      const list = getPrescriptionsByCareTargetId(careTargetId);
      return [...list].sort((a, b) => b.createdAt - a.createdAt);
    },

    /**
     * 依照 id 取得單張藥單
     */
    async getById(id: string): Promise<Prescription | undefined> {
      return getPrescriptionById(id);
    },
  };
}