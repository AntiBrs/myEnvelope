import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'myenvelope.accessToken';
let webToken = null;
let legacyCleanup;

function removeLegacySession() {
  // Do not migrate a token out of plaintext storage; require a fresh login.
  if (!legacyCleanup) {
    legacyCleanup = AsyncStorage.multiRemove(['userToken', 'userId']).catch((error) => {
      legacyCleanup = undefined;
      throw error;
    });
  }
  return legacyCleanup;
}

export async function getToken() {
  await removeLegacySession();
  return Platform.OS === 'web' ? webToken : SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token) {
  await removeLegacySession();
  if (Platform.OS === 'web') {
    // A browser refresh signs out; no bearer token is written to web storage.
    webToken = token;
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
}

export async function clearToken() {
  webToken = null;
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(TOKEN_KEY);
  await removeLegacySession();
}
