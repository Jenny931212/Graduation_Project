import type { translations } from "@/src/i18n/translations";
import type { NotificationDocument } from "@/src/notifications/notificationSchema";

type TranslationSet = (typeof translations)[keyof typeof translations];
type NotificationLike = NotificationDocument & Record<string, any>;

function textValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function pickText(data: NotificationLike | null | undefined, keys: string[]) {
  if (!data) return "";

  for (const key of keys) {
    const direct = textValue(data[key]);
    if (direct) return direct;

    const metadata = data.metadata;
    if (metadata && typeof metadata === "object") {
      const nested = textValue(metadata[key]);
      if (nested) return nested;
    }
  }

  return "";
}

export function buildNotificationBody(data: NotificationLike | null | undefined, t: TranslationSet) {
  if (!data) return "";

  const eventTime = pickText(data, ["time", "scheduleTime", "eventTime"]);
  const patientName = pickText(data, ["patientName", "name", "personName"]);
  const eventTitle = pickText(data, ["eventTitle", "medicineName", "eventName"]);
  const itemTitle = pickText(data, ["itemTitle"]);
  const location = pickText(data, ["location", "place"]);

  switch (data.type) {
    case "calendar_event": {
      const eventDate = pickText(data, ["eventDate"]);
      return [patientName, eventTitle, eventDate, eventTime, location].filter(Boolean).join(" ") || data.body || "";
    }
    case "calendar_event_completed":
      return eventTitle
        ? `${eventTitle}${t.notificationCalendarEventCompletedBodySuffix}`
        : data.body || "";
    case "daily_checklist_completed":
      return itemTitle
        ? `${patientName ? `${patientName} ` : ""}${itemTitle}${t.notificationDailyChecklistCompletedBodySuffix}`
        : data.body || "";
    default:
      return data.body || "";
  }
}

export function getNotificationTitle(data: NotificationLike | null | undefined, t: TranslationSet) {
  if (!data) return t.notification;

  switch (data.type) {
    case "medication_reminder":
      return t.notificationMedicationReminder;
    case "abnormal_health":
      return t.notificationAbnormalHealth;
    case "medication_done":
      return t.notificationMedicationDone;
    case "chat_message":
      return t.notificationChatMessage;
    case "calendar_event":
      return t.notificationCalendarEvent;
    case "calendar_event_completed":
      return t.notificationCalendarEventCompleted;
    case "daily_checklist_completed":
      return t.notificationDailyChecklistCompleted;
    case "health_report_missing":
      return t.notificationHealthReportMissing;
    default:
      return data.title || t.notification;
  }
}

export function getNotificationText(data: NotificationLike, t: TranslationSet) {
  return {
    title: getNotificationTitle(data, t),
    body: buildNotificationBody(data, t),
  };
}
