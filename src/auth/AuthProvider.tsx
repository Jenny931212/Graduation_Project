import { auth } from "@/firebase/firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * ✅ AuthProvider（混合版）
 * - 帳號：Firebase Auth（register/login/logout）
 * - 本地 AsyncStorage：保留 role / careTargets / linkedCareTargetIds / activeCareTargetId（暫存/快取用）
 *
 * ⚠️ 未來要完全雲端化：
 * - careTargets / 連結關係 會搬到 Firestore
 * - AsyncStorage 只保留少量快取（或不留）
 */

export type Role = "caregiver" | "family";
export type CareTargetId = string;

export type CareTarget = {
  id: CareTargetId;
  name: string;
  createdAt: number;
  inviteCode: string; // 用於家屬/看護輸入連結
};

export type AuthUser = {
  uid: string; // ✅ Firebase uid
  email: string;
  role: Role;

  /** 這個帳號「已連結」的長輩清單 */
  linkedCareTargetIds: CareTargetId[];

  /** 目前正在看的長輩（登入後要先選定這個） */
  activeCareTargetId: CareTargetId | null;
};

type AuthValue = {
  ready: boolean;
  user: AuthUser | null;

  // ---- 基本帳號 ----
  register: (email: string, password: string, role: Role) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;

  // ---- 長輩 / 邀請碼 ----
  getMyCareTargets: () => Promise<CareTarget[]>;
  getActiveCareTarget: () => Promise<CareTarget | null>;
  setActiveCareTarget: (careTargetId: CareTargetId) => Promise<void>;

  createCareTarget: (name: string) => Promise<CareTarget>; // 新增長輩並自動連結
  linkByInviteCode: (inviteCode: string) => Promise<CareTarget>; // 輸入邀請碼連結
};

const AuthContext = createContext<AuthValue | null>(null);

// -------------------
// AsyncStorage keys
// -------------------
const KEY_USERS = "careapp_users_v2";
const KEY_SESSION = "careapp_session_v2";
const KEY_CARETARGETS = "careapp_care_targets_v1";

type StoredUser = AuthUser & { password: string };

function nowId(prefix: string) {
  return `${prefix}_${Date.now()}`;
}

