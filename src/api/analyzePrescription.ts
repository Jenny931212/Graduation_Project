import Constants from "expo-constants";

export interface AnalyzeResult {
  medicines: any[];
  raw_text?: string;
}

export interface TranslationResult {
  detected_language: string;
  target_language: string;
  original_text: string;
  translated_text: string;
}

function getPrescriptionApiBaseUrl() {
  const baseUrl = Constants.expoConfig?.extra?.prescriptionApiBaseUrl;

  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    throw new Error(
      "Missing Expo config: expo.extra.prescriptionApiBaseUrl is not set"
    );
  }

  return baseUrl.replace(/\/+$/, "");
}

function getPrescriptionAnalyzeUrl() {
  return `${getPrescriptionApiBaseUrl()}/analyze/url`;
}

function getPrescriptionTranslateUrl() {
  return `${getPrescriptionApiBaseUrl()}/translate`;
}

export async function analyzePrescriptionByUrl(imageUrl: string): Promise<AnalyzeResult> {
  let response: Response;

  try {
    response = await fetch(getPrescriptionAnalyzeUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl }),
    });
  } catch (err: any) {
    // 這裡抓到的通常就是 ATS / 連線層問題
    throw new Error(`Network request failed: ${String(err?.message ?? err)}`);
  }

  const text = await response.text(); // 先拿原始內容，避免 json() 把線索吃掉

  if (!response.ok) {
    throw new Error(`AI analyze failed (${response.status}): ${text}`);
  }

  try {
    return JSON.parse(text) as AnalyzeResult;
  } catch {
    throw new Error(`AI analyze returned non-JSON: ${text}`);
  }
}

export async function translateText(
  textToTranslate: string,
  targetLanguage = "English"
): Promise<TranslationResult> {
  let response: Response;

  try {
    response = await fetch(getPrescriptionTranslateUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: textToTranslate,
        target_language: targetLanguage,
      }),
    });
  } catch (err: any) {
    throw new Error(`Network request failed: ${String(err?.message ?? err)}`);
  }

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`AI translate failed (${response.status}): ${text}`);
  }

  try {
    return JSON.parse(text) as TranslationResult;
  } catch {
    throw new Error(`AI translate returned non-JSON: ${text}`);
  }
}
