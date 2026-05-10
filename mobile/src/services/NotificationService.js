import notifee, { AndroidImportance, AndroidVisibility, AndroidCategory, EventType } from '@notifee/react-native';
import { Platform } from 'react-native';

class NotificationService {
  async requestPermissions() {
    if (Platform.OS === 'ios') {
      await notifee.requestPermission();
    }
  }

  async createChannels() {
    if (Platform.OS !== 'android') return;

    await notifee.createChannel({
      id: 'medisync-critical',
      name: 'Critical Medicine Alerts',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound: 'default',
      vibration: true,
      bypassDnd: true, // Bypass Do Not Disturb for critical meds
    });

    await notifee.createChannel({
      id: 'medisync-default',
      name: 'Standard Medicine Reminders',
      importance: AndroidImportance.DEFAULT,
      visibility: AndroidVisibility.PUBLIC,
      sound: 'default',
      vibration: true,
    });

    await notifee.createChannel({
      id: 'medisync-foreground',
      name: 'Live Countdown Timer',
      importance: AndroidImportance.LOW,
      visibility: AndroidVisibility.PUBLIC,
      sound: undefined,
      vibration: false,
    });
  }

  async displayNotification(title, body, channelId = 'medisync-default', data = {}) {
    await notifee.displayNotification({
      title,
      body,
      data,
      android: {
        channelId,
        smallIcon: 'ic_launcher', // Need to make sure this exists or use 'ic_stat_name'
        color: '#0D9488',
        pressAction: {
          id: 'default',
        },
      },
    });
  }

  async scheduleMedicineReminder(medicine, triggerTimeMs) {
    const trigger = {
      type: 0, // TimestampTrigger
      timestamp: triggerTimeMs,
    };

    await notifee.createTriggerNotification(
      {
        id: `med_${medicine._id || medicine.name}`,
        title: `Time for ${medicine.name}`,
        body: `Please take your dose of ${medicine.dosage}.`,
        data: { medicineId: medicine._id },
        android: {
          channelId: 'medisync-critical',
          smallIcon: 'ic_launcher',
          color: '#0D9488',
          category: AndroidCategory.ALARM,
          pressAction: {
            id: 'default',
          },
          actions: [
            { title: 'Taken', pressAction: { id: 'action_taken' } },
            { title: 'Snooze (15m)', pressAction: { id: 'action_snooze' } },
            { title: 'Skip', pressAction: { id: 'action_skip' } }
          ],
          fullScreenAction: {
            id: 'default',
          },
        },
      },
      trigger
    );
  }

  async updateForegroundCountdown(medicineName, timeRemainingStr) {
    if (Platform.OS !== 'android') return;
    
    await notifee.displayNotification({
      id: 'live-countdown',
      title: 'Next Medicine',
      body: `${medicineName} in ${timeRemainingStr}`,
      android: {
        channelId: 'medisync-foreground',
        smallIcon: 'ic_launcher',
        color: '#0D9488',
        ongoing: true,
        asForegroundService: true,
      },
    });
  }

  async cancelLiveCountdown() {
    await notifee.stopForegroundService();
  }
}

export default new NotificationService();
