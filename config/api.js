const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * Public runtime configuration for the mobile client.
 *
 * Expo only exposes variables prefixed with EXPO_PUBLIC_. Never place secrets
 * in these variables: their values are bundled into the client application.
 */
export const API_BASE_URL = (configuredUrl || 'http://localhost:5000').replace(/\/$/, '');

if (!configuredUrl && __DEV__) {
  console.warn(
    'EXPO_PUBLIC_API_BASE_URL is not set; using http://localhost:5000. ' +
    'Physical devices normally need the development machine LAN address.'
  );
}
