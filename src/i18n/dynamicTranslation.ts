import { type DocumentReference, updateDoc } from "firebase/firestore";

import { translateText } from "@/src/api/analyzePrescription";
import type { Language } from "@/src/i18n/translations";

export type DynamicTranslationSpec = {
  baseName: string;
  sourceKeys: string[];
};

const TARGET_LANGUAGE_NAMES: Record<Language, string> = {
  zh: "Traditional Chinese",
  en: "English",
  vi: "Vietnamese",
  id: "Indonesian",
};

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

    try {
      const result = await translateText(sourceText, targetLanguage);
      const translatedText = textValue(result.translated_text);
      if (translatedText) {
        updatePayload[targetKey] = translatedText;
      }
    } catch (error) {
      console.log("auto translate failed:", error);
    }
  }

  if (Object.keys(updatePayload).length > 0) {
    await updateDoc(docRef, updatePayload);
  }

  return updatePayload;
}
