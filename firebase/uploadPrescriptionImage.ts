// firebase/uploadPrescriptionImage.ts
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebaseConfig";

/**
 * 將藥單圖片上傳至 Firebase Storage
 * @param imageUri 本地圖片 URI（expo-image-picker）
 * @param uid Firebase Auth 使用者 uid
 * @returns Firebase Storage download URL
 */
export async function uploadPrescriptionImage(
  imageUri: string,
  uid: string
): Promise<string> {
  // 1️⃣ 將本地圖片 URI 轉成 Blob
  const response = await fetch(imageUri);
  const blob = await response.blob();

  // 2️⃣ Firebase Storage 路徑（老師會看這個結構）
  const filePath = `prescriptions/${uid}/${Date.now()}.jpg`;
  const imageRef = ref(storage, filePath);

  // 3️⃣ 上傳圖片
  await uploadBytes(imageRef, blob);

  // 4️⃣ 取得 download URL
  const downloadURL = await getDownloadURL(imageRef);

  return downloadURL;
}