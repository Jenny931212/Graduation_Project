import { AIParseResponse, PrescriptionDoc, PrescriptionItemDoc } from "../domain/types";

export type CreatePrescriptionInput = {
  careTargetId: "ct_001";
  sourceImageUrl: string; // 本地先放 imageUri
  ai: AIParseResponse;    // 先用假資料/或未來接後端AI回傳
};

export type Repo = {
  // 家屬端：列表/詳情要用
  listPrescriptions(careTargetId: "ct_001"): Promise<PrescriptionDoc[]>;
  getPrescription(prescriptionId: string): Promise<PrescriptionDoc | null>;
  listPrescriptionItems(prescriptionId: string): Promise<PrescriptionItemDoc[]>;

  // 看護端：送出解析結果要用（建立一筆藥單+items）
  createPrescription(input: CreatePrescriptionInput): Promise<{ prescriptionId: string }>;
};
