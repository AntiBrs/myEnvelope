import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ListViewScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>List View</Text>
      <Text style={styles.description}>
        This screen will display a list of items, such as expenses or tasks.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
  },
});
