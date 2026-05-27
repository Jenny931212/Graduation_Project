// app/caregiver/communication-cards.tsx
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { router } from 'expo-router'; // 💡 新增：引入 router 來做返回功能
import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// Firebase 相關
import { db } from '@/firebase/firebaseConfig';
import { useActiveCareTarget } from '@/src/care-target/useActiveCareTarget';
import { translations } from '@/src/i18n/translations';
import { useLanguage } from '@/src/store/LanguageContext';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

const initialTasks = [
  { id: 1, title: '乖乖吃藥', image: require('@/assets/images/medication.png') },
  { id: 2, title: '吃飯時間', image: require('@/assets/images/eating.png') },
  { id: 3, title: '洗澡囉', image: require('@/assets/images/shower.png') },
  { id: 4, title: '上廁所', image: require('@/assets/images/toilet.png') },
  { id: 5, title: '動動身體', image: require('@/assets/images/exercise.png') },
  { id: 6, title: '多喝水喔', image: require('@/assets/images/drink_water.png') },
  { id: 7, title: '睡覺時間', image: require('@/assets/images/sleep.png') },
  { id: 8, title: '安撫情緒', image: require('@/assets/images/emotion.png') },
];

export default function CaregiverVoiceScreen() {
  const { activePatientId } = useActiveCareTarget();
  const { language } = useLanguage();
  const t = translations[language];
  const taskTitles: Record<number, string> = {
    1: t.voiceTaskMedication,
    2: t.voiceTaskMeal,
    3: t.voiceTaskShower,
    4: t.voiceTaskToilet,
    5: t.voiceTaskExercise,
    6: t.voiceTaskDrinkWater,
    7: t.voiceTaskSleep,
    8: t.voiceTaskEmotion,
  };
  
  const [tasks, setTasks] = useState<any[]>(initialTasks.map(t => ({ ...t, hasRecording: false })));
  const [playingTaskId, setPlayingTaskId] = useState<number | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  const [waveHeights, setWaveHeights] = useState([6, 6, 6, 6]);

  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  // ==========================================
  // 1. 抓取 Firebase 語音紀錄
  // ==========================================
  useEffect(() => {
    if (!activePatientId) return;

    const q = query(
      collection(db, 'voice_records'),
      where('patientId', '==', activePatientId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const recordsMap: Record<string, any> = {};
      
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (!recordsMap[data.title] || data.createdAt > recordsMap[data.title].createdAt) {
          recordsMap[data.title] = { docId: doc.id, ...data };
        }
      });

      setTasks(initialTasks.map(task => {
        const record = recordsMap[task.title];
        if (record) {
          return { ...task, hasRecording: true, audioUrl: record.audioUrl };
        }
        return { ...task, hasRecording: false, audioUrl: null };
      }));
    });

    return unsub;
  }, [activePatientId]);

  // ==========================================
  // 2. 音波動畫控制
  // ==========================================
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (playingTaskId !== null) {
      interval = setInterval(() => {
        setWaveHeights([
          Math.random() * 10 + 4,
          Math.random() * 12 + 6,
          Math.random() * 10 + 4,
          Math.random() * 8 + 4,
        ]);
      }, 150);
    } else {
      setWaveHeights([6, 6, 6, 6]);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [playingTaskId]);

  // ==========================================
  // 3. 播放邏輯
  // ==========================================
  const handleCardClick = async (task: any) => {
    if (!task.hasRecording) {
      Alert.alert(t.prompt, t.notRecorded);
      return;
    }

    if (playingTaskId === task.id) {
      if (sound) { await sound.stopAsync(); await sound.unloadAsync(); setSound(null); }
      setPlayingTaskId(null);
      return;
    }

    if (sound) { await sound.stopAsync(); await sound.unloadAsync(); }

    setPlayingTaskId(task.id);
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: task.audioUrl },
        { shouldPlay: true },
        null,
        false // 無延遲秒播參數
      );
      
      setSound(newSound);
      
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingTaskId(null);
        }
      });
    } catch (error) {
      Alert.alert(t.resultErrorTitle, t.playVoiceFailed);
      setPlayingTaskId(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* 💡 修改 1：換成家屬端同款的左側返回鍵 Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={30} color="black" />
            <Text style={styles.backBtnText}>{t.back}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.hintContainer}>
        <View style={styles.hintBadge}>
          <Ionicons name="volume-medium" size={20} color="#4A8B46" />
          <Text style={styles.hintText}>{t.communicationCards}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.gridContainer}>
          {tasks.map((task) => {
            const isPlaying = playingTaskId === task.id;

            return (
              <Pressable
                key={task.id}
                onPress={() => handleCardClick(task)}
                style={[
                  styles.card,
                  isPlaying && styles.cardPlaying,
                  !task.hasRecording && styles.cardDisabled
                ]}
              >
                <View style={styles.imageBox}>
                  <Image source={task.image} style={styles.taskImage} resizeMode="contain" />
                  
                  {isPlaying && (
                    <View style={styles.playingOverlay}>
                      <Text style={styles.playingText}>{t.previewing}</Text>
                    </View>
                  )}

                  {task.hasRecording && (
                    <View style={[styles.iconBadge, isPlaying ? styles.iconBadgePlaying : styles.iconBadgeIdle]}>
                      {isPlaying ? (
                        <View style={styles.waveContainer}>
                          <View style={[styles.waveBar, { height: waveHeights[0] }]} />
                          <View style={[styles.waveBar, { height: waveHeights[1] }]} />
                          <View style={[styles.waveBar, { height: waveHeights[2] }]} />
                          <View style={[styles.waveBar, { height: waveHeights[3] }]} />
                        </View>
                      ) : (
                        <Ionicons name="play" size={16} color="#4A4A4A" style={{ marginLeft: 2 }} />
                      )}
                    </View>
                  )}
                </View>
                
                <View style={styles.titleContainer}>
                  <Text style={[styles.cardTitle, isPlaying && styles.cardTitlePlaying]}>
                    {taskTitles[task.id] ?? task.title}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  
  // 💡 Header 樣式修改：讓內容靠左對齊
  header: { backgroundColor: '#90E389', paddingTop: 60, paddingBottom: 25, elevation: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, justifyContent: 'flex-start' },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backBtnText: { fontSize: 20, fontWeight: 'bold', color: '#000', marginLeft: 2 },
  
  hintContainer: { paddingTop: 24, paddingBottom: 8, alignItems: 'center' },
  hintBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F9F1', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 30, borderWidth: 1, borderColor: '#D5EED4', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  hintText: { color: '#4A8B46', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  
  // 💡 修改 2：將 paddingBottom 增加到 120，徹底解決底部卡片被遮住的問題
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  
  card: { width: '47%', backgroundColor: '#FFF', borderRadius: 28, padding: 12, marginBottom: 20, alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
  cardDisabled: { opacity: 0.7 },
  cardPlaying: { transform: [{ translateY: -4 }], shadowColor: '#90E389', shadowOpacity: 0.5, shadowRadius: 16, elevation: 8 },
  
  imageBox: { width: '100%', aspectRatio: 1, backgroundColor: '#F7F7F7', borderRadius: 20, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  taskImage: { width: 150, height: 150 },
  
  playingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  playingText: { color: '#FFF', fontWeight: 'bold', fontSize: 18, letterSpacing: 2, textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: {width: -1, height: 1}, textShadowRadius: 10 },
  
  iconBadge: { position: 'absolute', bottom: 8, right: 8, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  iconBadgeIdle: { backgroundColor: 'rgba(255,255,255,0.9)' },
  iconBadgePlaying: { backgroundColor: '#90E389' },
  
  waveContainer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3, height: 16 },
  waveBar: { width: 3, backgroundColor: '#FFF', borderRadius: 2 },
  
  titleContainer: { marginTop: 12, marginBottom: 4, width: '100%', alignItems: 'center' },
  cardTitle: { fontSize: 22, fontWeight: 'bold', color: '#000', letterSpacing: 1 },
  cardTitlePlaying: { color: '#4A8B46' },
});
