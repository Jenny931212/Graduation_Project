import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/src/auth/useAuth";

export type CareTarget = {
  id: string;
  name: string;
  note?: string;
  inviteCode?: string;
  createdAt: number;
  updatedAt?: number;
};

// 跟你 select.tsx 一致（不要改 key，改了就讀不到）
const KEY_CARE_TARGETS = "careapp_careTargets_v1"; // CareTarget[]
const KEY_LINKS = "careapp_careTarget_links_v1"; // { [uid]: string[] }
const activeKey = (uid: string) => `careapp_activeCareTarget_v1:${uid}`;

async function loadCareTargets(): Promise<CareTarget[]> {
  const raw = await AsyncStorage.getItem(KEY_CARE_TARGETS);
  return raw ? (JSON.parse(raw) as CareTarget[]) : [];
}

async function loadLinks(): Promise<Record<string, string[]>> {
  const raw = await AsyncStorage.getItem(KEY_LINKS);
  return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
}

export function useActiveCareTarget() {
  const { user, ready } = useAuth();

  const [hydrating, setHydrating] = useState(true);
  const [activeCareTargetId, setActiveId] = useState<string | null>(null);

  const [targets, setTargets] = useState<CareTarget[]>([]);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);

  // 讀資料：targets / links / active
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

        const [allTargets, linksMap, activeRaw] = await Promise.all([
          loadCareTargets(),
          loadLinks(),
          AsyncStorage.getItem(activeKey(user.uid)),
        ]);

        if (cancelled) return;

        const ids = linksMap[user.uid] ?? [];
        setTargets(allTargets);
        setLinkedIds(ids);

        // 目前 active
        let activeId = activeRaw || null;

        // ✅ 自動修復：如果 active 缺失，但有連結的長輩，直接指定第一個（避免卡住）
        if (!activeId && ids.length > 0) {
          activeId = ids[0];
          await AsyncStorage.setItem(activeKey(user.uid), activeId);
        }

        setActiveId(activeId);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, user?.uid]);

  const linkedCareTargets = useMemo(() => {
    const setIds = new Set(linkedIds);
    return targets.filter((t) => setIds.has(t.id));
  }, [targets, linkedIds]);

  const activeCareTarget = useMemo(() => {
    if (!activeCareTargetId) return null;
    return targets.find((t) => t.id === activeCareTargetId) ?? null;
  }, [targets, activeCareTargetId]);

  async function setActiveCareTargetId(id: string) {
    if (!user) return;
    await AsyncStorage.setItem(activeKey(user.uid), id);
    setActiveId(id);
  }

  async function clearActiveCareTarget() {
    if (!user) return;
    await AsyncStorage.removeItem(activeKey(user.uid));
    setActiveId(null);
  }

  return {
    ready: !hydrating, // 給 UI 判斷：可不可以判定是否已選
    hydrating,
    activeCareTargetId,
    activeCareTarget,
    linkedCareTargets,
    setActiveCareTargetId,
    clearActiveCareTarget,
  };
}
