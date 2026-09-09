import React, { useState, useEffect, useCallback,useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function PredictionScreen({ route, navigation }) {
  const { apiBaseUrl } = route.params;
  const [loading, setLoading] = useState(true);
  const [rawPredictions, setRawPredictions] = useState(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackTitle: 'Back',
      title: '',
    });
  }, [navigation]);

  const fetchPredictions = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        navigation.navigate('Login');
        return;
      }

      const response = await fetch(`${apiBaseUrl}/user/predictions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        navigation.navigate('Login');
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setRawPredictions(data);
    } catch (error) {
      console.error("Error fetching predictions:", error);
      Alert.alert("Error", "Could not load AI predictions.");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, navigation]);

  useEffect(() => {
    fetchPredictions();
  }, [fetchPredictions]);

  const renderPredictionList = (title, categoryData, color) => {
    if (!categoryData) return null;

    const categories = Object.keys(categoryData);

    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: color }]}>{title}</Text>
        {categories.length === 0 ? (
          <Text style={styles.noData}>No data available for predictions.</Text>
        ) : (
          categories.map((catName) => {
            const prediction = categoryData[catName][0];
            return (
              <View key={catName} style={styles.predictionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.categoryText}>{catName}</Text>
                  <Text style={styles.subcategoryText}>Forecast for {prediction?.month || 'Next month'}</Text>
                </View>
                <Text style={[styles.amountText, { color: color }]}>
                  {parseFloat(prediction?.predictedAmount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})} $
                </Text>
              </View>
            );
          })
        )}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPredictions} tintColor="#007bff" />}
    >
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Financial Forecast</Text>
        <Text style={styles.headerSub}>AI-based predictions for your categories.</Text>
      </View>

      {loading && !rawPredictions ? (
        <ActivityIndicator size="large" color="#007bff" style={{ marginTop: 50 }} />
      ) : (
        <>
          {renderPredictionList('Expected Expenses', rawPredictions?.expensePredictionsByCategory, '#d9534f')}
          {renderPredictionList('Expected Earnings', rawPredictions?.earningPredictionsByCategory, '#5cb85c')}
        </>
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 15 },
  headerCard: { backgroundColor: '#fff', padding: 20, borderRadius: 15, marginBottom: 20, elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  headerSub: { fontSize: 14, color: '#666', marginTop: 5 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },
  predictionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  categoryText: { fontSize: 16, fontWeight: '600', color: '#444' },
  subcategoryText: { fontSize: 12, color: '#888' },
  amountText: { fontSize: 16, fontWeight: 'bold' },
  noData: { fontStyle: 'italic', color: '#999', textAlign: 'center', marginVertical: 10 }
});