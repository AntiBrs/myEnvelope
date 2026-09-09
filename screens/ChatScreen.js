import React, { useState, useRef, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ChatScreen({ route, navigation }) {
  const { apiBaseUrl } = route.params;

  // Alapértelmezett fejléc elrejtése
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // Üzenetek, beviteli mező és gépelés állapot kezelése
  const [messages, setMessages] = useState([
    { id: '1', text: 'Hi! I am Stati, your financial assistant. How can I help you today?', sender: 'bot' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef();

  // Üzenet küldése a backendnek
  const sendMessage = async () => {
    if (inputText.trim() === '') return;

    // Felhasználói üzenet hozzáadása a listához
    const userMsg = { id: Date.now().toString(), text: inputText, sender: 'user' };
    setMessages(prev => [...prev, userMsg]);
    const currentInput = inputText;
    setInputText('');
    setIsTyping(true);

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        navigation.navigate('Login');
        return;
      }

      // API hívás az AI válaszért
      const response = await fetch(`${apiBaseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          question: currentInput
        }),
      });

      if (response.status === 401) {
        navigation.navigate('Login');
        return;
      }

      const data = await response.json();

      // Válasz szöveg kinyerése a különböző lehetséges formátumokból
      let botText = "";
      if (Array.isArray(data)) {
        botText = data[0].output || data[0].response || data[0].text || JSON.stringify(data[0]);
      } else {
        botText = data.output || data.response || data.text || (typeof data === 'string' ? data : JSON.stringify(data));
      }

      // Bot válasz hozzáadása a listához
      const botMsg = { id: (Date.now() + 1).toString(), text: botText, sender: 'bot' };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        text: "Sorry, I'm having trouble connecting to my brain right now.",
        sender: 'bot'
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  // Egy üzenetbuborék megjelenítése
  const renderMessage = ({ item }) => (
    <View style={[styles.messageBubble, item.sender === 'user' ? styles.userBubble : styles.botBubble]}>
      {item.sender === 'bot' && (
        <View style={styles.botHeader}>
          <Ionicons name="glasses" size={16} color="#007bff" />
          <Text style={styles.botName}>Stati</Text>
        </View>
      )}
      <Text style={[styles.messageText, item.sender === 'user' ? styles.userText : styles.botText]}>
        {item.text}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Egyedi fejléc vissza gombbal és avatarral */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>

        <View style={styles.botAvatarSmall}>
          <Ionicons name="logo-android" size={24} color="#007bff" />
          <View style={styles.glassesOverlaySmall}>
             <Ionicons name="glasses" size={20} color="#333" />
          </View>
        </View>

        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Stati</Text>
          <Text style={styles.headerSubtitle}>AI Assistant</Text>
        </View>
      </View>

      {/* Üzenetlista automatikus görgetéssel */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.chatList}
        onContentSizeChange={() => flatListRef.current.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current.scrollToEnd({ animated: true })}
      />

      {/* Gépelés jelző */}
      {isTyping && (
        <View style={styles.typingIndicator}>
          <ActivityIndicator size="small" color="#007bff" />
          <Text style={styles.typingText}>Stati is thinking...</Text>
        </View>
      )}

      {/* Beviteli mező és küldés gomb */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ask Stati something..."
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!inputText.trim() || isTyping}
        >
          <Ionicons name="send" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  backButton: { padding: 5 },
  headerTextContainer: { marginLeft: 12 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  headerSubtitle: { fontSize: 12, color: '#28a745', fontWeight: '600' },
  botAvatarSmall: {
    width: 40,
    height: 40,
    backgroundColor: '#eef',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    borderWidth: 1,
    borderColor: '#d0d7de'
  },
  glassesOverlaySmall: { position: 'absolute', top: 8 },
  chatList: { padding: 15, paddingBottom: 20 },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 18,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007bff',
    borderBottomRightRadius: 2
  },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 2
  },
  botHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  botName: { fontSize: 11, fontWeight: 'bold', color: '#007bff', marginLeft: 5, textTransform: 'uppercase' },
  messageText: { fontSize: 15, lineHeight: 20 },
  userText: { color: '#fff' },
  botText: { color: '#333' },
  typingIndicator: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15 },
  typingText: { fontSize: 12, color: '#888', marginLeft: 8, fontStyle: 'italic' },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee'
  },
  input: {
    flex: 1,
    backgroundColor: '#f0f2f5',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 16,
    color: '#333'
  },
  sendButton: {
    backgroundColor: '#007bff',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc'
  }
});