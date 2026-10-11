import { Alert as NativeAlert, Platform } from 'react-native';

// React Native Web does not implement Alert.alert. Keep validation messages
// and save-confirmation callbacks working in the container's browser client.
export const Alert = {
  alert(title, message, buttons) {
    if (Platform.OS !== 'web') return NativeAlert.alert(title, message, buttons);
    window.alert(`${title}\n\n${message || ''}`);
    buttons?.[0]?.onPress?.();
  },
};
