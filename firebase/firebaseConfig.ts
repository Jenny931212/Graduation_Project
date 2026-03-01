// firebase/firebaseConfig.ts
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";



const firebaseConfig = {
  apiKey: "AIzaSyD_b1MdgnUrwLf8mnii8JCzTOv8DatD_tQ",
  authDomain: "smart-care-system-1a41e.firebaseapp.com",
  projectId: "smart-care-system-1a41e",
  storageBucket: "smart-care-system-1a41e.firebasestorage.app",
  messagingSenderId: "531785115214",
  appId: "1:531785115214:web:d7add711b42e2c16b4851f",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

//  Firebase Auth（通用穩定版）
export const auth = getAuth(app);

//  Firebase Storage
export const storage = getStorage(app);
export const db = getFirestore(app);

export default app;