import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

const CATEGORIES = {
  expenses: ['Food', 'Transportation', 'Housing', 'Entertainment', 'Healthcare', 'Education', 'Shopping', 'Other'],
  earnings: ['Salary', 'Business', 'Investments', 'Gifts', 'Other']
};

export default function PlanningScreen({ route, navigation }) {
  const { apiBaseUrl } = route.params; // userId eltávolítva
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());

  const [comparison, setComparison] = useState([]);
  const [plan, setPlan] = useState({
    expenses: CATEGORIES.expenses.reduce((acc, cat) => ({ ...acc, [cat]: '0' }), {}),
    earnings: CATEGORIES.earnings.reduce((acc, cat) => ({ ...acc, [cat]: '0' }), {})
  });

  // Adatok lekérése, ha a dátum változik vagy az oldalra fókuszálunk
  const fetchData = useCallback(async () => {
    setLoading(true);
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth() + 1;
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        navigation.navigate('Login');
        return;
      }

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      // Összehasonlító adatok lekérése (userId kikerült az URL-ből)
      const compRes = await fetch(`${apiBaseUrl}/user/planning/compare?year=${year}&month=${month}`, { headers });

      if (compRes.status === 401) {
        navigation.navigate('Login');
        return;
      }
      const compData = await compRes.json();
      setComparison(compData);

      // Terv lekérése (userId kikerült az URL-ből)
      const planRes = await fetch(`${apiBaseUrl}/planning?year=${year}&month=${month}`, { headers });
      const planData = await planRes.json();
      if (planData.plan) setPlan(planData.plan);

    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to fetch planning data");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, viewDate, navigation]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${apiBaseUrl}/planning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          year: viewDate.getFullYear(),
          month: viewDate.getMonth() + 1,
          plan
        }),
      });

      if (response.status === 401) {
        navigation.navigate('Login');
        return;
      }

      setIsEditing(false);
      fetchData();
      Alert.alert("Success", "Plan saved!");
    } catch (e) {
      Alert.alert("Error", "Unable to save");
    } finally {
      setLoading(false);
    }
  };

  const changeMonth = (offset) => {
    const newDate = new Date(viewDate);
    newDate.setMonth(viewDate.getMonth() + offset);
    setViewDate(newDate);
  };

  const renderViewMode = () => (
    <View>
      <Text style={styles.subHeader}>Planned vs. Actual spending</Text>
      {comparison.length > 0 ? comparison.map(item => {
        const isOver = item.actual > item.planned && item.planned > 0;
        const isWarning = item.percent > 80 && item.percent <= 100;

        return (
          <View key={item.category} style={styles.compCard}>
            <View style={styles.row}>
              <Text style={styles.catName}>{item.category}</Text>
              {isOver && <Text style={styles.alertText}>⚠️ Overspent!</Text>}
              {isWarning && !isOver && <Text style={styles.warnText}>⚠️ Close to limit</Text>}
            </View>

            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, {
                width: `${Math.min(item.percent, 100)}%`,
                backgroundColor: isOver ? '#ff4444' : (isWarning ? '#ffbb33' : '#00C851')
              }]} />
            </View>

            <View style={styles.row}>
              <Text style={styles.smallText}>Planned: ${item.planned}</Text>
              <Text style={styles.smallText}>Actual: ${item.actual}</Text>
              <Text style={[styles.smallText, { fontWeight: 'bold' }]}>
                {isOver ? `Over: $${Math.abs(item.remaining)}` : `Left: $${item.remaining}`}
              </Text>
            </View>
          </View>
        );
      }) : <Text style={styles.noDataText}>No plan found for this month.</Text>}
    </View>
  );

  const renderEditMode = () => (
    <View style={styles.editSection}>
      <Text style={styles.subHeader}>Modify monthly plan</Text>
      {CATEGORIES.expenses.map(cat => (
        <View key={cat} style={styles.editRow}>
          <Text style={{flex: 1}}>{cat}</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={String(plan.expenses[cat] || 0)}
            onChangeText={(val) => setPlan({...plan, expenses: {...plan.expenses, [cat]: val}})}
          />
        </View>
      ))}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.btnText}>Save Plan</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditing(false)}>
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerNav}>
        <TouchableOpacity onPress={() => changeMonth(-1)}><Text style={styles.navArrow}>◀</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>
          {viewDate.getFullYear()}. {viewDate.toLocaleString('default', { month: 'long' })}
        </Text>
        <TouchableOpacity onPress={() => changeMonth(1)}><Text style={styles.navArrow}>▶</Text></TouchableOpacity>
      </View>

      {!isEditing && (
        <TouchableOpacity style={styles.editToggleBtn} onPress={() => setIsEditing(true)}>
          <Text style={styles.btnText}>✎ Modify Plan / New Monthly Plan</Text>
        </TouchableOpacity>
      )}

      {loading ? <ActivityIndicator size="large" color="#007bff" style={{marginTop: 50}} /> : (isEditing ? renderEditMode() : renderViewMode())}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f6', padding: 15 },
  headerNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, backgroundColor: '#fff', padding: 15, borderRadius: 10, elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  navArrow: { fontSize: 24, color: '#007bff', paddingHorizontal: 10 },
  subHeader: { fontSize: 16, fontWeight: 'bold', marginVertical: 10, color: '#555' },
  compCard: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 10, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  catName: { fontWeight: '600' },
  progressBarBg: { height: 12, backgroundColor: '#eee', borderRadius: 6, marginVertical: 8, overflow: 'hidden' },
  progressBarFill: { height: '100%' },
  smallText: { fontSize: 12, color: '#666' },
  alertText: { color: '#ff4444', fontWeight: 'bold', fontSize: 12 },
  warnText: { color: '#ffbb33', fontWeight: 'bold', fontSize: 12 },
  editToggleBtn: { backgroundColor: '#6f42c1', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 15 },
  saveBtn: { backgroundColor: '#28a745', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  cancelBtn: { padding: 15, alignItems: 'center' },
  cancelBtnText: { color: '#666', fontWeight: 'bold' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  editRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 10, marginBottom: 5, borderRadius: 5 },
  input: { borderBottomWidth: 1, borderColor: '#ccc', width: 80, textAlign: 'right', padding: 5 },
  noDataText: { textAlign: 'center', marginTop: 20, color: '#999', fontStyle: 'italic' }
});