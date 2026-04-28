import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { router, useNavigation } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// Firebase 相關
import { db } from '@/firebase/firebaseConfig';
import { useActiveCareTarget } from '@/src/care-target/useActiveCareTarget';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';

export default function FamilyConditionScreen() {
  const { activePatientId } = useActiveCareTarget();
  
  // 動態隱藏/顯示底部 Tab Bar
  const navigation = useNavigation();
  useEffect(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      navigation.getParent()?.setOptions({ tabBarStyle: { display: 'flex' } });
    };
  }, [navigation]);

  // --- 畫面與資料狀態 ---
  const [currentView, setCurrentView] = useState<'list' | 'detail' | 'folder' | 'folderEntryDetail'>('list');
  const [records, setRecords] = useState<any[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedFolderEntry, setSelectedFolderEntry] = useState<any>(null);
  const [isDoctorMode, setIsDoctorMode] = useState(false);

  // ==========================================
  // 1. 抓取 Firebase 異常紀錄
  // ==========================================
  useEffect(() => {
    if (!activePatientId) return;
    
    const q = query(
      collection(db, 'abnormal_records'),
      where('patientId', '==', activePatientId),
      orderBy('createdAt', 'desc')
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const fetchedRecords = snap.docs.map(doc => {
        const data = doc.data();
        const dateObj = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
        const dateStr = `${dateObj.getFullYear()}年 ${dateObj.getMonth() + 1}月 ${dateObj.getDate()}日`;
        return { id: doc.id, ...data, displayDate: dateStr };
      });
      setRecords(fetchedRecords);
    });
    
    return unsub;
  }, [activePatientId]);

  useEffect(() => {
    if (selectedRecord) {
      const updatedRecord = records.find(r => r.id === selectedRecord.id);
      if (updatedRecord) setSelectedRecord(updatedRecord);
    }
  }, [records]);

  // --- 導覽功能 ---
  const goToList = () => { 
    setCurrentView('list'); 
    setSelectedRecord(null); 
    setSelectedFolderEntry(null); 
    setIsDoctorMode(false); 
  };
  
  const goToDetail = (record: any) => { 
    setSelectedRecord(record); 
    setCurrentView(record.type === 'folder' ? 'folder' : 'detail'); 
    setIsDoctorMode(false); 
  };
  
  const goToFolderEntry = (entry: any) => { 
    setSelectedFolderEntry(entry); 
    setCurrentView('folderEntryDetail'); 
    setIsDoctorMode(false); 
  };
  
  const goBackToFolder = () => { 
    setCurrentView('folder'); 
    setSelectedFolderEntry(null); 
    setIsDoctorMode(false); 
  };

  // --- 🌟 強化版：多重防呆的媒體渲染元件 ---
  const renderMedia = (uri: string, type: 'image' | 'video' | null | undefined) => {
    // 智慧偵測：如果資料庫有標記 video，或者網址內包含影片副檔名，就強制當成影片處理！
    const isVideo = type === 'video' || (uri && (uri.includes('.mp4') || uri.includes('.mov')));

    if (isVideo) {
      return (
        <Video 
          source={{ uri }} 
          style={styles.mediaImage} 
          useNativeControls 
          resizeMode={ResizeMode.CONTAIN} 
        />
      );
    }
    return (
      <Image 
        source={{ uri }} 
        style={styles.mediaImage} 
        resizeMode="contain" 
      />
    );
  };

  // 判斷是否為影片的共用小函式 (用在列表與縮圖)
  const isVideoMedia = (type: any, uri: any) => {
    return type === 'video' || (uri && (uri.includes('.mp4') || uri.includes('.mov')));
  };

  // --- UI 渲染區塊 ---

  const renderList = () => (
    <View style={styles.viewContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.listHint}>點擊列表查看長輩的異常狀況紀錄與追蹤。</Text>
        
        {records.length === 0 ? (
           <View style={{ alignItems: 'center', marginTop: 50 }}>
             <Ionicons name="clipboard-outline" size={64} color="#CCC" style={{ marginBottom: 12 }} />
             <Text style={{ color: '#999', fontSize: 16 }}>目前沒有任何異常紀錄</Text>
           </View>
        ) : (
          records.map(record => (
            <Pressable key={record.id} onPress={() => goToDetail(record)} style={styles.listItem}>
              <View style={{ flex: 1 }}>
                <View style={styles.tagContainer}>
                  {record.type === 'folder' ? (
                    <Text style={styles.tagFolder}>追蹤資料夾</Text>
                  ) : (
                    <Text style={styles.tagSingle}>單次紀錄</Text>
                  )}
                </View>
                <Text style={styles.listTitle} numberOfLines={1}>{record.titleOriginal || '未命名紀錄'}</Text>
                <Text style={styles.listDate}>{record.displayDate}</Text>
              </View>
              <View style={styles.listIconBox}>
                {record.type === 'folder' ? (
                  <Ionicons name="folder" size={24} color="white" />
                ) : (
                  <Ionicons name={isVideoMedia(record.mediaType, record.mediaUrl) ? "videocam" : "image"} size={24} color="white" />
                )}
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );

  const renderDetail = () => (
    <View style={styles.viewContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.doctorModeRow}>
          <Pressable onPress={() => setIsDoctorMode(!isDoctorMode)} style={[styles.doctorModeBtn, isDoctorMode ? styles.doctorModeBtnActive : styles.doctorModeBtnIdle]}>
            <Ionicons name="language" size={18} color={isDoctorMode ? 'white' : '#666'} />
            <Text style={[styles.doctorModeText, isDoctorMode && { color: 'white' }]}>
              {isDoctorMode ? '醫師檢視模式 (中文) : ON' : '切換為醫師檢視 (中文)'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.mediaContainer}>
          {selectedRecord?.hasMedia && selectedRecord?.mediaUrl ? (
            renderMedia(selectedRecord.mediaUrl, selectedRecord.mediaType)
          ) : (<Text style={{ color: '#999', fontWeight: 'bold' }}>沒有影片/照片</Text>)}
        </View>

        <View style={styles.detailHeaderRow}>
          <Text style={styles.detailTitle}>{isDoctorMode ? (selectedRecord?.titleZh || 'AI 翻譯處理中...') : selectedRecord?.titleOriginal}</Text>
        </View>

        <Text style={styles.detailDate}>{selectedRecord?.displayDate}</Text>
        
        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>備註：</Text>
          <Text style={[styles.noteText, isDoctorMode && { fontSize: 18 }]}>
            {isDoctorMode ? (selectedRecord?.notesZh || 'AI 翻譯處理中...') : selectedRecord?.notesOriginal}
          </Text>
        </View>
      </ScrollView>
    </View>
  );

  const renderFolder = () => (
    <View style={styles.viewContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.doctorModeRow}>
          <Pressable onPress={() => setIsDoctorMode(!isDoctorMode)} style={[styles.doctorModeBtn, isDoctorMode ? styles.doctorModeBtnActive : styles.doctorModeBtnIdle]}>
            <Ionicons name="language" size={18} color={isDoctorMode ? 'white' : '#666'} />
            <Text style={[styles.doctorModeText, isDoctorMode && { color: 'white' }]}>{isDoctorMode ? '中文模式 : ON' : '切換中文'}</Text>
          </Pressable>
        </View>

        <View style={styles.folderHeader}>
          <Ionicons name="folder-open" size={36} color="#7BC6F9" style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.detailTitle}>{isDoctorMode ? (selectedRecord?.titleZh || 'AI 翻譯處理中...') : selectedRecord?.titleOriginal}</Text>
            <Text style={styles.detailDate}>建立於: {selectedRecord?.displayDate}</Text>
          </View>
        </View>

        {(!selectedRecord?.entries || selectedRecord?.entries.length === 0) && (
          <View style={{ alignItems: 'center', marginTop: 30, padding: 20, backgroundColor: '#FFF4E5', borderRadius: 12 }}>
            <Text style={{ color: '#D37B2B', fontWeight: 'bold' }}>目前資料夾內尚無追蹤紀錄</Text>
          </View>
        )}

        <View style={styles.timelineContainer}>
          {selectedRecord?.entries?.map((entry: any, index: number) => {
             const eDateObj = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
             const eDateStr = `${eDateObj.getMonth() + 1}/${eDateObj.getDate()} ${String(eDateObj.getHours()).padStart(2, '0')}:${String(eDateObj.getMinutes()).padStart(2, '0')}`;
             return (
              <Pressable key={entry.entryId || index} style={styles.timelineItem} onPress={() => goToFolderEntry(entry)}>
                <View style={styles.timelineDot} />
                <Text style={styles.timelineDate}>{eDateStr}</Text>
                <View style={styles.timelineCard}>
                  <View style={styles.timelineThumbnail}>
                    {entry.mediaUrl ? (
                      isVideoMedia(entry.mediaType, entry.mediaUrl) ? (
                        <View style={{ width: '100%', height: '100%', borderRadius: 12, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' }}>
                          <Ionicons name="play" size={32} color="white" />
                        </View>
                      ) : (
                        <Image source={{ uri: entry.mediaUrl }} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
                      )
                    ) : <Ionicons name="document-text" size={32} color="#CCC" />}
                  </View>
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Text style={styles.timelineNotes} numberOfLines={2}>{isDoctorMode ? (entry.notesZh || 'AI 翻譯中...') : entry.notesOriginal}</Text>
                    <Text style={styles.timelineMore}>查看詳情 ➔</Text>
                  </View>
                </View>
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
    </View>
  );

  const renderFolderEntryDetail = () => {
    const eDateObj = selectedFolderEntry?.createdAt?.toDate ? selectedFolderEntry.createdAt.toDate() : new Date(selectedFolderEntry?.createdAt || Date.now());
    const eDateStr = `${eDateObj.getFullYear()}年 ${eDateObj.getMonth() + 1}月 ${eDateObj.getDate()}日`;
    
    return (
      <View style={styles.viewContainer}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.doctorModeRow}>
            <Pressable onPress={() => setIsDoctorMode(!isDoctorMode)} style={[styles.doctorModeBtn, isDoctorMode ? styles.doctorModeBtnActive : styles.doctorModeBtnIdle]}>
              <Ionicons name="language" size={18} color={isDoctorMode ? 'white' : '#666'} />
              <Text style={[styles.doctorModeText, isDoctorMode && { color: 'white' }]}>{isDoctorMode ? '中文模式 : ON' : '切換中文'}</Text>
            </Pressable>
          </View>

          <View style={styles.folderBadge}>
            <Ionicons name="folder" size={16} color="#E59752" style={{ marginRight: 6 }} />
            <Text style={styles.folderBadgeText}>來自資料夾：{isDoctorMode ? (selectedRecord?.titleZh || selectedRecord?.titleOriginal) : selectedRecord?.titleOriginal}</Text>
          </View>

          <View style={styles.mediaContainer}>
             {selectedFolderEntry?.mediaUrl ? renderMedia(selectedFolderEntry.mediaUrl, selectedFolderEntry.mediaType) : <Text style={{ color: '#999', fontWeight: 'bold' }}>無相片</Text>}
          </View>

          <View style={styles.detailHeaderRow}>
            <Text style={styles.detailTitle}>紀錄時間：</Text>
          </View>

          <Text style={styles.detailDate}>{eDateStr}</Text>
          
          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>備註：</Text>
            <Text style={[styles.noteText, isDoctorMode && { fontSize: 18 }]}>
              {isDoctorMode ? (selectedFolderEntry?.notesZh || 'AI 翻譯處理中...') : selectedFolderEntry?.notesOriginal}
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  };

  // --- 主結構回傳 ---
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable 
            onPress={() => {
              if (currentView === 'folderEntryDetail') goBackToFolder();
              else if (currentView !== 'list') goToList();
              else router.back();
            }} 
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={28} color="black" />
            <Text style={styles.headerTitle}>狀況查看</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {currentView === 'list' && renderList()}
        {currentView === 'detail' && renderDetail()}
        {currentView === 'folder' && renderFolder()}
        {currentView === 'folderEntryDetail' && renderFolderEntryDetail()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  viewContainer: { flex: 1, position: 'relative' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100 },
  
  header: { backgroundColor: '#7BC6F9', paddingTop: 60, paddingBottom: 15, elevation: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, justifyContent: 'flex-start' },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#000', marginLeft: 4, letterSpacing: 1 },

  listHint: { color: '#666', fontSize: 14, fontWeight: '600', marginBottom: 16, marginLeft: 4 },
  listItem: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
  tagContainer: { flexDirection: 'row', marginBottom: 6 },
  tagFolder: { backgroundColor: '#FFF4E5', color: '#E59752', fontSize: 12, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  tagSingle: { backgroundColor: '#E6F4FF', color: '#4A90E2', fontSize: 12, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  listTitle: { fontSize: 20, fontWeight: 'bold', color: '#000' },
  listDate: { color: '#888', fontSize: 14, marginTop: 4 },
  listIconBox: { width: 48, height: 48, backgroundColor: '#7BC6F9', borderRadius: 24, justifyContent: 'center', alignItems: 'center' },

  doctorModeRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 16 },
  doctorModeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, elevation: 1 },
  doctorModeBtnIdle: { backgroundColor: '#FFF', borderColor: '#DDD' },
  doctorModeBtnActive: { backgroundColor: '#4A8B46', borderColor: '#4A8B46' },
  doctorModeText: { fontWeight: 'bold', fontSize: 14, color: '#555' },
  mediaContainer: { width: '100%', aspectRatio: 4/3, backgroundColor: '#E5E5E5', borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 24, overflow: 'hidden' },
  mediaImage: { width: '100%', height: '100%' },
  detailHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  detailTitle: { fontSize: 26, fontWeight: 'bold', color: '#000' },
  detailDate: { color: '#888', fontSize: 15, marginBottom: 24 },
  noteBox: { backgroundColor: '#F7F7F7', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#EEE' },
  noteTitle: { color: '#666', fontWeight: 'bold', marginBottom: 8, fontSize: 15 },
  noteText: { color: '#000', lineHeight: 24, fontSize: 16 },

  folderHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  timelineContainer: { paddingLeft: 16, borderLeftWidth: 2, borderLeftColor: '#7BC6F9', marginLeft: 16, marginTop: 16 },
  timelineItem: { marginBottom: 32, position: 'relative' },
  timelineDot: { position: 'absolute', left: -25, top: 2, width: 16, height: 16, backgroundColor: '#7BC6F9', borderRadius: 8, borderWidth: 3, borderColor: '#FFF' },
  timelineDate: { color: '#666', fontWeight: 'bold', marginBottom: 8 },
  timelineCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 12, flexDirection: 'row', gap: 12, elevation: 2, shadowOpacity: 0.05, shadowRadius: 8 },
  timelineThumbnail: { width: 80, height: 80, backgroundColor: '#F0F0F0', borderRadius: 12, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  timelineNotes: { color: '#000', fontSize: 15, lineHeight: 20, marginBottom: 8 },
  timelineMore: { color: '#7BC6F9', fontSize: 12, fontWeight: 'bold' },
  folderBadge: { alignSelf: 'flex-start', backgroundColor: '#FFF4E5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#FBE0C3', marginBottom: 16, flexDirection: 'row', alignItems: 'center' },
  folderBadgeText: { color: '#E59752', fontWeight: 'bold', fontSize: 14 },
});