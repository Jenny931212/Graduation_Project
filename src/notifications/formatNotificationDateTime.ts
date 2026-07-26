import type { Language, translations } from "@/src/i18n/translations";

type TranslationSet = (typeof translations)[keyof typeof translations];

const LOCALE_BY_LANGUAGE: Record<Language, string> = {
  zh: "zh-TW",
  en: "en-US",
  vi: "vi-VN",
  id: "id-ID",
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * Accepts whatever shape a notification's date field happens to be in
 * (Firestore Timestamp, JS Date, ISO string, epoch number, plain
 * {seconds,nanoseconds} object, or missing) and returns a valid Date or null.
 */
export function toSafeDate(value: unknown): Date | null {
  if (value == null) return null;

  if (typeof (value as { toDate?: unknown })?.toDate === "function") {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return date instanceof Date && !isNaN(date.getTime()) ? date : null;
    } catch {
      return null;
    }
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "object" && typeof (value as { seconds?: unknown }).seconds === "number") {
    const date = new Date((value as { seconds: number }).seconds * 1000);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getYesterday(from: Date) {
  const yesterday = new Date(from);
  yesterday.setDate(from.getDate() - 1);
  return yesterday;
}

/** Formats a notification timestamp as "today HH:MM" / "yesterday HH:MM" / "YYYY/MM/DD HH:MM". */
export function formatNotificationDateTime(
  value: unknown,
  t: TranslationSet,
  language: Language
): string {
  const date = toSafeDate(value);
  if (!date) return "";

  const locale = LOCALE_BY_LANGUAGE[language] || "zh-TW";
  const time = date.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const now = new Date();
  if (isSameDay(date, now)) return `${t.today} ${time}`;
  if (isSameDay(date, getYesterday(now))) return `${t.yesterday} ${time}`;

  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${time}`;
}

/** Groups notifications by calendar day; "unknown" bucket is used when no valid date is available. */
export function getDateGroupKey(value: unknown): string {
  const date = toSafeDate(value);
  if (!date) return "unknown";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatDateGroupLabel(
  groupKey: string,
  t: TranslationSet,
  language: Language
): string {
  if (groupKey === "unknown") return t.notification;

  const [year, month, day] = groupKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const now = new Date();

  if (isSameDay(date, now)) return t.today;
  if (isSameDay(date, getYesterday(now))) return t.yesterday;

  const locale = LOCALE_BY_LANGUAGE[language] || "zh-TW";
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
