import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ComparisonScreen({ route, navigation }) {
  const { apiBaseUrl } = route.params;
  const [loading, setLoading] = useState(true);

  const [planning, setPlanning] = useState({ expenses: {} });
  const [actual, setActual] = useState({ expensesByCategory: [] });
  const [predictions, setPredictions] = useState(null);

  // Csak a kiadási kategóriák
  const categories = ['Food', 'Transportation', 'Housing', 'Entertainment', 'Healthcare', 'Education', 'Shopping', 'Other'];

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

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

      // Csak a szükséges adatokat kérjük le
      const [planRes, predRes, statRes] = await Promise.all([
        fetch(`${apiBaseUrl}/planning?year=${year}&month=${month}`, { headers }),
        fetch(`${apiBaseUrl}/user/predictions`, { headers }),
        fetch(`${apiBaseUrl}/user/statistics/this_month`, { headers })
      ]);

      if (planRes.status === 401 || predRes.status === 401 || statRes.status === 401) {
        navigation.navigate('Login');
        return;
      }

      const planData = await planRes.json();
      const predData = await predRes.json();
      const statData = await statRes.json();

      setPlanning(planData.plan || { expenses: {} });
      setPredictions(predData);
      setActual(statData || { expensesByCategory: [] });

    } catch (error) {
      console.error("Error fetching comparison data:", error);
      Alert.alert("Error", "Could not load comparison data.");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, navigation]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const getValues = (cat) => {
    // 1. TERVEZETT (Planned)
    const planned = parseFloat(planning.expenses?.[cat] || 0);

    // 2. TÉNYLEGES (Actual)
    const actualItem = actual.expensesByCategory?.find(i => i.category === cat);
    const actualVal = actualItem ? parseFloat(actualItem.total) : 0;

    // 3. BECSÜLT (Predicted)
    const predArray = predictions?.expensePredictionsByCategory ? predictions.expensePredictionsByCategory[cat] : null;
    const predVal = (predArray && predArray.length > 0)
      ? parseFloat(predArray[0].predictedAmount || 0)
      : 0;

    return { planned, actual: actualVal, predicted: predVal };
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAllData} tintColor="#6f42c1" />}
    >
      <Text style={styles.pageTitle}>Expense Budget Analysis</Text>

      {loading && !predictions ? (
        <ActivityIndicator size="large" color="#6f42c1" style={{ marginTop: 50 }} />
      ) : (
        categories.map(cat => {
          const { planned, actual, predicted } = getValues(cat);
          // Meghatározzuk a legmagasabb értéket a skálázáshoz
          const maxVal = Math.max(planned, actual, predicted, 1);

          return (
            <View key={cat} style={styles.card}>
              <Text style={styles.catTitle}>{cat}</Text>

              {/* Tervezett sáv */}
              <View style={styles.barRow}>
                <Text style={styles.barLabel}>Plan:</Text>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${(planned/maxVal)*100}%`, backgroundColor: '#6f42c1' }]} />
                </View>
                <Text style={styles.barValue}>{Math.round(planned).toLocaleString()} $</Text>
              </View>

              {/* Tényleges sáv */}
              <View style={styles.barRow}>
                <Text style={styles.barLabel}>Actual:</Text>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${(actual/maxVal)*100}%`, backgroundColor: '#007bff' }]} />
                </View>
                <Text style={styles.barValue}>{Math.round(actual).toLocaleString()} $</Text>
              </View>

              {/* AI Predikció sáv */}
              <View style={styles.barRow}>
                <Text style={styles.barLabel}>Pred:</Text>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${(predicted/maxVal)*100}%`, backgroundColor: '#17a2b8' }]} />
                </View>
                <Text style={styles.barValue}>{Math.round(predicted).toLocaleString()} $</Text>
              </View>
            </View>
          );
        })
      )}

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, {backgroundColor: '#6f42c1'}]}/>
          <Text style={styles.legendText}>Planned Budget</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, {backgroundColor: '#007bff'}]}/>
          <Text style={styles.legendText}>Current Spending</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, {backgroundColor: '#17a2b8'}]}/>
          <Text style={styles.legendText}>AI Prediction</Text>
        </View>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', padding: 15 },
  pageTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#333', paddingTop: 20 },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 15, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 },
  catTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, color: '#444' },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  barLabel: { width: 55, fontSize: 12, color: '#888', fontWeight: '600' },
  barBg: { flex: 1, height: 12, backgroundColor: '#f0f0f0', borderRadius: 6, overflow: 'hidden', marginRight: 10 },
  barFill: { height: '100%', borderRadius: 6 },
  barValue: { width: 75, fontSize: 12, fontWeight: 'bold', textAlign: 'right', color: '#333' },
  legend: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  legendText: { fontSize: 13, color: '#666' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 }
});