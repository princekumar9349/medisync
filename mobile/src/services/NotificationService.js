import notifee, { AndroidImportance, AndroidVisibility, AndroidCategory, EventType, TriggerType, AuthorizationStatus } from '@notifee/react-native';
import { Platform } from 'react-native';

class NotificationService {
  async requestPermissions() {
    try {
      // Request notification permissions for both iOS and Android (API 33+)
      const settings = await notifee.requestPermission();
      
      if (settings.authorizationStatus === AuthorizationStatus.DENIED) {
        console.log('User denied notification permissions');
      } else if (settings.authorizationStatus === AuthorizationStatus.AUTHORIZED) {
        console.log('Notification permissions granted');
      } else if (settings.authorizationStatus === AuthorizationStatus.PROVISIONAL) {
        console.log('Notification permissions granted provisionally');
      }
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
    }
  }

  async checkExactAlarmPermission() {
    if (Platform.OS !== 'android') return true;
    
    // For Android 12+, we need explicit permission to schedule exact alarms
    const settings = await notifee.getNotificationSettings();
    if (settings.android.alarm == AndroidImportance.NONE) {
      // Alarm permission is denied, need to prompt user
      console.log('Exact alarm permission denied');
      return false;
    }
    return true;
  }

  async openExactAlarmSettings() {
    if (Platform.OS === 'android') {
      await notifee.openAlarmPermissionSettings();
    }
  }

  async checkBatteryOptimizations() {
    if (Platform.OS !== 'android') return;
    
    try {
      const batteryOptimizationEnabled = await notifee.isBatteryOptimizationEnabled();
      if (batteryOptimizationEnabled) {
        console.log('Battery optimization is enabled, notifications might be delayed.');
        // Prompt the user to disable battery optimizations
        // We will expose openBatteryOptimizationSettings to the UI
      }
      
      const powerManagerInfo = await notifee.getPowerManagerInfo();
      if (powerManagerInfo.activity) {
        console.log('Device has a custom power manager (e.g. Realme/Xiaomi), user might need to adjust settings.');
      }
    } catch (e) {
      console.error('Error checking battery optimizations:', e);
    }
  }

  async openBatterySettings() {
    if (Platform.OS === 'android') {
      await notifee.openBatteryOptimizationSettings();
    }
  }
  
  async openPowerManagerSettings() {
    if (Platform.OS === 'android') {
      await notifee.openPowerManagerSettings();
    }
  }

  async createChannels() {
    if (Platform.OS !== 'android') return;

    try {
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
      console.log('Notification channels created successfully');
    } catch (e) {
      console.error('Failed to create notification channels:', e);
    }
  }

  async testNotification() {
    try {
      console.log('Triggering test notification...');
      await notifee.displayNotification({
        title: 'Test Notification',
        body: 'If you see this, notifications are working correctly!',
        android: {
          channelId: 'medisync-critical',
          smallIcon: 'ic_launcher',
          color: '#0D9488',
          pressAction: {
            id: 'default',
          },
        },
      });
      console.log('Test notification displayed');
    } catch (error) {
      console.error('Error displaying test notification:', error);
      throw error;
    }
  }

  async displayNotification(title, body, channelId = 'medisync-default', data = {}) {
    try {
      await notifee.displayNotification({
        title,
        body,
        data,
        android: {
          channelId,
          smallIcon: 'ic_launcher', // Fallbacks natively if missing
          color: '#0D9488',
          pressAction: {
            id: 'default',
          },
        },
      });
    } catch (e) {
      console.error('Error displaying notification:', e);
    }
  }

  async scheduleMedicineReminder(medicine, triggerTimeMs) {
    try {
      const trigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: triggerTimeMs,
        alarmManager: {
          allowWhileIdle: true, // Needed to wake up device from doze mode
        },
      };

      await notifee.createTriggerNotification(
        {
          id: `med_${medicine._id || medicine.name}_${triggerTimeMs}`,
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
      console.log(`Scheduled reminder for ${medicine.name} at ${new Date(triggerTimeMs).toLocaleString()}`);
    } catch (e) {
      console.error('Failed to schedule medicine reminder:', e);
    }
  }

  async updateForegroundCountdown(medicineName, timeRemainingStr) {
    if (Platform.OS !== 'android') return;
    
    try {
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
    } catch (e) {
      console.error('Failed to update foreground countdown:', e);
    }
  }

  async cancelLiveCountdown() {
    try {
      await notifee.stopForegroundService();
    } catch (e) {
      console.error('Failed to stop live countdown:', e);
    }
  }
}

export default new NotificationService();
