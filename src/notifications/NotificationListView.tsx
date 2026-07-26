import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { router } from "expo-router";

import { db } from "@/firebase/firebaseConfig";
import { useAuth } from "@/src/auth/useAuth";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { translations } from "@/src/i18n/translations";
import { getNotificationText } from "@/src/notifications/notificationText";
import {
  NOTIFICATIONS_COLLECTION,
  type NotificationDocument,
} from "@/src/notifications/notificationSchema";
import { useLanguage } from "@/src/store/LanguageContext";
import {
  CATEGORY_EMPTY_KEY,
  CATEGORY_LABEL_KEY,
  NOTIFICATION_CATEGORY_IDS,
  getNotificationCategory,
  getNotificationVisual,
  type NotificationCategoryId,
} from "@/src/notifications/notificationCategories";
import {
  formatDateGroupLabel,
  formatNotificationDateTime,
  getDateGroupKey,
} from "@/src/notifications/formatNotificationDateTime";

type NotificationRow = NotificationDocument & Record<string, any> & { id: string };

type Props = {
  detailRoute: string;
};

export function NotificationListView({ detailRoute }: Props) {
  const { user: currentUser } = useAuth();
  const { language } = useLanguage();
  const t = translations[language];
  const { linkedCareTargets } = useActiveCareTarget();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [category, setCategory] = useState<NotificationCategoryId>("all");
  const [patientFilter, setPatientFilter] = useState<string>("all");

  const patientNameById = useMemo(
    () => new Map(linkedCareTargets.map((patient) => [patient.id, patient.name])),
    [linkedCareTargets]
  );

  useEffect(() => {
    if (!currentUser?.uid) {
      setNotifications([]);
      return;
    }

    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where("recipientUid", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotifications(
          snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as NotificationDocument),
          })) as NotificationRow[]
        );
      },
      (error) => {
        console.log("notifications snapshot failed:", error);
        setNotifications([]);
      }
    );

    return () => unsub();
  }, [currentUser?.uid]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => item.isRead !== true).length,
    [notifications]
  );

  const filtered = useMemo(() => {
    return notifications.filter((item) => {
      const matchesCategory = category === "all" || getNotificationCategory(item.type) === category;
      const matchesPatient = patientFilter === "all" || item.patientId === patientFilter;
      return matchesCategory && matchesPatient;
    });
  }, [notifications, category, patientFilter]);

  const sections = useMemo(() => {
    const groups = new Map<string, NotificationRow[]>();
    const order: string[] = [];

    filtered.forEach((item) => {
      const key = getDateGroupKey(item.createdAt);
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(item);
    });

    return order.map((key) => ({
      key,
      title: formatDateGroupLabel(key, t, language),
      data: groups.get(key) || [],
    }));
  }, [filtered, t, language]);

  const handlePress = async (item: NotificationRow) => {
    try {
      await updateDoc(doc(db, NOTIFICATIONS_COLLECTION, item.id), {
        isRead: true,
      });
    } catch (error) {
      console.log("notification mark-as-read failed:", error);
    }

    router.push({
      pathname: detailRoute,
      params: { id: item.id },
    } as any);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.notification}</Text>
        {unreadCount > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={styles.chipsWrap}
      >
        {NOTIFICATION_CATEGORY_IDS.map((id) => {
          const active = id === category;
          return (
            <Pressable
              key={id}
              style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
              onPress={() => setCategory(id)}
            >
              <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
                {t[CATEGORY_LABEL_KEY[id]]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {linkedCareTargets.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={styles.patientChipsWrap}
        >
          <Pressable
            style={[styles.chip, patientFilter === "all" ? styles.chipActive : styles.chipInactive]}
            onPress={() => setPatientFilter("all")}
          >
            <Text
              style={[
                styles.chipText,
                patientFilter === "all" ? styles.chipTextActive : styles.chipTextInactive,
              ]}
            >
              {t.notificationFilterAllPatients}
            </Text>
          </Pressable>
          {linkedCareTargets.map((patient) => {
            const active = patient.id === patientFilter;
            return (
              <Pressable
                key={patient.id}
                style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                onPress={() => setPatientFilter(patient.id)}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
                  {patient.name || t.unknown}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <SectionList
        style={styles.listFlex}
        sections={sections}
        keyExtractor={(item, index) => item.id || `${item.title}-${index}`}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>🗒️</Text>
            <Text style={styles.emptyText}>{t[CATEGORY_EMPTY_KEY[category]]}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isUnread = item.isRead !== true;
          const { title, body } = getNotificationText(item, t);
          const visual = getNotificationVisual(item);
          const timeText = formatNotificationDateTime(item.createdAt, t, language);
          const patientName =
            linkedCareTargets.length > 1 ? patientNameById.get(item.patientId ?? "") : undefined;

          return (
            <Pressable
              style={[styles.card, isUnread ? styles.cardUnread : styles.cardRead]}
              onPress={() => handlePress(item)}
            >
              {isUnread ? <View style={styles.unreadDot} /> : null}

              <View style={[styles.avatar, { backgroundColor: visual.tintSoft }]}>
                <Text style={styles.avatarIcon}>{visual.icon}</Text>
              </View>

              <View style={styles.body}>
                <View style={styles.topLine}>
                  <Text
                    style={[styles.title, isUnread ? styles.unreadTitle : styles.readTitle]}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                  <Text style={styles.time}>{timeText}</Text>
                </View>

                <Text style={styles.content} numberOfLines={2}>
                  {body}
                </Text>

                <View style={styles.tagRow}>
                  <View style={[styles.tag, { backgroundColor: visual.tintSoft }]}>
                    <Text style={[styles.tagText, { color: visual.tint }]}>
                      {t[CATEGORY_LABEL_KEY[visual.category]]}
                    </Text>
                  </View>
                  {visual.level ? (
                    <View style={[styles.tag, { backgroundColor: visual.tintSoft }]}>
                      <Text style={[styles.tagText, { color: visual.tint }]}>
                        {visual.level === "critical"
                          ? t.notificationLevelCritical
                          : t.notificationLevelWarning}
                      </Text>
                    </View>
                  ) : null}
                  {patientName ? (
                    <View style={[styles.tag, styles.patientTag]}>
                      <Text style={[styles.tagText, styles.patientTagText]}>{patientName}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFAFA",
  },
  header: {
    minHeight: 112,
    flexShrink: 0,
    flexGrow: 0,
    backgroundColor: "#D9D4F3",
    paddingTop: 54,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  chipsWrap: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "#FAFAFA",
    borderBottomWidth: 1,
    borderBottomColor: "#EEEAFB",
  },
  patientChipsWrap: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "#FAFAFA",
    borderBottomWidth: 1,
    borderBottomColor: "#EEEAFB",
  },
  chipsRow: {
    flexGrow: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  listFlex: {
    flex: 1,
  },
  chip: {
    flexShrink: 0,
    flexGrow: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: "#4F59D5",
    borderColor: "#4F59D5",
  },
  chipInactive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  chipTextInactive: {
    color: "#4B5563",
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    flexGrow: 1,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9CA3AF",
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    position: "relative",
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  cardUnread: {
    borderWidth: 1,
    borderColor: "#E4DEFB",
  },
  cardRead: {
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  unreadDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarIcon: {
    fontSize: 20,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  topLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
  },
  unreadTitle: {
    fontWeight: "700",
    color: "#111827",
  },
  readTitle: {
    fontWeight: "600",
    color: "#6B7280",
  },
  time: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  content: {
    fontSize: 14,
    lineHeight: 20,
    color: "#4B5563",
  },
  tagRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "700",
  },
  patientTag: {
    backgroundColor: "#F3F4F6",
  },
  patientTagText: {
    color: "#6B7280",
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyText: {
    fontSize: 15,
    color: "#9CA3AF",
  },
});
