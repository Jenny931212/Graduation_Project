import {
  type DocumentReference,
  type Firestore,
  runTransaction,
  updateDoc,
} from "firebase/firestore";

import { translateText } from "@/src/api/analyzePrescription";
import type { Language } from "@/src/i18n/translations";

export type DynamicTranslationSpec = {
  baseName: string;
  sourceKeys: string[];
};

export const PRESCRIPTION_ITEM_TRANSLATION_SPECS: DynamicTranslationSpec[] = [
  {
    baseName: "drug_name",
    sourceKeys: ["drug_name_zh", "drug_name", "drug_name_translated", "name"],
  },
  {
    baseName: "usage",
    sourceKeys: ["usage_zh", "usage", "time_of_day", "time"],
  },
  {
    baseName: "note",
    sourceKeys: ["note_zh", "memo", "note", "note_translated"],
  },
];

const TARGET_LANGUAGE_NAMES: Record<Language, string> = {
  zh: "Traditional Chinese",
  en: "English",
  vi: "Vietnamese",
  id: "Indonesian",
};

const pendingTranslationKeys = new Set<string>();

function textValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function pickSourceText(raw: Record<string, any> | null | undefined, sourceKeys: string[]) {
  if (!raw) return "";

  for (const key of sourceKeys) {
    const direct = textValue(raw[key]);
    if (direct) return direct;

    const metadata = raw.metadata;
    if (metadata && typeof metadata === "object") {
      const nested = textValue(metadata[key]);
      if (nested) return nested;
    }
  }

  return "";
}

export function pickDynamicLocalizedString(
  raw: Record<string, any> | null | undefined,
  baseName: string,
  language: Language,
  sourceKeys: string[],
  fallback = ""
) {
  if (!raw) return fallback;

  return (
    textValue(raw[`${baseName}_${language}`]) ||
    textValue(raw[`${baseName}_zh`]) ||
    pickSourceText(raw, sourceKeys) ||
    fallback
  );
}

export async function ensureFirestoreTranslations(
  docRef: DocumentReference,
  raw: Record<string, any> | null | undefined,
  language: Language,
  specs: DynamicTranslationSpec[]
) {
  if (!raw || language === "zh") return {};

  const updatePayload: Record<string, string> = {};
  const targetLanguage = TARGET_LANGUAGE_NAMES[language];

  for (const spec of specs) {
    const targetKey = `${spec.baseName}_${language}`;
    if (textValue(raw[targetKey])) continue;

    const sourceText =
      textValue(raw[`${spec.baseName}_zh`]) ||
      pickSourceText(raw, spec.sourceKeys);

    if (!sourceText) continue;

    const pendingKey = `${docRef.path}:${targetKey}:${language}`;
    if (pendingTranslationKeys.has(pendingKey)) continue;

    pendingTranslationKeys.add(pendingKey);

    try {
      const result = await translateText(sourceText, targetLanguage);
      const translatedText = textValue(result.translated_text);
      if (translatedText) {
        updatePayload[targetKey] = translatedText;
      }
    } catch (error) {
      console.log("auto translate failed:", error);
    } finally {
      pendingTranslationKeys.delete(pendingKey);
    }
  }

  if (Object.keys(updatePayload).length > 0) {
    await updateDoc(docRef, updatePayload);
  }

  return updatePayload;
}

export async function ensureAbnormalRecordEntryTranslation(
  firestore: Firestore,
  docRef: DocumentReference,
  entry: Record<string, any> | null | undefined,
  language: Language
) {
  if (!entry || language === "zh") return {};

  const entryId = textValue(entry.entryId);
  const targetKey = `notes_${language}`;
  if (!entryId || textValue(entry[targetKey])) return {};

  const sourceText = textValue(entry.notesZh) || textValue(entry.notesOriginal);
  if (!sourceText) return {};

  const pendingKey = `${docRef.path}:entries:${entryId}:${targetKey}:${language}`;
  if (pendingTranslationKeys.has(pendingKey)) return {};

  pendingTranslationKeys.add(pendingKey);

  try {
    const result = await translateText(sourceText, TARGET_LANGUAGE_NAMES[language]);
    const translatedText = textValue(result.translated_text);
    if (!translatedText) return {};

    let didUpdate = false;

    await runTransaction(firestore, async (transaction) => {
      const latestSnap = await transaction.get(docRef);
      if (!latestSnap.exists()) return;

      const latestData = latestSnap.data() as Record<string, any>;
      const latestEntries = Array.isArray(latestData.entries) ? latestData.entries : [];
      const latestIndex = latestEntries.findIndex(
        (latestEntry: Record<string, any>) => textValue(latestEntry?.entryId) === entryId
      );
      if (latestIndex < 0) return;

      const latestEntry = latestEntries[latestIndex] as Record<string, any>;
      if (textValue(latestEntry[targetKey])) return;

      const nextEntries = latestEntries.map((item: Record<string, any>, index: number) =>
        index === latestIndex ? { ...item, [targetKey]: translatedText } : item
      );

      transaction.update(docRef, { entries: nextEntries });
      didUpdate = true;
    });

    return didUpdate ? { [targetKey]: translatedText } : {};
  } catch (error) {
    console.log("auto translate abnormal entry failed:", error);
    return {};
  } finally {
    pendingTranslationKeys.delete(pendingKey);
  }
}
