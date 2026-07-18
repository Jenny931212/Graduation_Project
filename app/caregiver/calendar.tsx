import { Feather, Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { auth, db } from "@/firebase/firebaseConfig";
import { useAuth } from "@/src/auth/useAuth";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import {
  ensureFirestoreTranslations,
  pickDynamicLocalizedString,
} from "@/src/i18n/dynamicTranslation";
import { translations, type Language } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";

type CalendarEventRecord = {
  id: string;
  [key: string]: any;
  patientId?: string;
  createdBy?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  completedBy?: string;
  startAt?: Timestamp | null;
  eventDate?: string;
  hour?: string;
  minute?: string;
  period?: "am" | "pm";
  color?: string;
  isCompleted?: boolean;
  personName?: string;
  name?: string;
  patientName?: string;
  title?: string;
  eventTitle?: string;
  event?: string;
  description?: string;
  location?: string;
  place?: string;
};

type FormState = {
  personName: string;
  title: string;
  location: string;
  color: string;
};

type TimePeriod = "am" | "pm";

type CalendarCell = {
  day: number;
  kind: "prev" | "current" | "next";
  date: Date;
};

type CalendarEventViewModel = CalendarEventRecord & {
  resolvedPersonName: string;
  resolvedTitle: string;
  resolvedLocation: string;
  resolvedDescription: string;
  resolvedColor: string;
  resolvedIsCompleted: boolean;
  resolvedDate: Date;
};

type DailyChecklistItem = {
  id: string;
  title: string;
  title_en?: string;
  title_vi?: string;
  title_id?: string;
  completed: boolean;
  isDefault: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  createdBy: string;
  caregiverId: string;
  patientId: string;
  dateKey: string;
  dailyChecklistDocId?: string;
};

const CALENDAR_EVENTS_COLLECTION = "calendar_events";
const DEFAULT_DAILY_CHECKLIST_ITEMS = ["喝水1500cc", "運動30分鐘", "睡前關懷"];
const DEFAULT_DAILY_CHECKLIST_TRANSLATION_KEYS = [
  "dailyChecklistDefaultWater",
  "dailyChecklistDefaultExercise",
  "dailyChecklistDefaultCare",
] as const;
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EVENT_COLORS = ["#F4A261", "#B9A0F3", "#73B8F2", "#F6BDC2", "#7EDB68"];
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const PERIODS: TimePeriod[] = ["am", "pm"];
const WHEEL_ROW_HEIGHT = 24;
const WHEEL_HEIGHT = 170;
const MAX_DAY_MARKERS = 4;

function pad2(value: number | string) {
  return String(value).padStart(2, "0");
}

function sameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function to24Hour(hour12: number, period: TimePeriod) {
  if (period === "am") {
    return hour12 === 12 ? 0 : hour12;
  }

  return hour12 === 12 ? 12 : hour12 + 12;
}

function buildEventDate(selectedDate: Date, hour: number, minute: number, period: TimePeriod) {
  const next = new Date(selectedDate);
  next.setHours(to24Hour(hour, period), minute, 0, 0);
  return next;
}

function extractTimeParts(date: Date) {
  const rawMinute = Math.round(date.getMinutes() / 5) * 5;
  const minute = rawMinute >= 60 ? 55 : rawMinute;
  const hour24 = date.getHours();
  const period: TimePeriod = hour24 >= 12 ? "pm" : "am";
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return { hour, minute, period };
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getTodayDate() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function getCurrentMonthStart() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

function getMonthMeta(currentMonth: Date) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = getDaysInMonth(year, month);
  const prevMonthDays = getDaysInMonth(year, month - 1);
  const cells: CalendarCell[] = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    const day = prevMonthDays - firstWeekday + i + 1;
    cells.push({
      day,
      kind: "prev",
      date: new Date(year, month - 1, day),
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      day,
      kind: "current",
      date: new Date(year, month, day),
    });
  }

  while (cells.length < 35) {
    const day = cells.length - (firstWeekday + daysInMonth) + 1;
    cells.push({
      day,
      kind: "next",
      date: new Date(year, month + 1, day),
    });
  }

  while (cells.length % 7 !== 0) {
    const day = cells.length - (firstWeekday + daysInMonth) + 1;
    cells.push({
      day,
      kind: "next",
      date: new Date(year, month + 1, day),
    });
  }

  return cells;
}

function formatEventDateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function makeCalendarEventDocId(eventDate: string, patientsId?: string) {
  const patientSuffix = patientsId?.trim().slice(-4);
  if (!patientSuffix) return "";
  return `${eventDate}_${patientSuffix}`;
}

function getPatientStorageId(patientDocId?: string, patientsId?: string) {
  const docId = patientDocId?.trim() ?? "";
  const match = docId.match(/(?:^|_)pat_([A-Za-z0-9]+)$/);
  if (match) return `pat_${match[1]}`;
  return patientsId?.trim() || docId;
}

function makeDailyChecklistDocId(
  dateKey: string,
  patientDocId?: string,
  patientsId?: string
) {
  const stablePatientId = getPatientStorageId(patientDocId, patientsId);
  if (!stablePatientId) return "";
  return `${dateKey}_${stablePatientId}`;
}

function getDailyChecklistItemTitle(
  item: DailyChecklistItem,
  t: (typeof translations)[keyof typeof translations],
  language: Language
) {
  const defaultIndex = DEFAULT_DAILY_CHECKLIST_ITEMS.indexOf(item.title);
  if (item.isDefault && defaultIndex >= 0) {
    return t[DEFAULT_DAILY_CHECKLIST_TRANSLATION_KEYS[defaultIndex]] || item.title;
  }

  return pickDynamicLocalizedString(item, "title", language, ["title"], item.title);
}

function resolveTitle(event: CalendarEventRecord) {
  return event.title || event.eventTitle || event.event || event.description || "";
}

function resolvePersonName(event: CalendarEventRecord) {
  return event.name || event.personName || event.patientName || "";
}

function resolveLocation(event: CalendarEventRecord) {
  return event.location || event.place || "";
}

function resolveDescription(event: CalendarEventRecord) {
  const titleSource = event.title || event.eventTitle || event.event || "";
  const description = event.description || "";
  return description && description !== titleSource ? description : "";
}

