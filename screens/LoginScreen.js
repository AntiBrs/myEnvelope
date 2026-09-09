import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

export default function LoginScreen({ navigation }) {
  // Login és regisztrációs mezők állapota
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [registerVisible, setRegisterVisible] = useState(false);

  const [name, setName] = useState('');
  const [telephoneNumber, setTelephoneNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [secureCode, setSecureCode] = useState('');

  // Új felhasználó létrehozása
  const handleCreateUser = async () => {
    if (!username || !password || !name || !telephoneNumber || !dateOfBirth || !secureCode) {
      Alert.alert("Error", "Please fill every field.");
      return;
    }

    try {
      const age = new Date().getFullYear() - new Date(dateOfBirth).getFullYear();
      const response = await fetch(`${API_BASE_URL}/user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isAdult: age >= 18,
          secureCode,
          userName: username,
          password,
          name,
          telephoneNumber,
          dateOfBirth
        })
      });

      const data = await response.json();
      if (response.ok) {
        Alert.alert("Success", "Account created!");
        setRegisterVisible(false);
        // Mezők ürítése
        setName(""); setUsername(""); setPassword("");
        setTelephoneNumber(""); setDateOfBirth(""); setSecureCode("");
      } else {
        Alert.alert("Error", data.message || "Registration failed");
      }
    } catch (e) {
      Alert.alert("Error", "Cannot connect to server");
    }
  };

  // Bejelentkezés és JWT token mentése
  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: username, password: password }),
      });

      const data = await response.json();
      if (response.ok && data.token) {
        await AsyncStorage.setItem('userToken', data.token);
        await AsyncStorage.setItem('userId', String(data.userId));

        navigation.navigate('Home', {
          username: data.userName,
          userId: data.userId,
          apiBaseUrl: API_BASE_URL
        });
      } else {
        Alert.alert("Login Failed", data.message || "Invalid credentials");
      }
    } catch (error) {
      Alert.alert("Error", "Network error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Logó szekció */}
      <View style={styles.logoContainer}>
        <Text style={styles.logoMy}>my</Text>
        <Text style={styles.logoEnvelope}>Envelope</Text>
      </View>

      {/* Bejelentkezési űrlap */}
      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={handleLogin}
      />

      {isLoading ? (
        <ActivityIndicator size="large" color="#007bff" style={styles.loader} />
      ) : (
        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Login</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={() => setRegisterVisible(true)} style={{ marginTop: 20 }}>
        <Text style={styles.createAccountText}>Create account</Text>
      </TouchableOpacity>

      {/* Regisztrációs ablak */}
      <Modal visible={registerVisible} animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Text style={styles.modalTitle}>Create Account</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput style={styles.input} placeholder="John Doe" value={name} onChangeText={setName} />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput style={styles.input} placeholder="johndoe123" value={username} onChangeText={setUsername} autoCapitalize="none" />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput style={styles.input} placeholder="********" secureTextEntry value={password} onChangeText={setPassword} />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Telephone Number</Text>
              <TextInput style={styles.input} placeholder="+40 30 123 4567" value={telephoneNumber} onChangeText={setTelephoneNumber} keyboardType="phone-pad" />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Date of Birth</Text>
              <TextInput style={styles.input} placeholder="1990-01-01" value={dateOfBirth} onChangeText={setDateOfBirth} />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Secure Code </Text>
              <TextInput style={styles.input} placeholder="1234" keyboardType="numeric" maxLength={4} value={secureCode} onChangeText={setSecureCode} />
            </View>

            <TouchableOpacity style={styles.button} onPress={handleCreateUser}>
              <Text style={styles.buttonText}>Create Account</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, { backgroundColor: "#888", marginTop: 10 }]} onPress={() => setRegisterVisible(false)}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f5f5f5' },
  logoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 60 },
  logoMy: { fontSize: 36, fontWeight: '300', color: '#007bff' },
  logoEnvelope: { fontSize: 36, fontWeight: 'bold', color: '#0056b3' },
  input: {
    width: '100%',
    maxWidth: 300,
    padding: 15,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  formGroup: { width: '100%', maxWidth: 300, marginBottom: 10 },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginLeft: 2, marginTop: 5 },
  button: { backgroundColor: '#007bff', padding: 15, borderRadius: 8, marginTop: 10, width: '100%', maxWidth: 300, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  createAccountText: { color: "#007bff", fontSize: 16, fontWeight: "600" },
  modalScroll: { flexGrow: 1, alignItems: 'center', padding: 20, backgroundColor: "#f5f5f5", paddingTop: 60 },
  modalTitle: { fontSize: 28, fontWeight: "bold", marginBottom: 25, textAlign: "center", color: '#333' },
  loader: { marginTop: 30 }
});
