import { Feather, Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { router, useNavigation } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

// Firebase 相關
import { db, storage } from '@/firebase/firebaseConfig';
import { useAuth } from '@/src/auth/useAuth';
import { useActiveCareTarget } from '@/src/care-target/useActiveCareTarget';
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

export default function AbnormalRecordScreen() {
  const { user } = useAuth();
  const { activePatientId } = useActiveCareTarget();
  
  const navigation = useNavigation();
  useEffect(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      navigation.getParent()?.setOptions({ tabBarStyle: { display: 'flex' } });
    };
  }, [navigation]);

  // --- 畫面與資料狀態 ---
  const [currentView, setCurrentView] = useState<'list' | 'detail' | 'folder' | 'create' | 'folderEntryDetail' | 'createFolderEntry' | 'edit' | 'editFolderEntry'>('list');
  const [records, setRecords] = useState<any[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedFolderEntry, setSelectedFolderEntry] = useState<any>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [createFormType, setCreateFormType] = useState<'single' | 'folder'>('single');
  const [isDoctorMode, setIsDoctorMode] = useState(false);

  // --- 表單輸入狀態 ---
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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

  // ==========================================
  // 2. 拍攝或選擇媒體
  // ==========================================
  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('需要權限', '請允許使用相機');
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      videoMaxDuration: 60,
      quality: 0.7,
    });
    if (!result.canceled && result.assets) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('需要權限', '請允許存取相簿');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      videoMaxDuration: 60,
      quality: 0.7,
    });
    if (!result.canceled && result.assets) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const handlePickMedia = () => {
    Alert.alert('選擇上傳方式', '請選擇你要拍攝或從相簿挑選：', [
      { text: '📷 開啟相機', onPress: openCamera },
      { text: '🖼️ 從相簿選擇', onPress: openGallery },
      { text: '取消', style: 'cancel' }
    ]);
  };

  const uploadMediaFile = async (uri: string) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const extension = mediaType === 'video' ? 'mp4' : 'jpg';
    
    // 1. 產生 YYYY-MM-DD_HH-mm-ss 好讀時間格式
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    
    // 2. 取得長輩 ID 末 4 碼
    const shortId = activePatientId.slice(-4);

    // 3. 組合出完美的檔名 (例如: 2026-04-26_14-30-05_abnormal_e1a4.jpg)
    const fileName = `${timeStr}_abnormal_${shortId}.${extension}`;
    
    const storageRef = ref(storage, `abnormal_media/${activePatientId}/${fileName}`);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  };

  // ==========================================
  // 3. 儲存/建立紀錄
  // ==========================================
  const getCustomDocId = () => {
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const shortId = activePatientId.slice(-4);
    return `${timeStr}_abnormal_${shortId}`;
  };

  const handleSaveRecord = async () => {
    if (!user || !activePatientId) return;
    if (!title.trim()) return Alert.alert('提醒', '請輸入標題或資料夾名稱');

    setIsUploading(true);
    try {
      let uploadedUrl = null;
      if (mediaUri) uploadedUrl = await uploadMediaFile(mediaUri);

      const customDocId = getCustomDocId();
      const docRef = doc(db, 'abnormal_records', customDocId);

      const basePayload = {
        patientId: activePatientId,
        caregiverId: user.uid,
        createdAt: serverTimestamp(),
        titleOriginal: title,
        titleZh: '', 
        notesOriginal: notes,
        notesZh: '', 
      };

      if (createFormType === 'single') {
        await setDoc(docRef, { ...basePayload, type: 'single', hasMedia: !!uploadedUrl, mediaUrl: uploadedUrl, mediaType: mediaType || null });
      } else {
        await setDoc(docRef, { ...basePayload, type: 'folder', entries: [] });
      }

      Alert.alert('成功', '紀錄已儲存');
      goToList();
    } catch (error) {
      Alert.alert('錯誤', '儲存失敗，請重試');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveFolderEntry = async () => {
    if (!user || !activePatientId || !selectedRecord) return;
    
    setIsUploading(true);
    try {
      let uploadedUrl = null;
      if (mediaUri) uploadedUrl = await uploadMediaFile(mediaUri);

      const newEntry = {
        entryId: Date.now().toString(),
        notesOriginal: notes,
        notesZh: '', 
        mediaUrl: uploadedUrl,
        mediaType: mediaType || null,
        createdAt: new Date(), 
      };

      const docRef = doc(db, 'abnormal_records', selectedRecord.id);
      await updateDoc(docRef, { entries: arrayUnion(newEntry) });

      Alert.alert('成功', '追蹤紀錄已新增');
      goBackToFolder();
    } catch (error) {
      Alert.alert('錯誤', '儲存失敗，請重試');
    } finally {
      setIsUploading(false);
    }
  };

  // ==========================================
  // 4. 編輯與刪除邏輯
  // ==========================================
  const handleDeleteRecord = () => {
    setDropdownOpen(false);
    Alert.alert('確認刪除', '您確定要刪除整筆紀錄嗎？這將無法復原。', [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, 'abnormal_records', selectedRecord.id));
            Alert.alert('成功', '紀錄已刪除');
            goToList();
          } catch (e) {
            Alert.alert('錯誤', '刪除失敗');
          }
      }}
    ]);
  };

  const handleDeleteFolderEntry = () => {
    setDropdownOpen(false);
    Alert.alert('確認刪除', '您確定要刪除這筆追蹤項目嗎？', [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive', onPress: async () => {
          try {
            const docRef = doc(db, 'abnormal_records', selectedRecord.id);
            await updateDoc(docRef, { entries: arrayRemove(selectedFolderEntry) });
            Alert.alert('成功', '追蹤項目已刪除');
            goBackToFolder();
          } catch (e) {
            Alert.alert('錯誤', '刪除失敗');
          }
      }}
    ]);
  };

  const handleUpdateTextOnly = async () => {
    setIsUploading(true);
    try {
      const docRef = doc(db, 'abnormal_records', selectedRecord.id);
      if (currentView === 'edit') {
        await updateDoc(docRef, { titleOriginal: title, notesOriginal: notes });
        setCurrentView(selectedRecord.type === 'folder' ? 'folder' : 'detail');
      } else if (currentView === 'editFolderEntry') {
        const updatedEntries = selectedRecord.entries.map((e: any) => 
          e.entryId === selectedFolderEntry.entryId ? { ...e, notesOriginal: notes } : e
        );
        await updateDoc(docRef, { entries: updatedEntries });
        setSelectedFolderEntry({ ...selectedFolderEntry, notesOriginal: notes });
        setCurrentView('folderEntryDetail');
      }
      Alert.alert('成功', '文字已更新');
    } catch (e) {
      Alert.alert('錯誤', '更新失敗');
    } finally {
      setIsUploading(false);
    }
  };

  // --- 導覽功能 ---
  const resetForm = () => { setTitle(''); setNotes(''); setMediaUri(null); setMediaType(null); setDropdownOpen(false); };
  const goToList = () => { setCurrentView('list'); setSelectedRecord(null); setSelectedFolderEntry(null); setIsDoctorMode(false); resetForm(); };
  const goToDetail = (record: any) => { setSelectedRecord(record); setCurrentView(record.type === 'folder' ? 'folder' : 'detail'); setIsDoctorMode(false); resetForm(); };
  const goToCreate = () => { resetForm(); setCurrentView('create'); setCreateFormType('single'); };
  const goToFolderEntry = (entry: any) => { setSelectedFolderEntry(entry); setCurrentView('folderEntryDetail'); setIsDoctorMode(false); resetForm(); };
  const goBackToFolder = () => { setCurrentView('folder'); setSelectedFolderEntry(null); setIsDoctorMode(false); resetForm(); };
  const goToCreateFolderEntry = () => { resetForm(); setCurrentView('createFolderEntry'); setIsDoctorMode(false); };
  
  const goToEditRecord = () => {
    setDropdownOpen(false);
    setTitle(selectedRecord.titleOriginal);
    setNotes(selectedRecord.notesOriginal);
    setCurrentView('edit');
  };

  const goToEditFolderEntry = () => {
    setDropdownOpen(false);
    setNotes(selectedFolderEntry.notesOriginal);
    setCurrentView('editFolderEntry');
  };

  // --- 🌟 共用的媒體渲染元件 ---
  const renderMedia = (uri: string, type: 'image' | 'video' | null | undefined, isUploadBox: boolean = false) => {
    if (type === 'video') {
      return (
        <Video 
          source={{ uri }} 
          style={isUploadBox ? { width: '100%', height: '100%' } : styles.mediaImage} 
          useNativeControls 
          resizeMode={ResizeMode.CONTAIN} 
        />
      );
    }
    return (
      <Image 
        source={{ uri }} 
        style={isUploadBox ? { width: '100%', height: '100%' } : styles.mediaImage} 
        resizeMode="contain" 
      />
    );
  };

  // --- UI 渲染區塊 ---

  const renderList = () => (
    <View style={styles.viewContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.listHint}>點擊列表查看詳情，或點擊右下角新增。</Text>
        {records.map(record => (
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
              {/* 🌟 列表專業圖標化：資料夾、影片、圖片 */}
              {record.type === 'folder' ? (
                <Ionicons name="folder" size={24} color="white" />
              ) : (
                <Ionicons name={record.mediaType === 'video' ? "videocam" : "image"} size={24} color="white" />
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable onPress={goToCreate} style={styles.fabBtn}><Feather name="plus" size={32} color="black" /></Pressable>
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
          {selectedRecord.hasMedia && selectedRecord.mediaUrl ? (
            renderMedia(selectedRecord.mediaUrl, selectedRecord.mediaType)
          ) : (<Text style={{ color: '#999', fontWeight: 'bold' }}>沒有影片/照片</Text>)}
        </View>

        <View style={styles.detailHeaderRow}>
          <Text style={styles.detailTitle}>{isDoctorMode ? (selectedRecord.titleZh || 'AI 翻譯處理中...') : selectedRecord.titleOriginal}</Text>
          
          <View style={{ position: 'relative', zIndex: 50 }}>
            <Pressable onPress={() => setDropdownOpen(!dropdownOpen)} style={{ paddingHorizontal: 8, paddingBottom: 8 }}>
              <Text style={{ fontSize: 28, color: '#666', marginTop: -8 }}>⋯</Text>
            </Pressable>
            {dropdownOpen && (
              <View style={styles.dropdownMenu}>
                <Pressable onPress={goToEditRecord} style={styles.dropdownItem}><Text style={styles.dropdownText}>編輯文字</Text></Pressable>
                <Pressable onPress={handleDeleteRecord} style={[styles.dropdownItem, { borderBottomWidth: 0 }]}><Text style={[styles.dropdownText, { color: 'red' }]}>刪除</Text></Pressable>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.detailDate}>{selectedRecord.displayDate}</Text>
        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>備註：</Text>
          <Text style={[styles.noteText, isDoctorMode && { fontSize: 18 }]}>
            {isDoctorMode ? (selectedRecord.notesZh || 'AI 翻譯處理中...') : selectedRecord.notesOriginal}
          </Text>
        </View>
      </ScrollView>
    </View>
  );

  const renderFolder = () => (
    <View style={styles.viewContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        <View style={[styles.doctorModeRow, { justifyContent: 'space-between' }]}>
          <View style={{ position: 'relative', zIndex: 50 }}>
            <Pressable onPress={() => setDropdownOpen(!dropdownOpen)} style={{ padding: 8, backgroundColor: '#EEE', borderRadius: 20 }}>
              <Text style={{ fontSize: 20, color: '#666', lineHeight: 20 }}>⋯ 操作</Text>
            </Pressable>
            {dropdownOpen && (
              <View style={[styles.dropdownMenu, { left: 0, right: 'auto' }]}>
                <Pressable onPress={goToEditRecord} style={styles.dropdownItem}><Text style={styles.dropdownText}>編輯標題/描述</Text></Pressable>
                <Pressable onPress={handleDeleteRecord} style={[styles.dropdownItem, { borderBottomWidth: 0 }]}><Text style={[styles.dropdownText, { color: 'red' }]}>刪除整個資料夾</Text></Pressable>
              </View>
            )}
          </View>

          <Pressable onPress={() => setIsDoctorMode(!isDoctorMode)} style={[styles.doctorModeBtn, isDoctorMode ? styles.doctorModeBtnActive : styles.doctorModeBtnIdle]}>
            <Ionicons name="language" size={18} color={isDoctorMode ? 'white' : '#666'} />
            <Text style={[styles.doctorModeText, isDoctorMode && { color: 'white' }]}>{isDoctorMode ? '中文模式 : ON' : '切換中文'}</Text>
          </Pressable>
        </View>

        <View style={styles.folderHeader}>
          <Ionicons name="folder-open" size={36} color="#7BC6F9" style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.detailTitle}>{isDoctorMode ? (selectedRecord.titleZh || 'AI 翻譯處理中...') : selectedRecord.titleOriginal}</Text>
            <Text style={styles.detailDate}>建立於: {selectedRecord.displayDate}</Text>
          </View>
        </View>

        <Pressable onPress={goToCreateFolderEntry} style={styles.addEntryBtn}>
          <Feather name="plus" size={24} color="#D37B2B" />
          <Text style={styles.addEntryBtnText}>新增今日狀況</Text>
        </Pressable>

        <View style={styles.timelineContainer}>
          {selectedRecord.entries?.map((entry: any, index: number) => {
             const eDateObj = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
             const eDateStr = `${eDateObj.getMonth() + 1}/${eDateObj.getDate()} ${String(eDateObj.getHours()).padStart(2, '0')}:${String(eDateObj.getMinutes()).padStart(2, '0')}`;
             return (
              <Pressable key={entry.entryId || index} style={styles.timelineItem} onPress={() => goToFolderEntry(entry)}>
                <View style={styles.timelineDot} />
                <Text style={styles.timelineDate}>{eDateStr}</Text>
                <View style={styles.timelineCard}>
                  <View style={styles.timelineThumbnail}>
                    {/* 🌟 縮圖區塊保護與專業圖示 */}
                    {entry.mediaUrl ? (
                      entry.mediaType === 'video' ? (
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
            <Text style={styles.folderBadgeText}>來自資料夾：{isDoctorMode ? (selectedRecord.titleZh || selectedRecord.titleOriginal) : selectedRecord.titleOriginal}</Text>
          </View>

          <View style={styles.mediaContainer}>
             {selectedFolderEntry.mediaUrl ? renderMedia(selectedFolderEntry.mediaUrl, selectedFolderEntry.mediaType) : <Text style={{ color: '#999', fontWeight: 'bold' }}>無相片</Text>}
          </View>

          <View style={styles.detailHeaderRow}>
            <Text style={styles.detailTitle}>紀錄時間：</Text>
            
            <View style={{ position: 'relative', zIndex: 50 }}>
              <Pressable onPress={() => setDropdownOpen(!dropdownOpen)} style={{ paddingHorizontal: 8, paddingBottom: 8 }}>
                <Text style={{ fontSize: 28, color: '#666', marginTop: -8 }}>⋯</Text>
              </Pressable>
              {dropdownOpen && (
                <View style={styles.dropdownMenu}>
                  <Pressable onPress={goToEditFolderEntry} style={styles.dropdownItem}><Text style={styles.dropdownText}>編輯描述</Text></Pressable>
                  <Pressable onPress={handleDeleteFolderEntry} style={[styles.dropdownItem, { borderBottomWidth: 0 }]}><Text style={[styles.dropdownText, { color: 'red' }]}>刪除</Text></Pressable>
                </View>
              )}
            </View>
          </View>

          <Text style={styles.detailDate}>{eDateStr}</Text>
          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>備註：</Text>
            <Text style={[styles.noteText, isDoctorMode && { fontSize: 18 }]}>{isDoctorMode ? (selectedFolderEntry.notesZh || 'AI 翻譯處理中...') : selectedFolderEntry.notesOriginal}</Text>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderEdit = () => (
    <View style={styles.viewContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.folderIntroBox}>
          <Ionicons name="pencil" size={24} color="#D37B2B" />
          <Text style={styles.folderIntroText}>修改紀錄文字 (若需修改照片，請刪除後重新建立)</Text>
        </View>

        {currentView === 'edit' && (
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.inputLabel}>標題 / 資料夾名稱</Text>
            <TextInput value={title} onChangeText={setTitle} style={styles.inputTitle} />
          </View>
        )}

        <View style={{ marginBottom: 20 }}>
          <Text style={styles.inputLabel}>備註 / 狀況描述</Text>
          <TextInput value={notes} onChangeText={setNotes} multiline numberOfLines={6} style={styles.inputNotes} />
        </View>
      </ScrollView>

      <Pressable onPress={handleUpdateTextOnly} disabled={isUploading} style={styles.fabBtn}>
        {isUploading ? <ActivityIndicator color="black" /> : <Feather name="check" size={36} color="black" />}
      </Pressable>
    </View>
  );

  const renderCreate = () => (
    <View style={styles.viewContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.switchTabs}>
          <Pressable onPress={() => setCreateFormType('single')} style={[styles.tabBtn, createFormType === 'single' && styles.tabBtnActive]}><Text style={[styles.tabText, createFormType === 'single' && styles.tabTextActive]}>單次紀錄</Text></Pressable>
          <Pressable onPress={() => setCreateFormType('folder')} style={[styles.tabBtn, createFormType === 'folder' && styles.tabBtnActive]}><Text style={[styles.tabText, createFormType === 'folder' && styles.tabTextActive]}>開新資料夾</Text></Pressable>
        </View>

        {createFormType === 'single' ? (
          <>
            {/* 🌟 核心修改 A：媒體上傳與重新選擇按鈕分離 */}
            <View style={[styles.uploadBox, mediaUri ? styles.uploadBoxFilled : styles.uploadBoxEmpty]}>
               {mediaUri ? (
                 <View style={{ width: '100%', height: '100%', position: 'relative' }}>
                   {renderMedia(mediaUri, mediaType, true)}
                   {/* 獨立的懸浮重新選擇按鈕 */}
                   <Pressable onPress={handlePickMedia} style={styles.reselectBtn}>
                     <Ionicons name="refresh" size={16} color="white" />
                     <Text style={styles.reselectBtnText}>重新選擇</Text>
                   </Pressable>
                 </View>
               ) : (
                 <Pressable onPress={handlePickMedia} style={styles.uploadPlaceholder}>
                   <Ionicons name="camera" size={48} color="#999" style={{ marginBottom: 8 }} />
                   <Text style={{ color: '#666', fontWeight: 'bold' }}>點擊拍攝或選擇檔案</Text>
                 </Pressable>
               )}
            </View>

            <TextInput value={title} onChangeText={setTitle} placeholder="請輸入標題" style={styles.inputTitle} placeholderTextColor="#999" />
            <TextInput value={notes} onChangeText={setNotes} placeholder="請輸入備註說明" multiline numberOfLines={5} style={styles.inputNotes} placeholderTextColor="#999" />
          </>
        ) : (
          <>
            <View style={styles.folderIntroBox}>
              <Ionicons name="folder-open" size={28} color="#D37B2B" />
              <Text style={styles.folderIntroText}>建立一個新資料夾來持續追蹤特定狀況。</Text>
            </View>
            <Text style={styles.inputLabel}>資料夾名稱</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="例如: 右腳傷口觀察" style={styles.inputTitle} placeholderTextColor="#999" />
            <Text style={styles.inputLabel}>說明 / 部位描述</Text>
            <TextInput value={notes} onChangeText={setNotes} placeholder="請簡單描述要追蹤的項目..." multiline numberOfLines={4} style={styles.inputNotes} placeholderTextColor="#999" />
          </>
        )}
      </ScrollView>
      <Pressable onPress={handleSaveRecord} disabled={isUploading} style={styles.fabBtn}>{isUploading ? <ActivityIndicator color="black" /> : <Feather name="check" size={36} color="black" />}</Pressable>
    </View>
  );

  const renderCreateFolderEntry = () => (
    <View style={styles.viewContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.folderBadge}>
          <Ionicons name="folder" size={16} color="#E59752" style={{ marginRight: 6 }} />
          <Text style={styles.folderBadgeText}>新增至：{selectedRecord.titleOriginal}</Text>
        </View>

        {/* 🌟 核心修改 A：媒體上傳與重新選擇按鈕分離 */}
        <View style={[styles.uploadBox, mediaUri ? styles.uploadBoxFilled : styles.uploadBoxEmpty]}>
           {mediaUri ? (
             <View style={{ width: '100%', height: '100%', position: 'relative' }}>
               {renderMedia(mediaUri, mediaType, true)}
               <Pressable onPress={handlePickMedia} style={styles.reselectBtn}>
                 <Ionicons name="refresh" size={16} color="white" />
                 <Text style={styles.reselectBtnText}>重新選擇</Text>
               </Pressable>
             </View>
           ) : (
             <Pressable onPress={handlePickMedia} style={styles.uploadPlaceholder}>
               <Ionicons name="camera" size={48} color="#999" style={{ marginBottom: 8 }} />
               <Text style={{ color: '#666', fontWeight: 'bold' }}>點擊拍攝今日狀況/影片</Text>
             </Pressable>
           )}
        </View>

        <Text style={styles.inputLabel}>狀況描述</Text>
        <TextInput value={notes} onChangeText={setNotes} placeholder="請描述今天的變化..." multiline numberOfLines={6} style={styles.inputNotes} placeholderTextColor="#999" />
      </ScrollView>
      <Pressable onPress={handleSaveFolderEntry} disabled={isUploading} style={styles.fabBtn}>{isUploading ? <ActivityIndicator color="black" /> : <Feather name="check" size={36} color="black" />}</Pressable>
    </View>
  );

  // --- 主結構回傳 ---
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable 
            onPress={() => {
              if (currentView === 'folderEntryDetail' || currentView === 'editFolderEntry') goBackToFolder();
              else if (currentView === 'edit') setCurrentView(selectedRecord.type === 'folder' ? 'folder' : 'detail');
              else if (currentView !== 'list') goToList();
              else router.back();
            }} 
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={28} color="black" />
            <Text style={styles.headerTitle}>異常紀錄</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {currentView === 'list' && renderList()}
        {currentView === 'detail' && renderDetail()}
        {currentView === 'folder' && renderFolder()}
        {currentView === 'folderEntryDetail' && renderFolderEntryDetail()}
        {currentView === 'create' && renderCreate()}
        {currentView === 'createFolderEntry' && renderCreateFolderEntry()}
        {(currentView === 'edit' || currentView === 'editFolderEntry') && renderEdit()}
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

  dropdownMenu: { position: 'absolute', top: 35, right: 0, backgroundColor: '#FFF', borderRadius: 12, paddingVertical: 4, width: 140, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 10, borderWidth: 1, borderColor: '#EEE' },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  dropdownText: { fontSize: 16, fontWeight: 'bold', color: '#333' },

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
  addEntryBtn: { width: '100%', backgroundColor: '#FFF4E5', borderWidth: 2, borderColor: '#E59752', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 24 },
  addEntryBtnText: { color: '#D37B2B', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
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

  switchTabs: { flexDirection: 'row', backgroundColor: '#EAEAEA', borderRadius: 12, padding: 4, marginBottom: 24 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#FFF', elevation: 1 },
  tabText: { fontWeight: 'bold', color: '#888' },
  tabTextActive: { color: '#000' },
  
  // 🌟 上傳框的動態樣式
  uploadBox: { width: '100%', aspectRatio: 4/3, borderRadius: 24, marginBottom: 20, overflow: 'hidden' },
  uploadBoxEmpty: { backgroundColor: '#E5E5E5', borderWidth: 2, borderColor: '#CCC', borderStyle: 'dashed' },
  uploadBoxFilled: { backgroundColor: '#000', borderWidth: 0 },
  uploadPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  reselectBtn: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
  reselectBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },

  inputTitle: { backgroundColor: '#EAEAEA', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16, fontSize: 18, fontWeight: 'bold', color: '#000', marginBottom: 20 },
  inputNotes: { backgroundColor: '#EAEAEA', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16, fontSize: 16, color: '#000', marginBottom: 20, textAlignVertical: 'top' },
  folderIntroBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF4E5', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#FBE0C3', marginBottom: 24 },
  folderIntroText: { color: '#D37B2B', fontSize: 14, fontWeight: 'bold', flex: 1 },
  inputLabel: { color: '#555', fontWeight: 'bold', marginBottom: 8, marginLeft: 4 },

  fabBtn: { position: 'absolute', right: 20, bottom: 30, width: 64, height: 64, backgroundColor: '#7BC6F9', borderRadius: 20, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#7BC6F9', shadowOpacity: 0.5, shadowRadius: 15, shadowOffset: { width: 0, height: 4 } },
});