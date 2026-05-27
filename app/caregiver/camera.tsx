import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  StatusBar,
  InteractionManager,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";

import { uploadPrescriptionImage } from "@/firebase/uploadPrescriptionImage";
import { useAuth } from "@/src/auth/useAuth";
import { analyzePrescriptionByUrl } from "@/src/api/analyzePrescription";
import { useActiveCareTarget } from "@/src/care-target/useActiveCareTarget";
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";

export default function CameraScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [qrMode, setQrMode] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [refreshKey, setRefreshKey] = useState(0);

  const { user } = useAuth();
  const { activePatientId } = useActiveCareTarget();
  const { language } = useLanguage();
  const t = translations[language];

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t.cameraAlbumPermissionTitle, t.cameraAlbumPermissionMessage);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: true,
    });

    if (result.canceled) return;
    setImageUri(result.assets?.[0]?.uri ?? null);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t.cameraPermissionTitle, t.cameraPermissionMessage);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
      allowsEditing: true,
    });

    if (result.canceled) return;
    setImageUri(result.assets?.[0]?.uri ?? null);
  }

  async function openQrScanner() {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();

      if (!result.granted) {
        Alert.alert(t.cameraPermissionTitle, t.cameraQrPermissionMessage);
        return;
      }
    }

    setScanned(false);
    setQrMode(true);
  }

  async function handleQrScanned(result: { data: string }) {
    if (scanned) return;

    setScanned(true);

    const url = result.data.trim();

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setQrMode(false);
      Alert.alert(t.cameraInvalidQrTitle, t.cameraInvalidQrMessage);
      return;
    }

    // 先讓 CameraView 卸載
    setQrMode(false);

    setRefreshKey(prev => prev + 1);

    InteractionManager.runAfterInteractions(() => {
      setTimeout(async () => {
        try {
          await Linking.openURL(url);
        } catch (e) {
          Alert.alert(t.cameraOpenFailed);
        }
      }, 300);
    });
  }

  async function goNext() {
    if (isAnalyzing) {
      return;
    }

    if (!imageUri) {
      Alert.alert(t.cameraNoPhotoTitle, t.cameraNoPhotoMessage);
      return;
    }

    if (!user) {
      Alert.alert(t.cameraNotLoggedInTitle, t.cameraNotLoggedInMessage);
      return;
    }

    if (!activePatientId) {
      Alert.alert(t.cameraNoPatientTitle, t.cameraNoPatientMessage);
      return;
    }

    setIsAnalyzing(true);

    try {
      console.log("[1] uploading image...");
      console.log("[1] auth user.uid =", user.uid);
      console.log("[1] activePatientId =", activePatientId);
      console.log("[1] local imageUri =", imageUri);

      const downloadURL = await uploadPrescriptionImage(imageUri, user.uid);
      console.log("[1] downloadURL:", downloadURL);

      console.log("[2] analyzing prescription...");
      const analyzeResult = await analyzePrescriptionByUrl(downloadURL);
      console.log("[2] analyzeResult:", analyzeResult);

      const safe = JSON.parse(JSON.stringify(analyzeResult ?? {}));
      const draftTitle = safe.clinic_name ?? t.cameraDefaultDraftTitle;

      console.log("[3] navigate to result draft...");
      console.log("[3] draftTitle =", draftTitle);

      router.replace({
        pathname: "/caregiver/result",
        params: {
          imageUrl: encodeURIComponent(downloadURL),
          draftTitle,
          analyzeResult: JSON.stringify(safe),
        },
      });
    } catch (e: any) {
      console.log("❌ ERROR:", e);
      console.log("❌ MESSAGE:", e?.message);

      const msg = String(e?.message ?? e ?? "");

      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
        Alert.alert(
          t.cameraAiLimitTitle,
          t.cameraAiLimitMessage
        );
        return;
      }

      Alert.alert(t.cameraProcessFailed, msg || t.cameraUnknownError);
    } finally {
      setIsAnalyzing(false);
    }
  }

  if (qrMode) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

       <CameraView
        style={{ flex: 1 }}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleQrScanned}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        />

        <View style={styles.qrOverlay}>
          <Text style={styles.qrTitle}>{t.cameraQrTitle}</Text>
          <Text style={styles.qrHint}>{t.cameraQrHint}</Text>
        </View>

        <Pressable onPress={() => setQrMode(false)} style={styles.cancelQrBtn}>
          <Text style={styles.cancelQrText}>{t.cameraCancelScan}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView key={refreshKey} contentContainerStyle={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4E770" />
      <View style={styles.header}>
        <Text style={styles.title}>{t.cameraTitle}</Text>
        <Text style={styles.subtitle}>
          {t.cameraSubtitle}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={takePhoto} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{t.cameraTakePhoto}</Text>
        </Pressable>

        <Pressable onPress={pickImage} style={styles.outlineBtn}>
          <Text style={styles.outlineBtnText}>{t.cameraPickImage}</Text>
        </Pressable>

        <Pressable onPress={openQrScanner} style={styles.qrBtn}>
          <Text style={styles.qrBtnText}>{t.cameraScanQr}</Text>
        </Pressable>
      </View>

      {imageUri ? (
        <View style={styles.previewWrap}>
          <View style={styles.previewCard}>
            <Image
              source={{ uri: imageUri }}
              style={styles.previewImg}
              resizeMode="contain"
            />
          </View>

          <Pressable
            onPress={goNext}
            disabled={isAnalyzing}
            style={[styles.successBtn, isAnalyzing && styles.successBtnDisabled]}
          >
            {isAnalyzing ? (
              <ActivityIndicator color="#fff" style={styles.successBtnSpinner} />
            ) : null}
            <Text style={styles.successBtnText}>
              {isAnalyzing ? t.cameraAnalyzing : t.cameraStartAnalyze}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t.cameraNoImage}</Text>
        </View>
      )}

      <Pressable
        onPress={() => router.replace("/caregiver")}
        style={styles.back}
      >
        <Text style={styles.backText}>{t.cameraCancelBack}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 90, paddingBottom: 40 },

  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: "900", color: "#333" },
  subtitle: { marginTop: 6, fontSize: 16, color: "#666" },

  actions: { marginBottom: 20 },

  primaryBtn: {
    paddingVertical: 18,
    backgroundColor: "#007AFF",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  primaryBtnText: { fontSize: 18, fontWeight: "900", color: "#fff" },

  outlineBtn: {
    paddingVertical: 18,
    borderWidth: 2,
    borderColor: "#007AFF",
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  outlineBtnText: { fontSize: 18, fontWeight: "900", color: "#007AFF" },

  qrBtn: {
    paddingVertical: 18,
    backgroundColor: "#333",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  qrBtnText: { fontSize: 18, fontWeight: "900", color: "#fff" },

  previewWrap: { marginTop: 10 },
  previewCard: {
    padding: 8,
    backgroundColor: "#F2F2F7",
    borderRadius: 16,
    marginBottom: 16,
  },
  previewImg: { width: "100%", height: 380, borderRadius: 12 },

  successBtn: {
    paddingVertical: 18,
    backgroundColor: "#34C759",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  successBtnDisabled: { opacity: 0.7 },
  successBtnSpinner: { marginRight: 8 },
  successBtnText: { fontSize: 18, fontWeight: "900", color: "#fff" },

  emptyBox: {
    paddingVertical: 60,
    paddingHorizontal: 20,
    borderStyle: "dashed",
    borderWidth: 2,
    borderColor: "#DDD",
    borderRadius: 16,
    alignItems: "center",
  },
  emptyText: { color: "#AAA", fontWeight: "700" },

  back: { marginTop: 16 },
  backText: {
    color: "#666",
    textAlign: "center",
    fontWeight: "700",
    fontSize: 16,
  },

  qrContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  qrCamera: {
    flex: 1,
  },
  qrOverlay: {
    position: "absolute",
    top: 80,
    left: 24,
    right: 24,
    alignItems: "center",
  },
  qrTitle: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
  },
  qrHint: {
    color: "#fff",
    fontSize: 16,
    marginTop: 8,
    opacity: 0.8,
  },
  cancelQrBtn: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 50,
    backgroundColor: "#fff",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  cancelQrText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#333",
  },
});
