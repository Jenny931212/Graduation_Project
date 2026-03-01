import { Repo, CreatePrescriptionInput } from "./repo";
import { PrescriptionDoc, PrescriptionItemDoc } from "../domain/types";

// ====== 本地「假 Firestore」資料庫 ======
const db = {
  prescriptions: new Map<string, PrescriptionDoc>(),
  items: new Map<string, PrescriptionItemDoc[]>(), // key = prescriptionId
};

// 產生 id（本地用）
function genId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

// ====== 實作 Repo ======
export const localRepo: Repo = {
  async listPrescriptions(careTargetId) {
    const all = Array.from(db.prescriptions.values());
    return all
      .filter(p => p.careTargetId === careTargetId)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  async getPrescription(prescriptionId) {
    return db.prescriptions.get(prescriptionId) ?? null;
  },

  async listPrescriptionItems(prescriptionId) {
    return db.items.get(prescriptionId) ?? [];
  },

  async createPrescription(input: CreatePrescriptionInput) {
    const prescriptionId = genId("pr");

    const doc: PrescriptionDoc = {
      prescriptionId,
      careTargetId: input.careTargetId,
      createdAt: Date.now(),
      sourceImageUrl: input.sourceImageUrl,
      status: input.ai.status,
      ocrRawText: input.ai.ocrRawText,
    };

    const items: PrescriptionItemDoc[] = input.ai.items.map((x) => ({
      itemId: genId("it"),
      prescriptionId,
      ...x,
    }));

    db.prescriptions.set(prescriptionId, doc);
    db.items.set(prescriptionId, items);

    return { prescriptionId };
  },
};
