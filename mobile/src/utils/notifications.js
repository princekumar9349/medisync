import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export async function showFlashMessage(title, body) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n${body}`);
    return;
  }
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger: null,
    });
  } catch (err) {
    console.log('Notification error:', err);
  }
}
