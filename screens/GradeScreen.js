import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function GradeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Grade Page</Text>
      <Text style={styles.description}>
        This page shows an evaluation or grading system for your expenses.
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
