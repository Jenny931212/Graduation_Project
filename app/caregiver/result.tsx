import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/firebase/firebaseConfig";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { useAuth } from "@/src/auth/useAuth";
import {
  ensureFirestoreTranslations,
  PRESCRIPTION_ITEM_TRANSLATION_SPECS,
} from "@/src/i18n/dynamicTranslation";
import { createMedicationReminders } from "@/src/reminders/createMedicationReminders";
import { translations, type Language } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";

type Item = {
  raw: any;
  name: string;
  dose: string;
  quantity: string;
  time: string[];
  note: string;
};

function toArray(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

function pickItemName(it: any): string {
  return String(it?.drug_name_zh ?? it?.drug_name ?? it?.name ?? "");
}

function pickItemDose(it: any): string {
  return String(it?.dose ?? it?.dosage ?? "");
}

function pickItemTime(it: any): string[] {
  return toArray(it?.usage_zh ?? it?.usage ?? it?.time_of_day ?? it?.time);
}

function pickItemNote(it: any): string {
  return String(it?.note_zh ?? it?.memo ?? it?.note ?? "");
}

function mapItem(it: any): Item {
  return {
    raw: it,
    name: pickItemName(it) || "（未辨識藥品名稱）",
    dose: pickItemDose(it) || "未提供",
    quantity: it.quantity ?? "依醫囑",
    time: pickItemTime(it),
    note: pickItemNote(it),
  };
}

function makePrescriptionId(patientId: string, date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  const timeString = `${y}-${m}-${d}_${hh}-${mm}-${ss}`;
  const shortId = patientId.slice(-4);

  return `${timeString}_pre_${shortId}`;
}

function pickLocalizedString(
  item: Item,
  baseName: "drug_name" | "usage" | "note",
  language: Language,
  fallbackValue: string
) {
  const raw = item.raw ?? {};
  const localized = raw[`${baseName}_${language}`];
  const zh = raw[`${baseName}_zh`];
  const base = raw[baseName];

  if (baseName === "drug_name") {
    return String(localized ?? zh ?? base ?? raw.drug_name_translated ?? fallbackValue);
  }

  if (baseName === "note") {
    return String(localized ?? zh ?? raw.memo ?? base ?? raw.note_translated ?? fallbackValue);
  }

  return String(localized ?? zh ?? base ?? fallbackValue);
}

function getDisplayItem(
  item: Item,
  language: Language,
  t: (typeof translations)[Language]
) {
  return {
    name:
      pickLocalizedString(item, "drug_name", language, item.name) ||
      t.unknownMedicine,
    dose: item.dose || t.dosageNotProvided,
    quantity: item.quantity || t.quantityDefault,
    time: toArray(
      pickLocalizedString(item, "usage", language, item.time.join(", "))
    ),
    note: pickLocalizedString(item, "note", language, item.note),
  };
}

export default function ResultScreen() {
  const { prescriptionId, imageUrl, draftTitle, analyzeResult } =
    useLocalSearchParams<{
      prescriptionId?: string;
      imageUrl?: string;
      draftTitle?: string;
      analyzeResult?: string;
    }>();

  const { activePatientId } = useActiveCareTarget();
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = translations[language];

  const [status, setStatus] = useState<"loading" | "done">("loading");
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);
  const [globalMemo, setGlobalMemo] = useState("");
  const [saving, setSaving] = useState(false);

  const isDraftMode = !prescriptionId && !!analyzeResult;
  const safeImageUrl =
    typeof imageUrl === "string" && imageUrl.length > 0
      ? imageUrl
      : "";
  const safeAnalyze = useMemo(() => {
    try {
      return analyzeResult ? JSON.parse(analyzeResult) : null;
    } catch {
      return null;
    }
  }, [analyzeResult]);

  useEffect(() => {
    if (isDraftMode) {
      const safe = safeAnalyze ?? {};

      const rawMeds =
        safe.medicines ??
        safe.items ??
        safe.result?.medicines ??
        safe.result?.items ??
        safe.data?.medicines ??
        safe.data?.items ??
        safe.payload?.medicines ??
        safe.payload?.items ??
        [];

      const medicines: any[] = Array.isArray(rawMeds)
        ? rawMeds
        : rawMeds && typeof rawMeds === "object"
        ? Object.values(rawMeds)
        : [];

      setImageUri(safeImageUrl);
      setTitle(draftTitle ?? t.cameraDefaultDraftTitle);
      setGlobalMemo(safe.memo ?? "");
      setItems(medicines.map((it) => mapItem(it)));
      setStatus("done");
      return;
    }

    if (!prescriptionId) {
      Alert.alert(t.resultErrorTitle, t.resultMissingId);
      router.replace("/caregiver");
      return;
    }

    (async () => {
      try {
        const ref = doc(db, "prescriptions", prescriptionId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          Alert.alert(t.resultErrorTitle, t.resultNotFound);
          router.replace("/caregiver");
          return;
        }

        const data = snap.data() as any;

        setImageUri(data.sourceImageUrl);
        setTitle(data.title ?? "");
        setGlobalMemo(data.memo ?? "");

        const itemsQ = query(
          collection(db, "prescriptions", prescriptionId, "items"),
          orderBy("__name__", "asc")
        );
        const itemsSnap = await getDocs(itemsQ);

        const translatedItems = await Promise.all(
          itemsSnap.docs.map(async (d) => {
            const raw = d.data() as any;
            const translated = await ensureFirestoreTranslations(
              doc(db, "prescriptions", prescriptionId, "items", d.id),
              raw,
              language,
              PRESCRIPTION_ITEM_TRANSLATION_SPECS
            );
            return { ...raw, ...translated };
          })
        );
        const mapped = translatedItems.map((item) => mapItem(item));
        setItems(mapped);

        setStatus("done");
      } catch (e) {
        console.log("read prescription error:", e);
        Alert.alert(t.resultReadFailedTitle, t.resultReadFailedMessage);
        router.replace("/caregiver");
      }
    })();
  }, [prescriptionId, isDraftMode, safeAnalyze, safeImageUrl, draftTitle, language, t]);

  async function handlePrimaryAction() {
    if (isDraftMode) {
      if (!user) {
        Alert.alert(t.cameraNotLoggedInTitle, t.resultNotLoggedIn);
        return;
      }

      if (!activePatientId) {
        Alert.alert(t.cameraNoPatientTitle, t.resultNoPatient);
        return;
      }

      const finalTitle = title.trim();
      if (!finalTitle) {
        Alert.alert(t.resultTitleRequiredTitle, t.resultTitleRequiredMessage);
        return;
      }

      try {
        setSaving(true);

        const safe = safeAnalyze ?? {};

        const rawMeds =
          safe.medicines ??
          safe.items ??
          safe.result?.medicines ??
          safe.result?.items ??
          safe.data?.medicines ??
          safe.data?.items ??
          safe.payload?.medicines ??
          safe.payload?.items ??
          [];

        const medicines: any[] = Array.isArray(rawMeds)
          ? rawMeds
          : rawMeds && typeof rawMeds === "object"
          ? Object.values(rawMeds)
          : [];

        const prescriptionId = makePrescriptionId(activePatientId);
        const presRef = doc(db, "prescriptions", prescriptionId);

        await setDoc(presRef, {
          createdBy: user.uid,
          patientId: activePatientId,
          sourceImageUrl: safeImageUrl,
          status: "parsed",
          title: finalTitle,
          createdAt: serverTimestamp(),
          clinic_name: safe.clinic_name ?? "",
          visit_date: safe.visit_date ?? "",
          patient_name: safe.patient_name ?? "",
          memo: safe.memo ?? "",
          aiRaw: safe,
        });

        const batch = writeBatch(db);

        for (const it of medicines) {
          const itemRef = doc(collection(db, "prescriptions", presRef.id, "items"));
          const name = pickItemName(it);
          const dose = pickItemDose(it);
          const time = pickItemTime(it).join(",");
          const note = pickItemNote(it);

          batch.set(itemRef, {
            raw: it,
            drug_name_zh: name,
            drug_name: name,
            dose,
            dosage: dose,
            quantity: it.quantity ?? "",
            usage_zh: time,
            memo: note,
            note_zh: note,
            drug_name_translated: "",
            note_translated: "",
          });
        }

        await batch.commit();

        await createMedicationReminders({
          patientId: activePatientId,
          prescriptionId: presRef.id,
          items: medicines.map((it) => ({
            drug_name_zh: pickItemName(it),
            dose: pickItemDose(it),
            time_of_day: pickItemTime(it).join(","),
          })),
        });

        router.replace("/caregiver/list");
      } catch (e) {
        console.log("save prescription error:", e);
        Alert.alert(t.resultSaveFailedTitle, t.resultSaveFailedMessage);
      } finally {
        setSaving(false);
      }

      return;
    }

    router.replace("/caregiver/list");
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 90, gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "900", color: "#333" }}>
        {status === "loading" ? t.resultLoadingTitle : t.resultDoneTitle}
      </Text>

      {imageUri && (
        <Image
          source={{ uri: imageUri }}
          style={{
            width: "100%",
            height: 200,
            borderRadius: 12,
            backgroundColor: "#eee",
          }}
          resizeMode="contain"
        />
      )}

      {status === "loading" ? (
        <View style={{ padding: 40, alignItems: "center" }}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={{ marginTop: 10, opacity: 0.6 }}>
            {t.resultAiLoading}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ fontWeight: "800", fontSize: 16 }}>{t.recordTitle}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              editable={isDraftMode && !saving}
              placeholder={t.recordTitlePlaceholder}
              style={{
                borderWidth: 1,
                borderColor: "#ccc",
                borderRadius: 8,
                padding: 12,
                backgroundColor: "#f5f5f5",
              }}
            />
          </View>

          <Text style={{ fontSize: 18, fontWeight: "800", marginTop: 8 }}>
            {t.medicineDetails}
          </Text>

          {items.map((it, idx) => {
            const displayItem = getDisplayItem(it, language, t);
            const note = displayItem.note || globalMemo;

            return (
              <View
                key={idx}
                style={{
                  padding: 16,
                  borderWidth: 1,
                  borderColor: "#eee",
                  borderRadius: 12,
                  backgroundColor: "#fff",
                  gap: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: "#007AFF",
                  }}
                >
                  {displayItem.name}
                </Text>
                <View style={{ gap: 2 }}>
                  <Text style={{ fontSize: 15, color: "#444" }}>
                    {t.dosage}：{displayItem.dose}
                  </Text>
                  <Text style={{ fontSize: 15, color: "#444" }}>
                    {t.quantity}：{displayItem.quantity}
                  </Text>
                  <Text style={{ fontSize: 15, color: "#444" }}>
                    {t.usageTime}：{displayItem.time.join(", ") || t.dosageNotProvided}
                  </Text>
                  <Text
                    style={{
                      fontSize: 15,
                      color: note ? "#666" : "#CCC",
                      marginTop: 2,
                    }}
                  >
                    {t.note}：{note || t.none}
                  </Text>
                </View>
              </View>
            );
          })}

          <View style={{ marginTop: 20, gap: 12 }}>
            <Pressable
              onPress={handlePrimaryAction}
              style={{
                padding: 18,
                backgroundColor: "#007AFF",
                borderRadius: 12,
                opacity: saving ? 0.6 : 1,
              }}
              disabled={saving}
            >
              <Text
                style={{
                  color: "#fff",
                  textAlign: "center",
                  fontWeight: "800",
                  fontSize: 18,
                }}
              >
                {saving
                  ? t.saving
                  : isDraftMode
                  ? t.saveConfirm
                  : t.backToList}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
