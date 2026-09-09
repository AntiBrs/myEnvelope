import React, { useState, useEffect, useCallback,useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, Dimensions, RefreshControl, TouchableOpacity } from 'react-native';
import { BarChart, PieChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export default function StatisticsScreen({ route, navigation }) {
  const { apiBaseUrl } = route.params || {};
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState('this_month');
  const [stats, setStats] = useState({
    expensesByTime: [],
    earningsByTime: [],
    expensesByCategory: [],
    earningsByCategory: [],
    totalEarnings: 0,
    totalExpenses: 0,
    balance: 0
  });

    useLayoutEffect(() => {
      navigation.setOptions({
        headerBackTitle: 'Back',
        headerBackTitleVisible: true,
        title: 'Statistics',
      });
    }, [navigation]);

  const screenWidth = Dimensions.get('window').width;

  const expenseColors = ['#FF6384', '#FF4069', '#FF1F4D', '#E60026', '#CC0022'];
  const earningColors = ['#36A2EB', '#4BC0C0', '#42A5F5', '#26C6DA', '#66BB6A'];

  const fetchStatistics = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${apiBaseUrl}/user/statistics/${timeRange}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        navigation.navigate('Login');
        return;
      }

      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Could not load statistics');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [apiBaseUrl, timeRange]);

  useFocusEffect(
    useCallback(() => {
      fetchStatistics();
    }, [fetchStatistics])
  );

  // iOS kompatibilis dátumformázó
  const formatLabel = (period) => {
    if (!period) return "";
    try {
      const parts = period.split('-');
      if (parts.length === 3) { // YYYY-MM-DD
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthIdx = parseInt(parts[1], 10) - 1;
        return `${months[monthIdx]} ${parts[2]}`;
      }
      return period;
    } catch (e) {
      return period;
    }
  };


//kiveve
  const exportToCSV = async () => {
    try {
      let csvContent = "Type,Category,Amount,Period\n";
      stats.expensesByCategory.forEach(item => {
        csvContent += `Expense,${item.category},${item.total},${timeRange}\n`;
      });
      stats.earningsByCategory.forEach(item => {
        csvContent += `Earning,${item.category},${item.total},${timeRange}\n`;
      });

      const fileUri = FileSystem.documentDirectory + `export_${timeRange}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent);
      await Sharing.shareAsync(fileUri);
    } catch (error) {
      Alert.alert("Error", "Export failed");
    }
  };

  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    propsForLabels: { fontSize: 9 },
    barPercentage: 0.6,
  };

  // Adatok előkészítése a grafikonokhoz
  const expenseBarData = {
    labels: stats.expensesByTime.slice(-6).map(d => formatLabel(d.period)),
    datasets: [{ data: stats.expensesByTime.slice(-6).map(d => parseFloat(d.total) || 0) }]
  };

  const earningBarData = {
    labels: stats.earningsByTime.slice(-6).map(d => formatLabel(d.period)),
    datasets: [{ data: stats.earningsByTime.slice(-6).map(d => parseFloat(d.total) || 0) }]
  };

  const expensePieData = stats.expensesByCategory.filter(i => i.total > 0).map((item, index) => ({
    name: item.category,
    amount: parseFloat(item.total),
    color: expenseColors[index % expenseColors.length],
    legendFontColor: '#7F7F7F',
    legendFontSize: 11,
  }));

  const earningPieData = stats.earningsByCategory.filter(i => i.total > 0).map((item, index) => ({
    name: item.category,
    amount: parseFloat(item.total),
    color: earningColors[index % earningColors.length],
    legendFontColor: '#7F7F7F',
    legendFontSize: 11,
  }));

  if (isLoading) return <View style={styles.loading}><ActivityIndicator size="large" color="#007bff" /></View>;

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={fetchStatistics} />}>

      <View style={styles.timeRangeSelector}>
        {['today', 'this_week', 'this_month', 'this_year'].map((range) => (
          <TouchableOpacity
            key={range}
            style={[styles.rangeBtn, timeRange === range && styles.rangeBtnActive]}
            onPress={() => setTimeRange(range)}
          >
            <Text style={[styles.rangeText, timeRange === range && styles.rangeTextActive]}>{range.replace('_', ' ')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Earnings:</Text>
          <Text style={[styles.summaryValue, {color: '#2ecc71'}]}>${parseFloat(stats.totalEarnings).toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Expenses:</Text>
          <Text style={[styles.summaryValue, {color: '#e74c3c'}]}>${parseFloat(stats.totalExpenses).toFixed(2)}</Text>
        </View>
        <View style={[styles.summaryRow, styles.balanceRow]}>
          <Text style={styles.balanceLabel}>Net Balance:</Text>
          <Text style={[styles.balanceValue, {color: stats.balance >= 0 ? '#2c3e50' : '#e74c3c'}]}>${parseFloat(stats.balance).toFixed(2)}</Text>
        </View>
      </View>

      {/* KIADÁSOK GRAFIKON */}
      <Text style={styles.sectionTitle}>Expenses Trend</Text>
      {stats.expensesByTime.length > 0 ? (
        <BarChart
          data={expenseBarData}
          width={screenWidth - 30}
          height={220}
          chartConfig={{...chartConfig, color: (opacity = 1) => `rgba(231, 76, 60, ${opacity})` }}
          style={styles.chart}
          fromZero
          showValuesOnTopOfBars
        />
      ) : <Text style={styles.noData}>No expense data.</Text>}

      {expensePieData.length > 0 && (
        <PieChart
          data={expensePieData}
          width={screenWidth}
          height={180}
          chartConfig={chartConfig}
          accessor="amount"
          backgroundColor="transparent"
          paddingLeft="15"
        />
      )}

      {/* BEVÉTELEK GRAFIKON */}
      <Text style={[styles.sectionTitle, {marginTop: 30}]}>Earnings Trend</Text>
      {stats.earningsByTime.length > 0 ? (
        <BarChart
          data={earningBarData}
          width={screenWidth - 30}
          height={220}
          chartConfig={{...chartConfig, color: (opacity = 1) => `rgba(46, 204, 113, ${opacity})` }}
          style={styles.chart}
          fromZero
          showValuesOnTopOfBars
        />
      ) : <Text style={styles.noData}>No earnings data.</Text>}

      {earningPieData.length > 0 && (
        <PieChart
          data={earningPieData}
          width={screenWidth}
          height={180}
          chartConfig={chartConfig}
          accessor="amount"
          backgroundColor="transparent"
          paddingLeft="15"
        />
      )}

      <View style={{height: 60}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 15 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 15, paddingTop: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#007bff' },
  exportBtnText: { color: '#007bff', fontWeight: 'bold', marginLeft: 5 },
  timeRangeSelector: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  rangeBtn: { padding: 8, borderRadius: 15, backgroundColor: '#eee', flex: 1, marginHorizontal: 2, alignItems: 'center' },
  rangeBtnActive: { backgroundColor: '#007bff' },
  rangeText: { fontSize: 10, color: '#666', textTransform: 'capitalize' },
  rangeTextActive: { color: '#fff', fontWeight: 'bold' },
  summaryCard: { backgroundColor: '#fff', padding: 20, borderRadius: 15, elevation: 3, marginBottom: 20 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  summaryLabel: { fontSize: 14, color: '#7f8c8d' },
  summaryValue: { fontSize: 16, fontWeight: 'bold' },
  balanceRow: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, marginTop: 5 },
  balanceLabel: { fontSize: 16, fontWeight: 'bold' },
  balanceValue: { fontSize: 18, fontWeight: 'bold' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#34495e', marginBottom: 15, marginLeft: 5 },
  chart: { borderRadius: 15, marginVertical: 10, alignSelf: 'center' },
  noData: { textAlign: 'center', color: '#95a5a6', fontStyle: 'italic', marginVertical: 20 }
});