function resolveColor(event: CalendarEventRecord) {
  return event.color || EVENT_COLORS[0];
}

function resolveIsCompleted(event: CalendarEventRecord) {
  return event.isCompleted === true;
}

function getHexRgb(hex: string) {
  const normalized = hex.replace("#", "").trim();
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((value) => value + value)
          .join("")
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return null;
  }

  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function isDarkColor(hex: string) {
  const rgb = getHexRgb(hex);

  if (!rgb) {
    return false;
  }

  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 < 150;
}

function getEventDateObject(event: CalendarEventRecord) {
  if (event.startAt instanceof Timestamp) {
    return event.startAt.toDate();
  }

  if (event.eventDate) {
    const [year, month, day] = event.eventDate.split("-").map(Number);
    const hour = Number(event.hour) || 7;
    const minute = Number(event.minute) || 0;
    return buildEventDate(
      new Date(year, (month || 1) - 1, day || 1),
      hour,
      minute,
      event.period || "pm"
    );
  }

  return buildEventDate(new Date(), 7, 0, "pm");
}

function toCalendarEventViewModel(event: CalendarEventRecord): CalendarEventViewModel {
  return {
    ...event,
    resolvedPersonName: resolvePersonName(event),
    resolvedTitle: resolveTitle(event),
    resolvedLocation: resolveLocation(event),
    resolvedDescription: resolveDescription(event),
    resolvedColor: resolveColor(event),
    resolvedIsCompleted: resolveIsCompleted(event),
    resolvedDate: getEventDateObject(event),
  };
}

function getEventTimeParts(event: CalendarEventViewModel) {
  const { hour, minute, period } = extractTimeParts(event.resolvedDate);
  return {
    time: `${hour}:${pad2(minute)}`,
    period,
  };
}

