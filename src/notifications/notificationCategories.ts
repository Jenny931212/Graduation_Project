import type { translations } from "@/src/i18n/translations";

type TranslationSet = (typeof translations)[keyof typeof translations];
type TranslationKey = keyof TranslationSet;

export type NotificationCategoryId = "all" | "health" | "medication" | "care" | "other";
export type NotificationLevel = "warning" | "critical";

export const NOTIFICATION_CATEGORY_IDS: NotificationCategoryId[] = [
  "all",
  "health",
  "medication",
  "care",
  "other",
];

const HEALTH_TYPES = new Set(["abnormal_health", "health_report_missing"]);
const MEDICATION_TYPES = new Set(["medication_reminder", "medication_done"]);
const CARE_TYPES = new Set([
  "calendar_event",
  "calendar_event_completed",
  "daily_checklist_completed",
]);

export function getNotificationCategory(
  type: string | undefined | null
): Exclude<NotificationCategoryId, "all"> {
  if (type && HEALTH_TYPES.has(type)) return "health";
  if (type && MEDICATION_TYPES.has(type)) return "medication";
  if (type && CARE_TYPES.has(type)) return "care";
  return "other";
}

export function getNotificationLevel(
  data: { level?: unknown } | null | undefined
): NotificationLevel | null {
  const level = data?.level;
  return level === "warning" || level === "critical" ? level : null;
}

export const CATEGORY_LABEL_KEY: Record<NotificationCategoryId, TranslationKey> = {
  all: "notificationCategoryAll",
  health: "notificationCategoryHealth",
  medication: "notificationCategoryMedication",
  care: "notificationCategoryCare",
  other: "notificationCategoryOther",
};

export const CATEGORY_EMPTY_KEY: Record<NotificationCategoryId, TranslationKey> = {
  all: "notificationEmptyAll",
  health: "notificationEmptyHealth",
  medication: "notificationEmptyMedication",
  care: "notificationEmptyCare",
  other: "notificationEmptyOther",
};

type CategoryVisual = { icon: string; tint: string; tintSoft: string };

const CATEGORY_VISUALS: Record<Exclude<NotificationCategoryId, "all">, CategoryVisual> = {
  health: { icon: "🩺", tint: "#7C6FE0", tintSoft: "#EDE9FE" },
  medication: { icon: "💊", tint: "#2563EB", tintSoft: "#DBEAFE" },
  care: { icon: "📅", tint: "#C2760F", tintSoft: "#FFF4E5" },
  other: { icon: "🔔", tint: "#6B7280", tintSoft: "#F3F4F6" },
};

const LEVEL_VISUALS: Record<NotificationLevel, CategoryVisual> = {
  warning: { icon: "⚠️", tint: "#B45309", tintSoft: "#FEF3C7" },
  critical: { icon: "🚨", tint: "#B91C1C", tintSoft: "#FEE2E2" },
};

export function getNotificationVisual(data: {
  type?: string;
  level?: unknown;
} | null | undefined): CategoryVisual & {
  category: NotificationCategoryId;
  level: NotificationLevel | null;
} {
  const category = getNotificationCategory(data?.type);
  const level = getNotificationLevel(data);
  const visual = level ? LEVEL_VISUALS[level] : CATEGORY_VISUALS[category];
  return { category, level, ...visual };
}

const SOURCE_LABEL_KEY: Record<string, TranslationKey> = {
  health_records: "notificationSourceHealthRecords",
  medication_reminders: "notificationSourceMedicationReminders",
  medication_logs: "notificationSourceMedicationLogs",
  calendar_events: "notificationSourceCalendarEvents",
  chats: "notificationSourceChats",
};

export function getSourceLabel(
  sourceCollection: string | undefined | null,
  t: TranslationSet
): string {
  if (!sourceCollection) return "";
  const key = SOURCE_LABEL_KEY[sourceCollection];
  return key ? t[key] : t.notificationSourceOther;
}
