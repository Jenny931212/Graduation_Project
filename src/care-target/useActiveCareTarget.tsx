import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/firebaseConfig";
import { useAuth } from "@/src/auth/useAuth";

export type CareTarget = {
  id: string;
  patientsId?: string;
  name: string;
  notes?: string;
  inviteCode?: string;
  createdAt: number;
  updatedAt?: number;
};

const activeKey = (uid: string) => `careapp_activePatient_v1:${uid}`;

type ActiveCareTargetContextValue = {
  ready: boolean;
  hydrating: boolean;
  activePatientId: string | null;
  activePatient: CareTarget | null;
  linkedCareTargets: CareTarget[];
  setActivePatientId: (id: string) => Promise<void>;
  clearActivePatient: () => Promise<void>;
};

const ActiveCareTargetContext = createContext<ActiveCareTargetContextValue | null>(null);

export function ActiveCareTargetProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();

  const [hydrating, setHydrating] = useState(true);
  const [activePatientId, setActiveId] = useState<string | null>(null);

  const [targets, setTargets] = useState<CareTarget[]>([]);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!ready) return;

    if (!user) {
      setActiveId(null);
      setTargets([]);
      setLinkedIds([]);
      setHydrating(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setHydrating(true);

        const role = user?.role;

        if (!role) {
          console.log("useActiveCareTarget: user.role missing");
          setTargets([]);
          setLinkedIds([]);
          setActiveId(null);
          setHydrating(false);
          return;
        }

        const field = role === "family" ? "families" : "caregivers";

        const [snap, activeRaw] = await Promise.all([
          getDocs(
            query(
              collection(db, "patients"),
              where(field, "array-contains", user.uid)
            )
          ),
          AsyncStorage.getItem(activeKey(user.uid)),
        ]);

        if (cancelled) return;

        const fetchedTargets: CareTarget[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as any;

          let createdAt = Date.now();
          if (data.createdAt?.toMillis) {
            createdAt = data.createdAt.toMillis();
          } else if (typeof data.createdAt === "number") {
            createdAt = data.createdAt;
          }

          let updatedAt = createdAt;
          if (data.updatedAt?.toMillis) {
            updatedAt = data.updatedAt.toMillis();
          } else if (typeof data.updatedAt === "number") {
            updatedAt = data.updatedAt;
          }

          return {
            id: docSnap.id,
            patientsId: data.patientsId ?? "",
            name: data.name ?? "",
            notes: data.notes ?? data.note ?? "",
            inviteCode: data.inviteCode ?? "",
            createdAt,
            updatedAt,
          };
        });

        const ids = fetchedTargets.map((t) => t.id);

        setTargets(fetchedTargets);
        setLinkedIds(ids);

        let nextActiveId =
          typeof activeRaw === "string" && activeRaw.trim() !== ""
            ? activeRaw
            : null;

        if ((!nextActiveId || !ids.includes(nextActiveId)) && ids.length > 0) {
          nextActiveId = ids[0];
          await AsyncStorage.setItem(activeKey(user.uid), nextActiveId);

          try {
            const userSnap = await getDocs(
              query(collection(db, "users"), where("uid", "==", user.uid))
            );

            if (!userSnap.empty) {
              await updateDoc(doc(db, "users", userSnap.docs[0].id), {
                activePatientId: nextActiveId,
              });
            }
          } catch (e) {
            console.log("update activePatientId failed:", e);
          }
        }

        if (ids.length === 0) {
          nextActiveId = null;
          await AsyncStorage.removeItem(activeKey(user.uid));

          try {
            const userSnap = await getDocs(
              query(collection(db, "users"), where("uid", "==", user.uid))
            );

            if (!userSnap.empty) {
              await updateDoc(doc(db, "users", userSnap.docs[0].id), {
                activePatientId: "",
              });
            }
          } catch (e) {
            console.log("clear activePatientId failed:", e);
          }
        }

        if (!cancelled) {
          setActiveId(nextActiveId);
        }
      } catch (err) {
        console.log("useActiveCareTarget load failed:", err);

        if (!cancelled) {
          setTargets([]);
          setLinkedIds([]);
          setActiveId(null);
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, user?.uid, user?.role]);

  const linkedCareTargets = useMemo(() => {
    const setIds = new Set(linkedIds);
    return targets.filter((t) => setIds.has(t.id));
  }, [targets, linkedIds]);

  const activePatient = useMemo(() => {
    if (!activePatientId) return null;
    return targets.find((t) => t.id === activePatientId) ?? null;
  }, [targets, activePatientId]);

  async function setActivePatientId(id: string) {
    if (!user) return;

    const exists = targets.some((t) => t.id === id);
    if (!exists) {
      console.log("setActivePatientId failed: patient not found", id);
      return;
    }

    await AsyncStorage.setItem(activeKey(user.uid), id);
    setActiveId(id);

    try {
      const userSnap = await getDocs(
        query(collection(db, "users"), where("uid", "==", user.uid))
      );

      if (!userSnap.empty) {
        await updateDoc(doc(db, "users", userSnap.docs[0].id), {
          activePatientId: id,
        });
      }
    } catch (e) {
      console.log("set activePatientId failed:", e);
    }
  }

  async function clearActivePatient() {
    if (!user) return;

    await AsyncStorage.removeItem(activeKey(user.uid));
    setActiveId(null);

    try {
      const userSnap = await getDocs(
        query(collection(db, "users"), where("uid", "==", user.uid))
      );

      if (!userSnap.empty) {
        await updateDoc(doc(db, "users", userSnap.docs[0].id), {
          activePatientId: "",
        });
      }
    } catch (e) {
      console.log("clear activePatientId failed:", e);
    }
  }

  const value = useMemo<ActiveCareTargetContextValue>(() => ({
    ready: !hydrating,
    hydrating,
    activePatientId,
    activePatient,
    linkedCareTargets,
    setActivePatientId,
    clearActivePatient,
  }), [hydrating, activePatientId, activePatient, linkedCareTargets]);

  return (
    <ActiveCareTargetContext.Provider value={value}>
      {children}
    </ActiveCareTargetContext.Provider>
  );
}

export function useActiveCareTarget() {
  const value = useContext(ActiveCareTargetContext);
  if (!value) {
    throw new Error("useActiveCareTarget must be used within ActiveCareTargetProvider");
  }
  return value;
}
