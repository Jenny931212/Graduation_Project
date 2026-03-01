export type UserRole = "caregiver" | "family";

export type UserDoc = {
  uid: string;
  role: UserRole;
  careTargetId: "ct_001";
};

export type TimeOfDay = "morning" | "noon" | "afternoon" | "night";

export type PrescriptionStatus = "parsed" | "need_manual_fix";

export type PrescriptionDoc = {
  prescriptionId: string;
  careTargetId: "ct_001";
  createdAt: number; // 本地先用 timestamp，之後 Firestore 會換成 serverTimestamp()
  sourceImageUrl: string; // 本地可放 imageUri
  status: PrescriptionStatus;
  ocrRawText?: string;
};

export type PrescriptionItemDoc = {
  itemId: string;
  prescriptionId: string;

  drug_name_zh: string;
  drug_name_translated: string;
  dose: string;
  time_of_day: TimeOfDay[];
  note_zh: string;
  note_translated: string;
};

export type AIParseResponse = {
  status: PrescriptionStatus;
  ocrRawText?: string;
  items: Omit<PrescriptionItemDoc, "itemId" | "prescriptionId">[];
};
