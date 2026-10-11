import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { setUnauthorizedHandler } from './config/api';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from './screens/HomeScreen';
import AddExpenseScreen from './screens/AddExpenseScreen';
import LoginScreen from './screens/LoginScreen';
import StatisticsScreen from './screens/StatisticsScreen';
import PlanningScreen from './screens/PlanningScreen';
import PredictionScreen from './screens/PredictionScreen';
import ComparisonScreen from './screens/ComparisonScreen';
import ScannerScreen from './screens/ScannerScreen';
import ChatScreen from './screens/ChatScreen';

const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef();
setUnauthorizedHandler(() => {
  if (navigationRef.isReady()) {
    navigationRef.resetRoot({ index: 0, routes: [{ name: 'Login' }] });
  }
});

export default function App() {
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Login"
        // Expo locks body scrolling on web. Keep cards inside the viewport so
        // each screen's ScrollView/FlatList owns scrolling instead of the body.
        screenOptions={Platform.OS === 'web' ? { cardStyle: { flex: 1 } } : undefined}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'MyEnvelope' }}
        />
         <Stack.Screen
                  name="StatisticsScreen"
                  component={StatisticsScreen}
                  options={{ title: 'Statistics' }}
                />
        <Stack.Screen
          name="AddExpense"
          component={AddExpenseScreen}
          options={{ title: 'Add Expense/Income' }}
        />
        <Stack.Screen
          name="Planning"
          component={PlanningScreen}
          options={{ title: 'Planning and Budget' }}
        />
        <Stack.Screen
          name="Predictions"
          component={PredictionScreen}
          options={{ title: 'Predictions' }}
        />
        <Stack.Screen
          name="Comparison"
          component={ComparisonScreen}
          options={{ title: 'Compare and Overview' }}
        />
        <Stack.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{ title: 'AI Receipt Scanner' }}
        />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ title: 'Login', headerShown: false }}
        />
        <Stack.Screen name="Chat" component={ChatScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