function makeInviteCode() {
  // 簡單好輸入：6 碼大寫英數
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function migrateUser(u: any): AuthUser {
  const legacyCareTargetId = u?.careTargetId;
  const linked: CareTargetId[] =
    Array.isArray(u?.linkedCareTargetIds)
      ? u.linkedCareTargetIds
      : legacyCareTargetId
      ? [legacyCareTargetId]
      : [];

  const active: CareTargetId | null =
    typeof u?.activeCareTargetId === "string"
      ? u.activeCareTargetId
      : legacyCareTargetId
      ? legacyCareTargetId
      : null;

  return {
    uid: String(u?.uid ?? nowId("uid")),
    email: String(u?.email ?? ""),
    role: (u?.role as Role) ?? "family",
    linkedCareTargetIds: linked,
    activeCareTargetId: active,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  // -------------------
  // Startup: load session (Firebase Auth state)
  // -------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setReady(true);
        return;
      }

      // 🔑 Firebase uid → 對應你原本的 AuthUser（本地資料）
      const users = await AsyncStorage.getItem(KEY_USERS);
      const list: StoredUser[] = users ? JSON.parse(users) : [];

      const found = list.find((u) => u.uid === fbUser.uid || u.email === fbUser.email);

      if (found) {
        const { password: _pw, ...sessionUser } = found;
        setUser(sessionUser);
      } else {
        // Firebase 有帳，但本地還沒資料（第一次登入）
        const newUser: StoredUser = {
          uid: fbUser.uid,
          email: fbUser.email ?? "",
          password: "", // Firebase 管理密碼
          role: "family",
          linkedCareTargetIds: [],
          activeCareTargetId: null,
        };

        await AsyncStorage.setItem(KEY_USERS, JSON.stringify([newUser, ...list]));
        const { password: _pw, ...sessionUser } = newUser;
        setUser(sessionUser);
      }

      setReady(true);
    });

    return unsub;
  }, []);

  // -------------------
  // Persist: session changes
  // -------------------
  useEffect(() => {
    if (!ready) return;
    (async () => {
      if (user) await AsyncStorage.setItem(KEY_SESSION, JSON.stringify(user));
      else await AsyncStorage.removeItem(KEY_SESSION);
    })();
  }, [user, ready]);

  const value = useMemo<AuthValue>(() => {
    // ---------- helpers ----------
    async function loadUsers(): Promise<StoredUser[]> {
      const raw = await AsyncStorage.getItem(KEY_USERS);
      const list = raw ? (JSON.parse(raw) as any[]) : [];
      return list.map((u) => {
        const migrated = migrateUser(u);
        return { ...migrated, password: String(u?.password ?? "") };
      });
    }

    async function saveUsers(users: StoredUser[]) {
      await AsyncStorage.setItem(KEY_USERS, JSON.stringify(users));
    }

    async function loadCareTargets(): Promise<CareTarget[]> {
      const raw = await AsyncStorage.getItem(KEY_CARETARGETS);
      return raw ? (JSON.parse(raw) as CareTarget[]) : [];
    }

    async function saveCareTargets(list: CareTarget[]) {
      await AsyncStorage.setItem(KEY_CARETARGETS, JSON.stringify(list));
    }

    function requireLogin() {
      if (!user) throw new Error("請先登入");
      return user;
    }

    // ---------- auth ----------
    async function register(email: string, password: string, role: Role) {
      email = email.trim().toLowerCase();
      if (!email || !password) throw new Error("Email / 密碼不可為空");
      if (password.length < 6) throw new Error("密碼至少 6 碼（先用最簡版規則）");

      // ✅ 1) 真的建立 Firebase Auth 帳號（這步完成後，就不會再出現「Authentication 沒帳號」）
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = cred.user;

      // ✅ 2) 在本地保存 role / linkedCareTargetIds / activeCareTargetId（快取用）
      const users = await loadUsers();

      // 若已存在同 email 或同 uid，更新它（避免重複）
      const idx = users.findIndex((u) => u.uid === fbUser.uid || u.email === email);

      const base: StoredUser = {
        uid: fbUser.uid,
        email,
        password: "", // Firebase 管理密碼
        role,
        linkedCareTargetIds: idx >= 0 ? users[idx].linkedCareTargetIds : [],
        activeCareTargetId: idx >= 0 ? users[idx].activeCareTargetId : null,
      };

      let nextUsers: StoredUser[];
      if (idx >= 0) {
        nextUsers = [...users];
        nextUsers[idx] = { ...nextUsers[idx], ...base };
      } else {
        nextUsers = [base, ...users];
      }

      await saveUsers(nextUsers);

      // ✅ 3) 立刻更新 UI 狀態（onAuthStateChanged 也會再同步一次）
      const { password: _pw, ...sessionUser } = base;
      setUser(sessionUser);
    }

    async function login(email: string, password: string) {
      email = email.trim().toLowerCase();
      await signInWithEmailAndPassword(auth, email, password);
      // user 由 onAuthStateChanged 接手
    }

    async function logout() {
      await signOut(auth);
      setUser(null);
    }

    // ---------- care targets ----------
    async function getMyCareTargets(): Promise<CareTarget[]> {
      const u = requireLogin();
      const all = await loadCareTargets();
      return all.filter((ct) => u.linkedCareTargetIds.includes(ct.id));
    }

    async function getActiveCareTarget(): Promise<CareTarget | null> {
      const u = requireLogin();
      if (!u.activeCareTargetId) return null;
      const all = await loadCareTargets();
      return all.find((ct) => ct.id === u.activeCareTargetId) ?? null;
    }

    async function setActiveCareTarget(careTargetId: CareTargetId) {
      const u = requireLogin();
      if (!u.linkedCareTargetIds.includes(careTargetId)) {
        throw new Error("你沒有連結到此長輩，不能切換");
      }
      setUser({ ...u, activeCareTargetId: careTargetId });
    }

    async function createCareTarget(name: string): Promise<CareTarget> {
      const u = requireLogin();
      name = name.trim();
      if (!name) throw new Error("長輩名稱不可為空");

      const all = await loadCareTargets();

      let invite = makeInviteCode();
      for (let i = 0; i < 20; i++) {
        if (!all.some((x) => x.inviteCode === invite)) break;
        invite = makeInviteCode();
      }

      const ct: CareTarget = {
        id: nowId("ct"),
        name,
        createdAt: Date.now(),
        inviteCode: invite,
      };

      await saveCareTargets([ct, ...all]);

      const linked = u.linkedCareTargetIds.includes(ct.id)
        ? u.linkedCareTargetIds
        : [ct.id, ...u.linkedCareTargetIds];

      setUser({ ...u, linkedCareTargetIds: linked, activeCareTargetId: ct.id });

      const users = await loadUsers();
      const idx = users.findIndex((x) => x.uid === u.uid);
      if (idx >= 0) {
        const updated: StoredUser = { ...users[idx], linkedCareTargetIds: linked, activeCareTargetId: ct.id };
        const next = [...users];
        next[idx] = updated;
        await saveUsers(next);
      }

      return ct;
    }

    async function linkByInviteCode(inviteCode: string): Promise<CareTarget> {
      const u = requireLogin();
      inviteCode = inviteCode.trim().toUpperCase();
      if (!inviteCode) throw new Error("邀請碼不可為空");

      const all = await loadCareTargets();
      const ct = all.find((x) => x.inviteCode === inviteCode);
      if (!ct) throw new Error("找不到此邀請碼對應的長輩");

      const linked = u.linkedCareTargetIds.includes(ct.id)
        ? u.linkedCareTargetIds
        : [ct.id, ...u.linkedCareTargetIds];

      const active = u.activeCareTargetId ?? ct.id; // 如果本來沒選定，就直接選這個

      setUser({ ...u, linkedCareTargetIds: linked, activeCareTargetId: active });

      const users = await loadUsers();
      const idx = users.findIndex((x) => x.uid === u.uid);
      if (idx >= 0) {
        const updated: StoredUser = { ...users[idx], linkedCareTargetIds: linked, activeCareTargetId: active };
        const next = [...users];
        next[idx] = updated;
        await saveUsers(next);
      }

      return ct;
    }

    return {
      ready,
      user,

      register,
      login,
      logout,

      getMyCareTargets,
      getActiveCareTarget,
      setActiveCareTarget,

      createCareTarget,
      linkByInviteCode,
    };
  }, [ready, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}