import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Modal,
  ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AddExpenseScreen({ route, navigation }) {
  const { apiBaseUrl } = route.params || {};

  // Állapotok kezelése (típus, összeg, dátum, kategóriák)
  const [activeTab, setActiveTab] = useState('expenses');
  const [amount, setAmount] = useState('');
  const [dateString, setDateString] = useState('');
  const [categories, setCategories] = useState({});
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false);

  // Mai dátum beállítása indításkor
  useEffect(() => {
    const today = new Date();
    const formattedDate = formatDateForAPI(today);
    setDateString(formattedDate);
  }, []);

  // Dátum formázása YYYY-MM-DD alakúra
  const formatDateForAPI = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Dátum formátum és jövőbeli dátum ellenőrzése
  const isValidDate = (dateStr) => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return date instanceof Date && !isNaN(date) && date <= today;
  };

  // Gyorsdátum gombok logikája
  const setQuickDate = (daysAgo) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    setDateString(formatDateForAPI(date));
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Kategóriák lekérése a backendről
  const fetchCategories = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${apiBaseUrl}/categories`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        navigation.navigate('Login');
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch categories');

      const data = await response.json();
      setCategories(data);

      // Alapértelmezett kategória beállítása
      if (data[activeTab] && Object.keys(data[activeTab]).length > 0) {
        const firstCategory = Object.keys(data[activeTab])[0];
        setSelectedCategory(firstCategory);
        setSelectedSubcategory(data[activeTab][firstCategory][0]);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      Alert.alert('Error', 'Could not load categories');
    } finally {
      setCategoriesLoading(false);
    }
  };

  // Váltás Kiadás és Bevétel fülek között
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setAmount('');
    if (categories[tab] && Object.keys(categories[tab]).length > 0) {
      const firstCategory = Object.keys(categories[tab])[0];
      setSelectedCategory(firstCategory);
      setSelectedSubcategory(categories[tab][firstCategory][0]);
    }
  };

  // Főkategória választás és alkat. frissítése
  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    if (categories[activeTab][category] && categories[activeTab][category].length > 0) {
      setSelectedSubcategory(categories[activeTab][category][0]);
    }
    setShowCategoryModal(false);
  };

  const handleSubcategoryChange = (subcategory) => {
    setSelectedSubcategory(subcategory);
    setShowSubcategoryModal(false);
  };

  // Tranzakció mentése a szerverre
  const handleSave = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (!dateString || !isValidDate(dateString)) {
      Alert.alert('Error', 'Please enter a valid date');
      return;
    }
    if (!selectedCategory || !selectedSubcategory) {
      Alert.alert('Error', 'Please select category and subcategory');
      return;
    }

    setIsLoading(true);

    try {
      const token = await AsyncStorage.getItem('userToken');
      const endpoint = activeTab === 'expenses' ? '/expenses' : '/earnings';

      const requestData = {
        date: dateString,
        amount: parseFloat(amount),
        category: selectedCategory,
        subcategory: selectedSubcategory
      };

      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (response.status === 401) {
        navigation.navigate('Login');
        return;
      }

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      Alert.alert(
        'Success',
        `${activeTab === 'expenses' ? 'Expense' : 'Income'} added successfully!`,
        [{ text: 'OK', onPress: () => setAmount('') }]
      );

    } catch (error) {
      console.error('Error saving:', error);
      Alert.alert('Error', 'Could not save the transaction');
    } finally {
      setIsLoading(false);
    }
  };

  // Segédfüggvények a listákhoz
  const getCurrentCategories = () => categories[activeTab] ? Object.keys(categories[activeTab]) : [];
  const getCurrentSubcategories = () => categories[activeTab] && categories[activeTab][selectedCategory] ? categories[activeTab][selectedCategory] : [];

  const QuickDateButton = ({ label, daysAgo }) => (
    <TouchableOpacity style={styles.quickDateButton} onPress={() => setQuickDate(daysAgo)}>
      <Text style={styles.quickDateButtonText}>{label}</Text>
    </TouchableOpacity>
  );

  if (categoriesLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text>Loading categories...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Add Transaction</Text>

      {/* Típus választó fülek */}
      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, activeTab === 'expenses' && styles.activeTab]} onPress={() => handleTabChange('expenses')}>
          <Text style={[styles.tabText, activeTab === 'expenses' && styles.activeTabText]}>Expense</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'earnings' && styles.activeTab]} onPress={() => handleTabChange('earnings')}>
          <Text style={[styles.tabText, activeTab === 'earnings' && styles.activeTabText]}>Income</Text>
        </TouchableOpacity>
      </View>

      {/* Összeg beviteli mező */}
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Amount ($)</Text>
        <TextInput style={styles.amountInput} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="numeric" placeholderTextColor="#999" />
      </View>

      {/* Dátum mező és gyorsgombok */}
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput style={[styles.dateInput, !isValidDate(dateString) && dateString !== '' && styles.invalidInput]} value={dateString} onChangeText={setDateString} placeholder="2024-01-15" placeholderTextColor="#999" />
        <View style={styles.quickDateContainer}>
          <QuickDateButton label="Today" daysAgo={0} />
          <QuickDateButton label="Yesterday" daysAgo={1} />
          <QuickDateButton label="3 days ago" daysAgo={3} />
          <QuickDateButton label="1 week ago" daysAgo={7} />
          <QuickDateButton label="1 month ago" daysAgo={30} />
        </View>
      </View>

      {/* Kategória választó gombok */}
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Category</Text>
        <TouchableOpacity style={styles.selectButton} onPress={() => setShowCategoryModal(true)}>
          <Text style={styles.selectButtonText}>{selectedCategory || 'Select Category'}</Text>
          <Text style={styles.selectButtonArrow}>▼</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Subcategory</Text>
        <TouchableOpacity style={styles.selectButton} onPress={() => setShowSubcategoryModal(true)}>
          <Text style={styles.selectButtonText}>{selectedSubcategory || 'Select Subcategory'}</Text>
          <Text style={styles.selectButtonArrow}>▼</Text>
        </TouchableOpacity>
      </View>

      {/* Mentés gomb */}
      <TouchableOpacity style={[styles.saveButton, { backgroundColor: activeTab === 'expenses' ? '#ff4444' : '#00aa00' }]} onPress={handleSave} disabled={isLoading}>
        {isLoading ? <ActivityIndicator color="white" /> : <Text style={styles.saveButtonText}>Add {activeTab === 'expenses' ? 'Expense' : 'Income'}</Text>}
      </TouchableOpacity>

      {/* Kategória választó Modal */}
      <Modal visible={showCategoryModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Category</Text>
            <ScrollView style={styles.modalList}>
              {getCurrentCategories().map((category, index) => (
                <TouchableOpacity key={index} style={[styles.modalItem, selectedCategory === category && styles.selectedModalItem]} onPress={() => handleCategoryChange(category)}>
                  <Text style={[styles.modalItemText, selectedCategory === category && styles.selectedModalItemText]}>{category}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowCategoryModal(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Alkategória választó Modal */}
      <Modal visible={showSubcategoryModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Subcategory</Text>
            <ScrollView style={styles.modalList}>
              {getCurrentSubcategories().map((subcategory, index) => (
                <TouchableOpacity key={index} style={[styles.modalItem, selectedSubcategory === subcategory && styles.selectedModalItem]} onPress={() => handleSubcategoryChange(subcategory)}>
                  <Text style={[styles.modalItemText, selectedSubcategory === subcategory && styles.selectedModalItemText]}>{subcategory}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowSubcategoryModal(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 30, color: '#333' },
  tabContainer: { flexDirection: 'row', marginBottom: 30, borderRadius: 25, backgroundColor: '#e9ecef', padding: 4 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 20, alignItems: 'center' },
  activeTab: { backgroundColor: '#007bff', elevation: 3 },
  tabText: { fontSize: 16, fontWeight: '600', color: '#666' },
  activeTabText: { color: 'white' },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#333' },
  amountInput: { backgroundColor: 'white', borderRadius: 12, padding: 15, fontSize: 18, borderWidth: 1, borderColor: '#ddd' },
  dateInput: { backgroundColor: 'white', borderRadius: 12, padding: 15, fontSize: 16, borderWidth: 1, borderColor: '#ddd' },
  invalidInput: { borderColor: '#ff4444', backgroundColor: '#fff5f5' },
  quickDateContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 8 },
  quickDateButton: { backgroundColor: '#e9ecef', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  quickDateButtonText: { fontSize: 12, color: '#666', fontWeight: '500' },
  selectButton: { backgroundColor: 'white', borderRadius: 12, padding: 15, borderWidth: 1, borderColor: '#ddd', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectButtonText: { fontSize: 16, color: '#333' },
  selectButtonArrow: { fontSize: 14, color: '#666' },
  saveButton: { borderRadius: 12, padding: 18, alignItems: 'center', marginTop: 20 },
  saveButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', borderRadius: 20, padding: 20, width: '80%', maxHeight: '70%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#333' },
  modalList: { maxHeight: 300 },
  modalItem: { padding: 15, borderRadius: 10, marginBottom: 5 },
  selectedModalItem: { backgroundColor: '#007bff' },
  modalItemText: { fontSize: 16, color: '#333' },
  selectedModalItemText: { color: 'white' },
  modalCloseButton: { backgroundColor: '#6c757d', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 15 },
  modalCloseButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});