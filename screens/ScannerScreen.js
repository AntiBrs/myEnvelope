import React, { useState, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, ScrollView, TextInput, Modal, FlatList } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Kategória és alkategória struktúra definiálása
const EXPENSE_STRUCTURE = {
  'Food': ['Groceries', 'Restaurants', 'Takeaway'],
  'Transportation': ['Fuel', 'Public Transport', 'Taxi', 'Maintenance'],
  'Housing': ['Rent', 'Utilities', 'Mortgage', 'Maintenance'],
  'Entertainment': ['Movies', 'Concerts', 'Hobbies', 'Subscriptions'],
  'Healthcare': ['Medicines', 'Doctor', 'Insurance', 'Dental'],
  'Education': ['Tuition', 'Books', 'Courses', 'Supplies'],
  'Shopping': ['Clothing', 'Electronics', 'Home', 'Gifts'],
  'Other': ['Other']
};

const CATEGORIES = Object.keys(EXPENSE_STRUCTURE);

export default function ScannerScreen({ route, navigation }) {
  const { apiBaseUrl } = route.params;

  // Állapotok: fotó, betöltés, szerkesztési mód és választók
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showSubCatPicker, setShowSubCatPicker] = useState(false);

  // AI által felismert vagy kézzel módosított adatok
  const [editedData, setEditedData] = useState({
    amount: '',
    date: '',
    vendor: '',
    subcategory: 'Other',
    category: 'Other'
  });

  // Navigációs fejléc testreszabása
  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackTitle: 'Back',
      title: '',
    });
  }, [navigation]);

  // Kép kiválasztása galériából vagy készítése kamerával
  const handleImagePicker = async (type) => {
    let result;
    const options = { allowsEditing: true, aspect: [4, 3], quality: 0.8 };

    if (type === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return Alert.alert("Error", "No camera access");
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return Alert.alert("Error", "No gallery access");
      result = await ImagePicker.launchImageLibraryAsync(options);
    }

    if (!result.canceled) {
      setPhoto(result.assets[0]);
      setIsEditing(false);
    }
  };

  // Kép küldése a backendnek AI elemzésre
  const analyzeInvoice = async () => {
    if (!photo) return;
    setLoading(true);

    try {
      const token = await AsyncStorage.getItem('userToken');
      const formData = new FormData();
      formData.append('invoice', {
        uri: photo.uri,
        type: 'image/jpeg',
        name: 'invoice.jpg',
      });

      const response = await fetch(`${apiBaseUrl}/invoices/analyze`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        navigation.navigate('Login');
        return;
      }

      const result = await response.json();

      // Eredmények feldolgozása és validálása a kategória struktúrához
      if (response.ok && result.records && result.records.length > 0) {
        const first = result.records[0];
        const aiCat = CATEGORIES.includes(first.category) ? first.category : 'Other';
        const aiSub = EXPENSE_STRUCTURE[aiCat].includes(first.subcategory) ? first.subcategory : EXPENSE_STRUCTURE[aiCat][0];

        setEditedData({
          amount: String(first.amount || ''),
          date: first.date || new Date().toISOString().split('T')[0],
          vendor: first.vendor || first.subcategory || '',
          category: aiCat,
          subcategory: aiSub
        });
        setIsEditing(true);
      } else {
        Alert.alert("Notice", "AI couldn't read the data. Please enter manually.");
        setEditedData({
          amount: '',
          date: new Date().toISOString().split('T')[0],
          vendor: '',
          category: 'Other',
          subcategory: 'Other'
        });
        setIsEditing(true);
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Analysis failed. Check backend.");
    } finally {
      setLoading(false);
    }
  };

  // Ellenőrzött adatok végleges mentése
  const saveFinalExpense = async () => {
    if (!editedData.amount || !editedData.date) {
      Alert.alert("Error", "Amount and Date are required!");
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${apiBaseUrl}/expenses/manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...editedData,
          amount: parseFloat(editedData.amount)
        }),
      });

      if (response.status === 401) {
        navigation.navigate('Login');
        return;
      }

      if (response.ok) {
        Alert.alert("Success", "Expense saved!", [{ text: "OK", onPress: () => navigation.goBack() }]);
      } else {
        const err = await response.json();
        Alert.alert("Error", err.error || "Failed to save.");
      }
    } catch (error) {
      Alert.alert("Error", "Connection failed during save.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>AI Invoice Scanner</Text>
      </View>

      {/* Képválasztó és elemzés indítása nézet */}
      {!isEditing ? (
        <>
          <View style={styles.previewCard}>
            {photo ? <Image source={{ uri: photo.uri }} style={styles.previewImage} /> :
            <Text style={{color: '#999'}}>No image selected</Text>}
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleImagePicker('library')}><Text>Gallery</Text></TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleImagePicker('camera')}><Text>Camera</Text></TouchableOpacity>
          </View>
          {photo && (
            <TouchableOpacity style={styles.mainBtn} onPress={analyzeInvoice} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.mainBtnText}>Analyze Receipt</Text>}
            </TouchableOpacity>
          )}
        </>
      ) : (
        /* Adatellenőrző és szerkesztő űrlap */
        <View style={styles.editCard}>
          <Text style={styles.editTitle}>Verify Data</Text>

          <Text style={styles.label}>Category</Text>
          <TouchableOpacity style={styles.pickerTrigger} onPress={() => setShowCatPicker(true)}>
            <Text style={styles.pickerTriggerText}>{editedData.category}</Text>
            <Text style={{color: '#888'}}>▼</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Subcategory</Text>
          <TouchableOpacity style={styles.pickerTrigger} onPress={() => setShowSubCatPicker(true)}>
            <Text style={styles.pickerTriggerText}>{editedData.subcategory}</Text>
            <Text style={{color: '#888'}}>▼</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Vendor / Note</Text>
          <TextInput
            style={styles.input}
            value={editedData.vendor}
            onChangeText={(t) => setEditedData({...editedData, vendor: t})}
            placeholder="e.g. Walmart, Shell..."
          />

          <Text style={styles.label}>Amount ($)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={editedData.amount}
            onChangeText={(t) => setEditedData({...editedData, amount: t})}
          />

          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={editedData.date}
            onChangeText={(t) => setEditedData({...editedData, date: t})}
          />

          <TouchableOpacity style={styles.mainBtn} onPress={saveFinalExpense} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.mainBtnText}>Confirm & Save</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={{marginTop: 15}} onPress={() => setIsEditing(false)}>
            <Text style={{color: 'red', textAlign: 'center'}}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Kategória választó Modal */}
      <Modal visible={showCatPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Category</Text>
            <FlatList
              data={CATEGORIES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setEditedData({
                      ...editedData,
                      category: item,
                      subcategory: EXPENSE_STRUCTURE[item][0]
                    });
                    setShowCatPicker(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Alkategória választó Modal */}
      <Modal visible={showSubCatPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Subcategory</Text>
            <FlatList
              data={EXPENSE_STRUCTURE[editedData.category] || []}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setEditedData({...editedData, subcategory: item});
                    setShowSubCatPicker(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f0f2f5', padding: 20 },
  headerCard: { backgroundColor: '#fff', padding: 20, borderRadius: 15, marginBottom: 20, elevation: 2 },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  previewCard: { width: '100%', height: 250, backgroundColor: '#fff', borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginBottom: 20, overflow: 'hidden' },
  previewImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  secondaryBtn: { flex: 0.48, backgroundColor: '#e0e0e0', padding: 15, borderRadius: 12, alignItems: 'center' },
  mainBtn: { backgroundColor: '#28a745', padding: 18, borderRadius: 12, alignItems: 'center' },
  mainBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  editCard: { backgroundColor: '#fff', padding: 20, borderRadius: 15, elevation: 3 },
  editTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  label: { fontSize: 12, color: '#666', marginBottom: 5, fontWeight: 'bold' },
  input: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 15 },
  pickerTrigger: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 15 },
  pickerTriggerText: { fontSize: 16, color: '#333' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: '#fff', borderRadius: 15, padding: 20, maxHeight: '70%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  modalItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalItemText: { fontSize: 16, textAlign: 'center' }
});