function WheelColumn<T extends string | number>({
  values,
  value,
  onChange,
  renderValue,
}: {
  values: T[];
  value: T;
  onChange: (value: T) => void;
  renderValue: (value: T) => string;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = Math.max(values.findIndex((item) => item === value), 0);
  const verticalPadding = (WHEEL_HEIGHT - WHEEL_ROW_HEIGHT) / 2;

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: selectedIndex * WHEEL_ROW_HEIGHT,
        animated: false,
      });
    });
  }, [selectedIndex]);

  const updateValueFromOffset = (offsetY: number) => {
    const nextIndex = Math.max(0, Math.min(values.length - 1, Math.round(offsetY / WHEEL_ROW_HEIGHT)));
    const nextValue = values[nextIndex];

    if (nextValue !== undefined && nextValue !== value) {
      onChange(nextValue);
    }
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateValueFromOffset(event.nativeEvent.contentOffset.y);
  };

  return (
    <View style={styles.wheelColumn}>
      <View style={styles.wheelFrame}>
        <View style={styles.wheelSelectedBand} />
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingVertical: verticalPadding }}
          decelerationRate="fast"
          nestedScrollEnabled
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={WHEEL_ROW_HEIGHT}
          style={styles.wheelList}
        >
          {values.map((item) => {
            const isSelected = item === value;

            return (
              <Pressable key={renderValue(item)} onPress={() => onChange(item)} style={styles.wheelRow}>
                <Text style={[styles.wheelRowText, isSelected && styles.wheelRowTextSelected]}>
                  {renderValue(item)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

export default function CaregiverCalendarScreen() {
  const { user } = useAuth();
  const { activePatientId, activePatient } = useActiveCareTarget();
  const { language } = useLanguage();
  const t = translations[language];
  const weekLabels = language === "zh" ? ["一", "二", "三", "四", "五", "六", "日"] : WEEK_LABELS;

  const [currentMonth, setCurrentMonth] = useState(getCurrentMonthStart);
  const [selectedDate, setSelectedDate] = useState(getTodayDate);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEventRecord[]>([]);
  const [form, setForm] = useState<FormState>({
    personName: "",
    title: "",
    location: "",
    color: EVENT_COLORS[0],
  });
  const [formHour, setFormHour] = useState(7);
  const [formMinute, setFormMinute] = useState(0);
  const [formPeriod, setFormPeriod] = useState<TimePeriod>("pm");
  const [dailyChecklistItems, setDailyChecklistItems] = useState<DailyChecklistItem[]>([]);
  const [dailyChecklistExpanded, setDailyChecklistExpanded] = useState(true);
  const [dailyChecklistInput, setDailyChecklistInput] = useState("");
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);

  const calendarCells = useMemo(() => getMonthMeta(currentMonth), [currentMonth]);
  const selectedDateKey = useMemo(() => formatEventDateKey(selectedDate), [selectedDate]);
  const activePatientsId = activePatient?.patientsId ?? "";
  const dailyChecklistDocId = useMemo(
    () => makeDailyChecklistDocId(selectedDateKey, activePatientId ?? "", activePatientsId),
    [activePatientId, activePatientsId, selectedDateKey]
  );

  const monthEvents = useMemo(() => {
    return events
      .map(toCalendarEventViewModel)
      .filter(
        (event) =>
          event.resolvedDate.getFullYear() === currentMonth.getFullYear() &&
          event.resolvedDate.getMonth() === currentMonth.getMonth()
      )
      .sort((left, right) => left.resolvedDate.getTime() - right.resolvedDate.getTime());
  }, [events, currentMonth]);

  const selectedDayEvents = useMemo(
    () => monthEvents.filter((event) => sameDate(event.resolvedDate, selectedDate)),
    [monthEvents, selectedDate]
  );

  const sortedDailyChecklistItems = useMemo(() => {
    return [...dailyChecklistItems].sort((left, right) => {
      const leftDefaultIndex = DEFAULT_DAILY_CHECKLIST_ITEMS.indexOf(left.title);
      const rightDefaultIndex = DEFAULT_DAILY_CHECKLIST_ITEMS.indexOf(right.title);

      if (left.isDefault && right.isDefault && leftDefaultIndex !== rightDefaultIndex) {
        return leftDefaultIndex - rightDefaultIndex;
      }

      if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;

      const leftTime = left.createdAt?.toMillis?.() ?? 0;
      const rightTime = right.createdAt?.toMillis?.() ?? 0;
      return leftTime - rightTime;
    });
  }, [dailyChecklistItems]);

  const completedChecklistCount = useMemo(
    () => dailyChecklistItems.filter((item) => item.completed).length,
    [dailyChecklistItems]
  );

  useEffect(() => {
    setMonthMenuOpen(false);
  }, [currentMonth]);

  useEffect(() => {
    setDailyChecklistInput("");
    setEditingChecklistItemId(null);
    setDailyChecklistExpanded(true);
  }, [selectedDateKey]);

  useEffect(() => {
    if (!activePatientId) {
      setEvents([]);
      return;
    }

    const q = query(
      collection(db, CALENDAR_EVENTS_COLLECTION),
      where("patientId", "==", activePatientId),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setEvents(
          snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<CalendarEventRecord, "id">),
          }))
        );
      },
      (error) => {
        console.log("caregiver calendar snapshot failed:", error);
        setEvents([]);
      }
    );

    return () => unsubscribe();
  }, [activePatientId]);

  useEffect(() => {
    if (!activePatientId || !dailyChecklistDocId || !user?.uid) {
      setDailyChecklistItems([]);
      return;
    }

    const checklistRef = doc(db, "daily_checklist_items", dailyChecklistDocId);
    const itemsRef = collection(db, "daily_checklist_items", dailyChecklistDocId, "items");
    const oldItemsRef = collection(
      db,
      "patients",
      activePatientId,
      "daily_checklists",
      selectedDateKey,
      "items"
    );

    let seedingDefaults = false;
    let migratingLegacyItems = false;

    const ensureDailyChecklistParent = async () => {
      await setDoc(
        checklistRef,
        {
          patientId: activePatientId,
          patientsId: activePatientsId,
          dateKey: selectedDateKey,
          dailyChecklistDocId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.uid,
        },
        { merge: true }
      );
    };

    const migrateLegacyItems = async () => {
      if (migratingLegacyItems) return false;
      migratingLegacyItems = true;

      try {
        const oldSnap = await getDocs(oldItemsRef);
        if (oldSnap.empty) return false;

        await ensureDailyChecklistParent();

        const batch = writeBatch(db);
        oldSnap.docs.forEach((oldDoc) => {
          const oldData = oldDoc.data() as Partial<DailyChecklistItem>;
          batch.set(doc(itemsRef, oldDoc.id), {
            title: oldData.title ?? "",
            completed: oldData.completed === true,
            isDefault: oldData.isDefault === true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            completedAt: oldData.completed === true ? serverTimestamp() : null,
            createdBy: user.uid,
            caregiverId: user.uid,
            patientId: activePatientId,
            patientsId: activePatientsId,
            dateKey: selectedDateKey,
            dailyChecklistDocId,
          });
        });
        await batch.commit();
        return true;
      } catch (error) {
        console.log("migrate legacy daily checklist failed:", error);
        return false;
      }
    };

    const createDefaultItems = async () => {
      if (seedingDefaults) return;
      seedingDefaults = true;

      try {
        await ensureDailyChecklistParent();

        const batch = writeBatch(db);
        DEFAULT_DAILY_CHECKLIST_ITEMS.forEach((title, index) => {
          batch.set(doc(itemsRef, `default-${index + 1}`), {
              title,
              completed: false,
              isDefault: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              completedAt: null,
              createdBy: user.uid,
              caregiverId: user.uid,
              patientId: activePatientId,
              patientsId: activePatientsId,
              dateKey: selectedDateKey,
              dailyChecklistDocId,
            });
        });
        await batch.commit();
      } catch (error) {
        console.log("seed daily checklist failed:", error);
      }
    };

    const itemsQuery = query(itemsRef, where("patientId", "==", activePatientId));
    const unsubscribe = onSnapshot(
      itemsQuery,
      (snap) => {
        if (snap.empty) {
          setDailyChecklistItems([]);
          void (async () => {
            const migrated = await migrateLegacyItems();
            if (!migrated) {
              await createDefaultItems();
            }
          })();
          return;
        }

        setDailyChecklistItems(
          snap.docs.map((docSnap) => {
            const data = docSnap.data() as Partial<DailyChecklistItem>;
            return {
              id: docSnap.id,
              title: data.title ?? "",
              title_en: data.title_en ?? "",
              title_vi: data.title_vi ?? "",
              title_id: data.title_id ?? "",
              completed: data.completed === true,
              isDefault: data.isDefault === true,
              createdAt: data.createdAt ?? null,
              updatedAt: data.updatedAt ?? null,
              completedAt: data.completedAt ?? null,
              createdBy: data.createdBy ?? "",
              caregiverId: data.caregiverId ?? "",
              patientId: data.patientId ?? activePatientId,
              dateKey: data.dateKey ?? selectedDateKey,
              dailyChecklistDocId: data.dailyChecklistDocId ?? dailyChecklistDocId,
            };
          })
        );
      },
      (error) => {
        console.log("daily checklist snapshot failed:", error);
        setDailyChecklistItems([]);
      }
    );

    return () => unsubscribe();
  }, [activePatientId, activePatientsId, dailyChecklistDocId, selectedDateKey, user?.uid]);

  useEffect(() => {
    if (!activePatientId || !dailyChecklistDocId || language === "zh") return;

    dailyChecklistItems.forEach((item) => {
      if (item.isDefault) return;

      void ensureFirestoreTranslations(
        doc(db, "daily_checklist_items", dailyChecklistDocId, "items", item.id),
        item,
        language,
        [{ baseName: "title", sourceKeys: ["title"] }]
      );
    });
  }, [activePatientId, dailyChecklistDocId, dailyChecklistItems, language]);

  useEffect(() => {
    if (language === "zh") return;

    events.forEach((event) => {
      void ensureFirestoreTranslations(
        doc(db, CALENDAR_EVENTS_COLLECTION, event.id),
        event,
        language,
        [
          { baseName: "name", sourceKeys: ["name", "personName", "patientName"] },
          { baseName: "title", sourceKeys: ["title", "eventTitle", "event", "description"] },
          { baseName: "location", sourceKeys: ["location", "place"] },
          { baseName: "description", sourceKeys: ["description"] },
        ]
      );
    });
  }, [events, language]);

  const resetForm = () => {
    setForm({
      personName: "",
      title: "",
      location: "",
      color: EVENT_COLORS[0],
    });
    setFormHour(7);
    setFormMinute(0);
    setFormPeriod("pm");
    setEditingEventId(null);
  };

  const openCreateForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEditForm = (event: CalendarEventViewModel) => {
    const timeParts = extractTimeParts(event.resolvedDate);
    setSelectedDate(
      new Date(
        event.resolvedDate.getFullYear(),
        event.resolvedDate.getMonth(),
        event.resolvedDate.getDate()
      )
    );
    setCurrentMonth(new Date(event.resolvedDate.getFullYear(), event.resolvedDate.getMonth(), 1));
    setForm({
      personName: event.resolvedPersonName,
      title: event.resolvedTitle,
      location: event.resolvedLocation,
      color: event.resolvedColor,
    });
    setFormHour(timeParts.hour);
    setFormMinute(timeParts.minute);
    setFormPeriod(timeParts.period);
    setEditingEventId(event.id);
    setFormOpen(true);
  };

  const handleYearChange = (diff: number) => {
    const nextMonth = new Date(currentMonth.getFullYear() + diff, currentMonth.getMonth(), 1);
    const nextSelectedDate = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      Math.min(selectedDate.getDate(), getDaysInMonth(nextMonth.getFullYear(), nextMonth.getMonth()))
    );
    setCurrentMonth(nextMonth);
    setSelectedDate(nextSelectedDate);
  };

  const handleMonthSelect = (nextMonthIndex: number) => {
    const nextMonth = new Date(currentMonth.getFullYear(), nextMonthIndex, 1);
    const nextSelectedDate = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      Math.min(selectedDate.getDate(), getDaysInMonth(nextMonth.getFullYear(), nextMonth.getMonth()))
    );
    setCurrentMonth(nextMonth);
    setSelectedDate(nextSelectedDate);
  };

  const confirmEvent = async () => {
    if (!activePatientId || !user?.uid) return;

    const startDate = buildEventDate(selectedDate, formHour, formMinute, formPeriod);
    const eventDate = formatEventDateKey(startDate);
    const calendarEventDocId = makeCalendarEventDocId(eventDate, activePatientsId);
    if (!calendarEventDocId) return;

    const eventRef = doc(db, CALENDAR_EVENTS_COLLECTION, calendarEventDocId);
    const getErrorCode = (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    const mutablePayload = {
      name: form.personName.trim(),
      personName: form.personName.trim(),
      name_zh: form.personName.trim(),
      title: form.title.trim(),
      eventTitle: form.title.trim(),
      title_zh: form.title.trim(),
      location: form.location.trim(),
      location_zh: form.location.trim(),
      color: form.color,
      startAt: Timestamp.fromDate(startDate),
      eventDate,
      hour: String(formHour),
      minute: pad2(formMinute),
      period: formPeriod,
      updatedAt: serverTimestamp(),
    };
    const createPayload = {
      patientId: activePatientId,
      patientsId: activePatientsId,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      isCompleted: false,
      ...mutablePayload,
    };

    try {
      await setDoc(eventRef, createPayload);
    } catch (createError) {
      try {
        await updateDoc(eventRef, mutablePayload);
      } catch (updateError) {
        console.log("save calendar event failed:", {
          calendarEventDocId,
          eventRefPath: eventRef.path,
          createErrorCode: getErrorCode(createError),
          updateErrorCode: getErrorCode(updateError),
          createPayloadKeys: Object.keys(createPayload),
          mutablePayloadKeys: Object.keys(mutablePayload),
          authCurrentUserUid: auth.currentUser?.uid,
          createError,
          updateError,
        });
        return;
      }
    }

    setFormOpen(false);
    resetForm();
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      await deleteDoc(doc(db, CALENDAR_EVENTS_COLLECTION, eventId));
    } catch (error) {
      console.log("delete calendar event failed:", error);
    }
  };

  const handleToggleEventCompleted = async (event: CalendarEventViewModel) => {
    if (!user?.uid) return;

    const nextIsCompleted = !event.resolvedIsCompleted;

    setEvents((prevEvents) =>
      prevEvents.map((item) => (item.id === event.id ? { ...item, isCompleted: nextIsCompleted } : item))
    );

    try {
      const completionPayload = nextIsCompleted
        ? {
            completedAt: serverTimestamp(),
            completedBy: user.uid,
          }
        : {
            completedAt: null,
            completedBy: "",
          };

      await updateDoc(doc(db, CALENDAR_EVENTS_COLLECTION, event.id), {
        isCompleted: nextIsCompleted,
        ...completionPayload,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.log("toggle calendar event completed failed:", error);
      setEvents((prevEvents) =>
        prevEvents.map((item) => (item.id === event.id ? { ...item, isCompleted: event.resolvedIsCompleted } : item))
      );
    }
  };

  const getDailyChecklistItemRef = (itemId: string) => {
    if (!activePatientId || !dailyChecklistDocId) return null;

    return doc(db, "daily_checklist_items", dailyChecklistDocId, "items", itemId);
  };

  const saveDailyChecklistInput = async () => {
    if (!activePatientId || !dailyChecklistDocId || !user?.uid) return;

    const title = dailyChecklistInput.trim();
    if (!title) {
      Alert.alert("請輸入事項", "每日事項不能空白。");
      return;
    }

    try {
      if (editingChecklistItemId) {
        const itemRef = getDailyChecklistItemRef(editingChecklistItemId);
        if (!itemRef) return;

        await updateDoc(itemRef, {
          title,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(
        doc(db, "daily_checklist_items", dailyChecklistDocId),
          {
            patientId: activePatientId,
            patientsId: activePatientsId,
            dateKey: selectedDateKey,
            dailyChecklistDocId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: user.uid,
          },
          { merge: true }
        );

        await addDoc(
          collection(db, "daily_checklist_items", dailyChecklistDocId, "items"),
          {
            title,
            completed: false,
            isDefault: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            completedAt: null,
            createdBy: user.uid,
            caregiverId: user.uid,
            patientId: activePatientId,
            patientsId: activePatientsId,
            dateKey: selectedDateKey,
            dailyChecklistDocId,
          }
        );
      }

      setDailyChecklistInput("");
      setEditingChecklistItemId(null);
      setDailyChecklistExpanded(true);
    } catch (error) {
      console.log("save daily checklist item failed:", error);
      Alert.alert("儲存失敗", "無法儲存每日事項，請稍後再試。");
    }
  };

  const startEditDailyChecklistItem = (item: DailyChecklistItem) => {
    setDailyChecklistInput(item.title);
    setEditingChecklistItemId(item.id);
    setDailyChecklistExpanded(true);
  };

  const cancelEditDailyChecklistItem = () => {
    setDailyChecklistInput("");
    setEditingChecklistItemId(null);
  };

  const confirmDeleteDailyChecklistItem = (item: DailyChecklistItem) => {
    Alert.alert("刪除事項", "確定要刪除這個每日事項嗎？", [
      { text: "取消", style: "cancel" },
      {
        text: "刪除",
        style: "destructive",
        onPress: async () => {
          const itemRef = getDailyChecklistItemRef(item.id);
          if (!itemRef) return;

          try {
            await deleteDoc(itemRef);
          } catch (error) {
            console.log("delete daily checklist item failed:", error);
            Alert.alert("刪除失敗", "無法刪除每日事項，請稍後再試。");
          }
        },
      },
    ]);
  };

  const toggleDailyChecklistItemCompleted = async (item: DailyChecklistItem) => {
    if (!user?.uid) return;

    const itemRef = getDailyChecklistItemRef(item.id);
    if (!itemRef) return;

    const nextCompleted = !item.completed;

    setDailyChecklistItems((prevItems) =>
      prevItems.map((prevItem) =>
        prevItem.id === item.id ? { ...prevItem, completed: nextCompleted } : prevItem
      )
    );

    try {
      await updateDoc(itemRef, {
        completed: nextCompleted,
        completedAt: nextCompleted ? serverTimestamp() : null,
        caregiverId: user.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.log("toggle daily checklist item failed:", error);
      setDailyChecklistItems((prevItems) =>
        prevItems.map((prevItem) =>
          prevItem.id === item.id ? { ...prevItem, completed: item.completed } : prevItem
        )
      );
      Alert.alert("操作失敗", "無法更新每日事項狀態，請稍後再試。");
    }
  };

  const renderDayCell = (cell: CalendarCell, index: number) => {
    const dayEvents = monthEvents.filter((event) => sameDate(event.resolvedDate, cell.date));
    const visibleDayEvents = dayEvents.slice(0, MAX_DAY_MARKERS);
    const hiddenEventCount = Math.max(dayEvents.length - MAX_DAY_MARKERS, 0);
    const isSelected = sameDate(cell.date, selectedDate);

    return (
      <Pressable
        key={`${cell.kind}-${cell.day}-${index}`}
        onPress={() => {
          setSelectedDate(new Date(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate()));
          setCurrentMonth(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1));
        }}
        style={[
          styles.dayCell,
          cell.kind !== "current" && styles.dayCellMuted,
          isSelected && styles.dayCellSelected,
        ]}
      >
        <Text
          style={[
            styles.dayNumber,
            cell.kind !== "current" && styles.dayNumberMuted,
            isSelected && styles.dayNumberSelected,
          ]}
        >
          {cell.day}
        </Text>

        <View style={styles.dayMarkers}>
          {visibleDayEvents.map((event) => (
            <View key={event.id} style={[styles.dayMarker, { backgroundColor: event.resolvedColor }]} />
          ))}
          {hiddenEventCount > 0 && (
            <Text style={styles.dayMoreText} numberOfLines={1}>
              +{hiddenEventCount}
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.topBar}>
          <View style={styles.topBarSpacer} />
          <View style={styles.topBarSpacer} />
        </View>
      </View>

      <View style={styles.contentCard}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.controlsCard}>
            <View style={styles.yearRow}>
              <Pressable onPress={() => handleYearChange(-1)} hitSlop={10} style={styles.yearArrowButton}>
                <Ionicons name="caret-back" size={16} color="#2B2B2B" />
              </Pressable>
              <Text style={styles.yearText}>{currentMonth.getFullYear()}</Text>
              <Pressable onPress={() => handleYearChange(1)} hitSlop={10} style={styles.yearArrowButton}>
                <Ionicons name="caret-forward" size={16} color="#2B2B2B" />
              </Pressable>
            </View>

            <View style={styles.monthWrap}>
              <Pressable onPress={() => setMonthMenuOpen((prev) => !prev)} style={styles.monthButton}>
                <Text style={styles.monthButtonText}>{MONTH_LABELS[currentMonth.getMonth()]}</Text>
                <Ionicons name="chevron-down" size={16} color="#4A4A4A" />
              </Pressable>

              {monthMenuOpen && (
                <View style={styles.monthMenu}>
                  {MONTH_LABELS.map((label, index) => (
                    <Pressable
                      key={label}
                      onPress={() => handleMonthSelect(index)}
                      style={[
                        styles.monthMenuItem,
                        index === currentMonth.getMonth() && styles.monthMenuItemActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.monthMenuText,
                          index === currentMonth.getMonth() && styles.monthMenuTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>

          <View style={styles.weekRow}>
            {weekLabels.map((day) => (
              <Text key={day} style={styles.weekText}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>{calendarCells.map((cell, index) => renderDayCell(cell, index))}</View>

          <View style={styles.dailyChecklistCard}>
            <View style={styles.dailyChecklistHeader}>
              <Pressable
                style={styles.dailyChecklistTitleBlock}
                onPress={() => setDailyChecklistExpanded((prev) => !prev)}
              >
                <Text style={styles.dailyChecklistTitle}>每日清單</Text>
                <Text style={styles.dailyChecklistDate}>{selectedDateKey} 的事項</Text>
              </Pressable>

              <View style={styles.dailyChecklistHeaderActions}>
                <View style={styles.dailyChecklistProgressBadge}>
                  <Text style={styles.dailyChecklistProgressText}>
                    {completedChecklistCount}/{dailyChecklistItems.length}
                  </Text>
                </View>
                <Pressable
                  style={styles.dailyChecklistChevronButton}
                  onPress={() => setDailyChecklistExpanded((prev) => !prev)}
                >
                  <Ionicons
                    name={dailyChecklistExpanded ? "chevron-up" : "chevron-down"}
                    size={22}
                    color="#E86F8D"
                  />
                </Pressable>
              </View>
            </View>

            {dailyChecklistExpanded && (
              <View style={styles.dailyChecklistBody}>
                <View style={styles.dailyChecklistInputRow}>
                  <TextInput
                    style={styles.dailyChecklistInput}
                    value={dailyChecklistInput}
                    onChangeText={setDailyChecklistInput}
                    placeholder="新增每日事項，例如：散步 10 分鐘"
                    placeholderTextColor="#B9A8AE"
                  />
                  <Pressable style={styles.dailyChecklistAddButton} onPress={saveDailyChecklistInput}>
                    <Text style={styles.dailyChecklistAddButtonText}>
                      {editingChecklistItemId ? "儲存" : "新增"}
                    </Text>
                  </Pressable>
                </View>

                {editingChecklistItemId && (
                  <Pressable style={styles.dailyChecklistCancelEditButton} onPress={cancelEditDailyChecklistItem}>
                    <Text style={styles.dailyChecklistCancelEditText}>取消編輯</Text>
                  </Pressable>
                )}

                <View style={styles.dailyChecklistItems}>
                  {sortedDailyChecklistItems.map((item) => (
                    <View key={item.id} style={styles.dailyChecklistItemRow}>
                      <Pressable
                        style={[
                          styles.dailyChecklistStatusButton,
                          item.completed
                            ? styles.dailyChecklistStatusDone
                            : styles.dailyChecklistStatusPending,
                        ]}
                        onPress={() => toggleDailyChecklistItemCompleted(item)}
                      >
                        <Text
                          style={[
                            styles.dailyChecklistStatusText,
                            item.completed
                              ? styles.dailyChecklistStatusDoneText
                              : styles.dailyChecklistStatusPendingText,
                          ]}
                        >
                          {item.completed ? "已完成" : "未完成"}
                        </Text>
                      </Pressable>

                      <Text
                        style={[
                          styles.dailyChecklistItemTitle,
                          item.completed && styles.dailyChecklistItemTitleDone,
                        ]}
                        numberOfLines={2}
                      >
                        {getDailyChecklistItemTitle(item, t, language)}
                      </Text>

                      <Pressable
                        hitSlop={8}
                        style={styles.dailyChecklistIconButton}
                        onPress={() => startEditDailyChecklistItem(item)}
                      >
                        <Feather name="edit-2" size={19} color="#6B7280" />
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        style={styles.dailyChecklistIconButton}
                        onPress={() => confirmDeleteDailyChecklistItem(item)}
                      >
                        <Ionicons name="trash-outline" size={21} color="#D94E64" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {selectedDayEvents.length > 0 && (
            <View style={styles.eventList}>
              {selectedDayEvents.map((event) => {
                const eventTime = getEventTimeParts(event);
                const useLightText = isDarkColor(event.resolvedColor);
                const primaryTextStyle = useLightText ? styles.eventTextLight : styles.eventTextDark;
                const secondaryTextStyle = useLightText ? styles.eventSecondaryTextLight : styles.eventSecondaryTextDark;
                const completedTextStyle = event.resolvedIsCompleted && styles.eventCompletedText;
                const actionIconColor = useLightText ? "#FFFFFF" : "#1F2430";
                const eventPersonName = pickDynamicLocalizedString(
                  event,
                  "name",
                  language,
                  ["name", "personName", "patientName"],
                  event.resolvedPersonName
                );
                const eventTitle = pickDynamicLocalizedString(
                  event,
                  "title",
                  language,
                  ["title", "eventTitle", "event", "description"],
                  event.resolvedTitle
                );
                const eventLocation = pickDynamicLocalizedString(
                  event,
                  "location",
                  language,
                  ["location", "place"],
                  event.resolvedLocation
                );
                const eventDescription = pickDynamicLocalizedString(
                  event,
                  "description",
                  language,
                  ["description"],
                  event.resolvedDescription
                );

                return (
                  <View key={event.id} style={[styles.eventCard, { backgroundColor: event.resolvedColor }]}>
                    <View style={styles.eventCardBody}>
                      <View style={styles.eventTimeBlock}>
                        <Text style={[styles.eventTimeText, primaryTextStyle, completedTextStyle]}>
                          {eventTime.time}
                        </Text>
                        <Text style={[styles.eventPeriodText, secondaryTextStyle, completedTextStyle]}>
                          {eventTime.period}
                        </Text>
                      </View>

                      <View style={styles.eventInfo}>
                        <Text style={[styles.eventPersonText, primaryTextStyle, completedTextStyle]} numberOfLines={2}>
                          {eventPersonName || eventTitle || t.unnamedRecord}
                        </Text>

                        {eventTitle && eventTitle !== eventPersonName && (
                          <Text style={[styles.eventTitleText, primaryTextStyle, completedTextStyle]} numberOfLines={2}>
                            {eventTitle}
                          </Text>
                        )}

                        <View style={styles.eventMetaWrap}>
                          {eventTitle && (
                            <View style={styles.eventMetaPill}>
                              <Text style={[styles.eventMetaText, secondaryTextStyle, completedTextStyle]} numberOfLines={1}>
                                {t.calendarType}: {eventTitle}
                              </Text>
                            </View>
                          )}

                          {eventLocation && (
                            <View style={styles.eventMetaPill}>
                              <Text style={[styles.eventMetaText, secondaryTextStyle, completedTextStyle]} numberOfLines={1}>
                                {t.calendarLocation}: {eventLocation}
                              </Text>
                            </View>
                          )}
                        </View>

                        {eventDescription && (
                          <Text style={[styles.eventDescriptionText, secondaryTextStyle, completedTextStyle]}>
                            {eventDescription}
                          </Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.eventActions}>
                      <Pressable
                        onPress={() => handleToggleEventCompleted(event)}
                        style={[
                          styles.eventStatusButton,
                          event.resolvedIsCompleted ? styles.eventStatusButtonCompleted : styles.eventStatusButtonPending,
                        ]}
                      >
                        <Text
                          style={[
                            styles.eventStatusText,
                            event.resolvedIsCompleted ? styles.eventStatusTextCompleted : styles.eventStatusTextPending,
                          ]}
                        >
                          {event.resolvedIsCompleted ? t.completed : t.pending}
                        </Text>
                      </Pressable>
                      <Pressable hitSlop={8} style={styles.eventActionButton} onPress={() => openEditForm(event)}>
                        <Feather name="edit-2" size={22} color={actionIconColor} />
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        style={styles.eventActionButton}
                        onPress={() => handleDeleteEvent(event.id)}
                      >
                        <Ionicons name="trash-outline" size={24} color={actionIconColor} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>

      <Pressable style={styles.plusButton} onPress={openCreateForm}>
        <Ionicons name="add" size={38} color="#FFF" />
      </Pressable>

      {formOpen && (
        <View style={styles.formOverlay}>
          <View style={styles.formPeekCalendar}>
            <View style={styles.formPeekGridRow}>
              <View style={[styles.formPeekCell, styles.formPeekCellMuted]} />
              <View style={styles.formPeekCell} />
              <View style={styles.formPeekCell} />
              <View style={styles.formPeekCell} />
              <View style={[styles.formPeekCell, styles.formPeekCellSelected]} />
              <View style={styles.formPeekCell} />
            </View>
          </View>

          <View style={styles.formSheet}>
            <View style={styles.formHeader}>
              <Pressable
                onPress={() => {
                  setFormOpen(false);
                  resetForm();
                }}
                hitSlop={12}
                style={styles.formIconButton}
              >
                <Text style={styles.formHeaderIcon}>X</Text>
              </Pressable>
              <Pressable onPress={confirmEvent} hitSlop={12} style={styles.formConfirmButton}>
                <Ionicons name="checkmark" size={34} color="#111" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
              <View style={styles.colorRow}>
                {EVENT_COLORS.map((color) => {
                  const selected = form.color === color;
                  return (
                    <Pressable
                      key={color}
                      onPress={() => setForm((prev) => ({ ...prev, color }))}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: color },
                        selected && styles.colorSwatchSelected,
                      ]}
                    />
                  );
                })}
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{t.name}:</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={form.personName}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, personName: text }))}
                  placeholder=""
                  placeholderTextColor="#B7B7B7"
                />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{t.time}:</Text>
                <View style={styles.timeField}>
                  <WheelColumn
                    values={HOURS}
                    value={formHour}
                    onChange={setFormHour}
                    renderValue={(hour) => String(hour)}
                  />
                  <WheelColumn
                    values={MINUTES}
                    value={formMinute}
                    onChange={setFormMinute}
                    renderValue={(minute) => pad2(minute)}
                  />
                  <WheelColumn
                    values={PERIODS}
                    value={formPeriod}
                    onChange={setFormPeriod}
                    renderValue={(period) => period}
                  />
                </View>
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{t.event}:</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={form.title}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, title: text }))}
                  placeholder=""
                  placeholderTextColor="#B7B7B7"
                />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{t.calendarLocation}:</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={form.location}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, location: text }))}
                  placeholder=""
                  placeholderTextColor="#B7B7B7"
                />
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F2F0",
  },
  header: {
    backgroundColor: "#F67578",
    paddingTop: 58,
    paddingHorizontal: 22,
    paddingBottom: 22,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topBarSpacer: {
    width: 34,
    height: 34,
  },
  contentCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    paddingBottom: 168,
  },
  controlsCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderColor: "#D8D8D8",
    backgroundColor: "#FFF",
  },
  yearRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  yearArrowButton: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  yearText: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "500",
    color: "#111",
  },
  monthWrap: {
    position: "relative",
  },
  monthButton: {
    minWidth: 180,
    height: 28,
    borderWidth: 0.8,
    borderColor: "#D4D4D4",
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FAFAFA",
  },
  monthButtonText: {
    fontSize: 12,
    color: "#4A4A4A",
  },
  monthMenu: {
    position: "absolute",
    top: 34,
    right: 0,
    width: 180,
    backgroundColor: "#FFF",
    borderRadius: 10,
    borderWidth: 0.8,
    borderColor: "#E4E4E4",
    zIndex: 20,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 5,
  },
  monthMenuItem: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  monthMenuItemActive: {
    backgroundColor: "#FFF0F0",
  },
  monthMenuText: {
    fontSize: 13,
    color: "#444",
  },
  monthMenuTextActive: {
    color: "#F67578",
    fontWeight: "700",
  },
  weekRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: "#E5E5E5",
    backgroundColor: "#FFF",
  },
  weekText: {
    width: `${100 / 7}%`,
    paddingVertical: 3,
    textAlign: "left",
    paddingLeft: 4,
    fontSize: 6,
    color: "#8E95A3",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderLeftWidth: 0.5,
    borderTopWidth: 0.5,
    borderColor: "#E5E5E5",
    backgroundColor: "#FFF",
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 88,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#E5E5E5",
    paddingTop: 4,
    paddingHorizontal: 4,
    backgroundColor: "#FFF",
  },
  dayCellMuted: {
    backgroundColor: "#E7E7E7",
  },
  dayCellSelected: {
    backgroundColor: "#F7C7CB",
  },
  dayNumber: {
    fontSize: 10,
    color: "#202020",
  },
  dayNumberMuted: {
    color: "#A8A8A8",
  },
  dayNumberSelected: {
    color: "#111",
  },
  dayMarkers: {
    marginTop: 18,
    gap: 2,
  },
  dayMarker: {
    height: 6,
    borderRadius: 2,
    width: "86%",
  },
  dayMoreText: {
    width: "86%",
    fontSize: 8,
    lineHeight: 10,
    color: "#4B5563",
    fontWeight: "700",
    textAlign: "right",
  },
  dailyChecklistCard: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 4,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FFF8F0",
    borderWidth: 1,
    borderColor: "#F7D7B7",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  dailyChecklistHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dailyChecklistTitleBlock: {
    flex: 1,
  },
  dailyChecklistTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "900",
    color: "#2A2118",
  },
  dailyChecklistDate: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
    color: "#7A6A58",
  },
  dailyChecklistHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dailyChecklistProgressBadge: {
    minWidth: 52,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F67578",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  dailyChecklistProgressText: {
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  dailyChecklistChevronButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFF1E6",
    alignItems: "center",
    justifyContent: "center",
  },
  dailyChecklistBody: {
    marginTop: 14,
  },
  dailyChecklistInputRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  dailyChecklistInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F0D0B0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: "600",
    color: "#2A2118",
  },
  dailyChecklistAddButton: {
    minWidth: 58,
    borderRadius: 12,
    backgroundColor: "#F67578",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  dailyChecklistAddButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  dailyChecklistCancelEditButton: {
    alignSelf: "flex-end",
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dailyChecklistCancelEditText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#8A5A44",
  },
  dailyChecklistItems: {
    gap: 8,
  },
  dailyChecklistItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F2DFCC",
    padding: 10,
  },
  dailyChecklistStatusButton: {
    minWidth: 68,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFF1E6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  dailyChecklistStatusPending: {
    backgroundColor: "#FFF1E6",
  },
  dailyChecklistStatusDone: {
    backgroundColor: "#2E7D32",
  },
  dailyChecklistStatusText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    color: "#8A5A44",
  },
  dailyChecklistStatusPendingText: {
    color: "#8A5A44",
  },
  dailyChecklistStatusDoneText: {
    color: "#FFFFFF",
  },
  dailyChecklistItemTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: "#2A2118",
  },
  dailyChecklistItemTitleDone: {
    color: "#8B8B8B",
    textDecorationLine: "line-through",
  },
  dailyChecklistIconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFF1E6",
    alignItems: "center",
    justifyContent: "center",
  },
  eventList: {
    paddingHorizontal: 26,
    paddingTop: 32,
    gap: 14,
  },
  eventCard: {
    borderRadius: 12,
    padding: 14,
    maxWidth: "100%",
  },
  eventCardBody: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  eventTimeBlock: {
    width: 58,
    flexShrink: 0,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.38)",
    paddingVertical: 8,
    alignItems: "center",
  },
  eventTimeText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
  },
  eventPeriodText: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  eventInfo: {
    flex: 1,
    minWidth: 0,
  },
  eventPersonText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    flexShrink: 1,
  },
  eventTitleText: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    flexShrink: 1,
  },
  eventMetaWrap: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  eventMetaPill: {
    maxWidth: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.42)",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  eventMetaText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
  eventDescriptionText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  eventTextDark: {
    color: "#111",
  },
  eventTextLight: {
    color: "#FFF",
  },
  eventSecondaryTextDark: {
    color: "#2A2118",
  },
  eventSecondaryTextLight: {
    color: "#F8F8F8",
  },
  eventCompletedText: {
    opacity: 0.68,
  },
  eventActions: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 2,
  },
  eventStatusButton: {
    minWidth: 70,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  eventStatusButtonPending: {
    backgroundColor: "rgba(255,255,255,0.66)",
  },
  eventStatusButtonCompleted: {
    backgroundColor: "#2E7D32",
  },
  eventStatusText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
  },
  eventStatusTextPending: {
    color: "#5F4B32",
  },
  eventStatusTextCompleted: {
    color: "#FFF",
  },
  eventActionButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  plusButton: {
    position: "absolute",
    right: 26,
    bottom: 98,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#F8C5C7",
    alignItems: "center",
    justifyContent: "center",
  },
  formOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.08)",
    justifyContent: "flex-start",
  },
  formPeekCalendar: {
    marginTop: 112,
    height: 84,
    backgroundColor: "#FFF",
  },
  formPeekGridRow: {
    flexDirection: "row",
    height: "100%",
  },
  formPeekCell: {
    flex: 1,
    borderRightWidth: 0.5,
    borderTopWidth: 0.5,
    borderColor: "#E5E5E5",
    backgroundColor: "#FFF",
  },
  formPeekCellMuted: {
    backgroundColor: "#E7E7E7",
  },
  formPeekCellSelected: {
    backgroundColor: "#F7C7CB",
  },
  formSheet: {
    flex: 1,
    backgroundColor: "#FFF",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: 8,
    paddingHorizontal: 20,
  },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  formIconButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
  },
  formConfirmButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  formHeaderIcon: {
    fontSize: 28,
    color: "#111",
    fontWeight: "400",
  },
  formContent: {
    paddingBottom: 40,
    gap: 16,
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginBottom: 4,
    paddingLeft: 2,
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2.5,
    borderColor: "transparent",
  },
  colorSwatchSelected: {
    borderColor: "#7A7A7A",
  },
  fieldRow: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 22,
    color: "#111",
    fontWeight: "700",
  },
  fieldInput: {
    height: 34,
    borderRadius: 12,
    backgroundColor: "#DCDDDF",
    paddingHorizontal: 14,
    fontSize: 18,
    color: "#111",
    marginLeft: 74,
    marginTop: -34,
  },
  timeField: {
    minHeight: 170,
    borderRadius: 12,
    backgroundColor: "#FFF",
    marginLeft: 74,
    marginTop: -34,
    flexDirection: "row",
    paddingHorizontal: 6,
  },
  wheelColumn: {
    flex: 1,
    alignItems: "center",
  },
  wheelFrame: {
    width: "100%",
    height: WHEEL_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  wheelList: {
    width: "100%",
    height: WHEEL_HEIGHT,
  },
  wheelSelectedBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 68,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#F2F2F2",
  },
  wheelRow: {
    height: WHEEL_ROW_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  wheelRowText: {
    fontSize: 13,
    color: "#B9B9B9",
  },
  wheelRowTextSelected: {
    fontSize: 17,
    color: "#111",
    fontWeight: "500",
  },
});
