import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

export default function HomeScreen({ route, navigation }) {
  const { username, apiBaseUrl } = route.params || {};

  // Állapotok: adatok, betöltés és beállítások láthatósága
  const [userData, setUserData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const version = "1.0.4-beta";

  // Pénzügyi összesítő lekérése a backendről
  const fetchUserData = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${apiBaseUrl}/user/summary`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // Ha a token lejárt, visszairányítás a bejelentkezéshez
      if (response.status === 401) {
        await AsyncStorage.multiRemove(['userToken', 'userId']);
        navigation.navigate('Login');
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch user data');
      const data = await response.json();
      setUserData(data);
    } catch (error) {
      console.error('Fetch error:', error);
      Alert.alert("Error", "Could not connect to server.");
    } finally {
      setIsLoading(false);
    }
  };

  // Adatok frissítése minden alkalommal, amikor a képernyő fókuszba kerül
  useFocusEffect(
    useCallback(() => {
      fetchUserData();
    }, [])
  );

  // Alapértelmezett navigációs fejléc elrejtése
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useEffect(() => {
    fetchUserData();
  }, []);

  // Számok formázása két tizedesjegyre
  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? "0.00" : num.toFixed(2);
  };

  // Kijelentkezés: token törlése és navigáció alaphelyzetbe állítása
  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['userToken', 'userId']);
    setSettingsVisible(false);
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  // Újrafelhasználható menügomb komponens
  const MenuButton = ({ title, icon, color, onPress, subtitle }) => (
    <TouchableOpacity style={[styles.menuCard, { borderLeftColor: color }]} onPress={onPress}>
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={styles.menuTextContainer}>
        <Text style={styles.menuTitle}>{title}</Text>
        {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#ccc" />
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading your finances...</Text>
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      {/* Egyedi fejléc logóval és beállítások gombbal */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoMy}>my</Text>
          <Text style={styles.logoEnvelope}>Envelope</Text>
        </View>
        <TouchableOpacity onPress={() => setSettingsVisible(true)} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={26} color="#333" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.welcomeSection}>
            <Text style={styles.welcomeLabel}>Welcome back,</Text>
            <Text style={styles.usernameText}>{username}!</Text>
        </View>

        {/* Összesített egyenleg kártya */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Current Balance</Text>
          <Text style={styles.balanceText}>${formatCurrency(userData?.balance)}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="arrow-up-circle" size={20} color="#28a745" />
              <Text style={styles.statLabel}>Earnings</Text>
              <Text style={styles.statValue}>${formatCurrency(userData?.totalEarnings)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statItem}>
              <Ionicons name="arrow-down-circle" size={20} color="#dc3545" />
              <Text style={styles.statLabel}>Expenses</Text>
              <Text style={styles.statValue}>${formatCurrency(userData?.totalExpenses)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Actions</Text>

        {/* Navigációs menüpontok */}
        <MenuButton
          title="Scan Receipt"
          subtitle="AI-powered expense entry"
          icon="camera"
          color="#28a745"
          onPress={() => navigation.navigate('Scanner', { apiBaseUrl })}
        />

        <MenuButton
          title="Add Transaction"
          subtitle="Manual entry"
          icon="add-circle"
          color="#007bff"
          onPress={() => navigation.navigate('AddExpense', { apiBaseUrl })}
        />

        <MenuButton
          title="Statistics"
          subtitle="Charts and reports"
          icon="bar-chart"
          color="#ffc107"
          onPress={() => navigation.navigate('StatisticsScreen', { apiBaseUrl })}
        />

        <MenuButton
          title="Planning & Budget"
          subtitle="Set your limits"
          icon="calendar"
          color="#6f42c1"
          onPress={() => navigation.navigate('Planning', { apiBaseUrl })}
        />

        <MenuButton
          title="Compare & Overview"
          subtitle="Monthly analysis"
          icon="git-compare"
          color="#17a2b8"
          onPress={() => navigation.navigate('Comparison', { apiBaseUrl })}
        />

        <MenuButton
          title="AI Predictions"
          subtitle="Future spending trends"
          icon="bulb"
          color="#fd7e14"
          onPress={() => navigation.navigate('Predictions', { apiBaseUrl })}
        />

        <MenuButton
          title="Ask Stati"
          subtitle="Your AI Financial Assistant"
          icon="chatbubble-ellipses"
          color="#e83e8c"
          onPress={() => navigation.navigate('Chat', { apiBaseUrl })}
        />
      </ScrollView>

      {/* Beállítások Modal (Verzióinfó és Kijelentkezés) */}
      <Modal visible={settingsVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeader}>Settings</Text>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>App Version</Text>
              <Text style={styles.versionText}>{version}</Text>
            </View>

            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={20} color="#fff" />
              <Text style={styles.logoutBtnText}>Logout</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setSettingsVisible(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#f8f9fa' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#666' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 25,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: '#fff',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoMy: {
    fontSize: 24,
    fontWeight: '300',
    color: '#007bff',
  },
  logoEnvelope: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0056b3',
  },
  welcomeSection: {
    marginBottom: 20,
    paddingHorizontal: 5,
  },
  welcomeLabel: { fontSize: 14, color: '#888' },
  usernameText: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  settingsBtn: { padding: 5 },
  scrollContent: { padding: 20 },
  summaryCard: {
    backgroundColor: '#007bff',
    borderRadius: 20,
    padding: 25,
    elevation: 8,
    shadowColor: '#007bff',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    marginBottom: 25,
  },
  summaryTitle: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: 5 },
  balanceText: { color: '#fff', fontSize: 32, fontWeight: 'bold', marginBottom: 20 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 15, padding: 15 },
  statItem: { alignItems: 'center', flex: 1 },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  statValue: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  divider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', height: '100%' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333', marginLeft: 5 },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 15,
    marginBottom: 12,
    borderLeftWidth: 5,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  iconContainer: { width: 45, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  menuTextContainer: { flex: 1 },
  menuTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  menuSubtitle: { fontSize: 12, color: '#999', marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 30, alignItems: 'center' },
  modalHeader: { fontSize: 20, fontWeight: 'bold', marginBottom: 25 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  settingLabel: { fontSize: 16, color: '#333' },
  versionText: { color: '#888', fontWeight: '500' },
  logoutBtn: { flexDirection: 'row', backgroundColor: '#dc3545', width: '100%', padding: 15, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginTop: 30 },
  logoutBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 10, fontSize: 16 },
  closeBtn: { marginTop: 20, padding: 10 },
  closeBtnText: { color: '#007bff', fontWeight: '600' }
});
