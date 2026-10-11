import { Platform } from 'react-native';
import { clearToken, getToken } from './session';

const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * Public runtime configuration for the mobile client.
 *
 * Expo only exposes variables prefixed with EXPO_PUBLIC_. Never place secrets
 * in these variables: their values are bundled into the client application.
 */
export const API_BASE_URL = (configuredUrl || (Platform.OS === 'web' ? '/api' : 'http://localhost:5000')).replace(/\/$/, '');

let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export async function apiFetch(url, options = {}) {
  const base = new URL(API_BASE_URL, Platform.OS === 'web' ? window.location.origin : undefined);
  const target = new URL(url, base);
  if (target.origin !== base.origin || !target.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/`)) {
    throw new Error('Refusing to send a session token outside the configured API');
  }
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('Invalid API address');
  }
  if (!__DEV__ && target.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
    throw new Error('HTTPS is required outside local development');
  }
  const token = await getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(target.toString(), {
      ...options, headers, credentials: 'omit', redirect: 'error', signal: controller.signal,
    });
    if (response.status === 401 && token && await getToken() === token) {
      await clearToken();
      onUnauthorized();
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

if (!configuredUrl && __DEV__) {
  console.warn(
    `EXPO_PUBLIC_API_BASE_URL is not set; using ${API_BASE_URL}. ` +
    'Physical devices normally need the development machine LAN address.'
  );
}
