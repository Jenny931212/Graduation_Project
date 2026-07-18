// app/family/_layout.tsx
import { auth } from "@/firebase/firebaseConfig";
import { translations } from "@/src/i18n/translations";
import { useLanguage } from "@/src/store/LanguageContext";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useSegments } from "expo-router";
import { signOut } from "firebase/auth";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Animated, Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.55;

export default function FamilyLayout() {
  const segments = useSegments() as string[];
  const currentPage = segments[segments.length - 1];
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLanguage();
  const t = translations[language];

  const hideBottomNavRoutes = [
    "chat-room",
    "detail",
    "edit",
    "dashboard",
    "list",
    "condition",
    "voice",
    "handbook",
    "notification-detail",
  ];
  const hideBottomNav = hideBottomNavRoutes.includes(currentPage);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isSidebarOpen ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isSidebarOpen, slideAnim]);

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [DRAWER_WIDTH, 0],
  });

  const overlayOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const handleLogout = () => {
    Alert.alert(t.logout, t.logoutMessage, [
      { text: t.cancel, style: "cancel" },
      {
        text: t.logoutConfirm,
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
            setIsSidebarOpen(false);
            router.replace("/");
          } catch (error) {
            console.log("登出失敗:", error);
            Alert.alert(t.resultErrorTitle, t.logoutFailed);
          }
        },
      },
    ]);
  };

  const changeLanguage = (nextLanguage: "zh" | "en" | "vi" | "id") => {
    setLanguage(nextLanguage);
    setIsSidebarOpen(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
      </View>

      {!hideBottomNav && (
        <Pressable
          style={[styles.hamburgerBtn, { top: insets.top + 10 }]}
          onPress={() => setIsSidebarOpen(true)}
        >
          <Ionicons name="menu" size={40} color="black" />
        </Pressable>
      )}

      {!hideBottomNav && (
        <View style={styles.bottomNav}>
          <Pressable onPress={() => router.navigate("/family" as any)}>
            <Text style={styles.navIcon}>🏠</Text>
          </Pressable>

          <Pressable onPress={() => router.push("/family/calendar" as any)}>
            <Text style={styles.navIcon}>📅</Text>
          </Pressable>

          <Pressable onPress={() => router.push("/family/notifications" as any)}>
            <Text style={styles.navIcon}>🔔</Text>
          </Pressable>

          <Pressable onPress={() => router.push("/family/chat-list" as any)}>
            <Text style={styles.navIcon}>💬</Text>
          </Pressable>
        </View>
      )}

      <Animated.View
        pointerEvents={isSidebarOpen ? "auto" : "none"}
        style={[StyleSheet.absoluteFillObject, styles.overlay, { opacity: overlayOpacity }]}
      >
        <Pressable style={{ flex: 1 }} onPress={() => setIsSidebarOpen(false)} />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [{ translateX }],
            paddingTop: insets.top + 40,
          },
        ]}
      >
        <View style={styles.badgeContainer}>
          <View style={[styles.badge, { backgroundColor: "#F5A623" }]}>
            <Text style={styles.badgeText}>{t.familyMode}</Text>
          </View>
        </View>

        <View style={styles.menuContainer}>
          <View style={styles.menuItem}>
            <Text style={styles.menuItemText}>{t.language}</Text>
            <View style={styles.languageOptions}>
              <Pressable onPress={() => changeLanguage("zh")}>
                <Text style={[styles.languageOption, language === "zh" && styles.languageOptionActive]}>
                  中文
                </Text>
              </Pressable>
              <Pressable onPress={() => changeLanguage("en")}>
                <Text style={[styles.languageOption, language === "en" && styles.languageOptionActive]}>
                  English
                </Text>
              </Pressable>
              <Pressable onPress={() => changeLanguage("vi")}>
                <Text style={[styles.languageOption, language === "vi" && styles.languageOptionActive]}>
                  Tiếng Việt
                </Text>
              </Pressable>
              <Pressable onPress={() => changeLanguage("id")}>
                <Text style={[styles.languageOption, language === "id" && styles.languageOptionActive]}>
                  Bahasa Indonesia
                </Text>
              </Pressable>
            </View>
          </View>
          <Pressable
            style={styles.menuItem}
            onPress={() => {
              setIsSidebarOpen(false);
              router.push("/family/handbook" as any);
            }}
          >
            <Text style={styles.menuItemText}>{t.handbook}</Text>
          </Pressable>
          <Pressable style={styles.menuItem} onPress={() => Alert.alert(t.prompt, t.emergencyPhoneComingSoon)}>
            <Text style={styles.menuItemText}>{t.emergencyPhoneSettings}</Text>
          </Pressable>

          <Pressable style={styles.menuItem} onPress={() => Alert.alert(t.warning, t.unlinkConfirm)}>
            <Text style={styles.menuItemTextDanger}>{t.unlink}</Text>
          </Pressable>

          <Pressable style={styles.menuItem} onPress={handleLogout}>
            <Text style={styles.menuItemTextDanger}>{t.logout}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF" },
  content: { flex: 1 },
  hamburgerBtn: {
    position: "absolute",
    right: 20,
    zIndex: 40,
    padding: 8,
  },
  bottomNav: {
    backgroundColor: "#EAEAEA",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
    zIndex: 10,
  },
  navIcon: { fontSize: 32 },
  overlay: {
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 100,
  },
  drawer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "#FFF",
    zIndex: 101,
    borderLeftWidth: 2,
    borderLeftColor: "#000",
    shadowColor: "#000",
    shadowOffset: { width: -5, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 20,
  },
  badgeContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  badge: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  badgeText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 17,
    letterSpacing: 2,
  },
  menuContainer: {
    borderTopWidth: 2,
    borderTopColor: "#000",
  },
  menuItem: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: "#000",
  },
  menuItemText: {
    color: "#000",
    fontSize: 19,
    fontWeight: "bold",
  },
  languageOptions: {
    marginTop: 10,
    gap: 8,
  },
  languageOption: {
    color: "#555",
    fontSize: 16,
    fontWeight: "700",
  },
  languageOptionActive: {
    color: "#007AFF",
  },
  menuItemTextDanger: {
    color: "#E33B3B",
    fontSize: 19,
    fontWeight: "bold",
  },
});
