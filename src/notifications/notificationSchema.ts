import type { Timestamp } from "firebase/firestore";

/**
 * Firestore collection: `notifications`
 *
 * Suggested usage:
 * - write one document per recipient
 * - query by `recipientUid`
 * - sort by `createdAt` descending
 *
 * Example shape:
 * notifications/{notificationId} {
 *   recipientUid: string
 *   type: NotificationType
 *   title: string
 *   body: string
 *   createdAt: Timestamp
 *   isRead: boolean
 *   patientId?: string
 *   deepLink?: string
 * }
 */
export const NOTIFICATIONS_COLLECTION = "notifications" as const;

export type NotificationType =
  | "medication_reminder"
  | "abnormal_health"
  | "medication_done"
  | "chat_message"
  | "calendar_event"
  | "calendar_event_completed"
  | "daily_checklist_completed"
  | "health_report_missing"
  | "custom";

export type NotificationDocument = {
  recipientUid: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: Timestamp;
  isRead: boolean;
  patientId?: string;
  deepLink?: string;
  metadata?: Record<string, string | undefined> & {
    eventTitle?: string;
    eventDate?: string;
    eventTime?: string;
    location?: string;
    patientName?: string;
    eventId?: string;
    patientId?: string;
    completedBy?: string;
    completedAt?: string;
    eventType?: string;
    itemTitle?: string;
    dateKey?: string;
    caregiverId?: string;
    source?: string;
  };
};
