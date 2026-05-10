import BackgroundService from 'react-native-background-actions';
import NotificationService from './NotificationService';

const sleep = (time) => new Promise((resolve) => setTimeout(() => resolve(), time));

class ForegroundTaskManager {
  constructor() {
    this.isRunning = false;
    this.currentMedicine = null;
    this.targetTime = null;
  }

  async startCountdown(medicineName, targetTimeMs) {
    this.currentMedicine = medicineName;
    this.targetTime = targetTimeMs;

    if (this.isRunning) return; // Already running, just updated target

    const taskOptions = {
      taskName: 'MediSyncCountdown',
      taskTitle: 'Next Medicine',
      taskDesc: `Preparing countdown for ${medicineName}...`,
      taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
      },
      color: '#0D9488',
      linkingURI: 'medisync://', // Allows deep linking
      parameters: {
        delay: 60000, // 1 minute updates
      },
    };

    try {
      await BackgroundService.start(this.countdownTask.bind(this), taskOptions);
      this.isRunning = true;
    } catch (e) {
      console.log('Background service error:', e);
    }
  }

  async stopCountdown() {
    if (!this.isRunning) return;
    await BackgroundService.stop();
    await NotificationService.cancelLiveCountdown();
    this.isRunning = false;
  }

  async countdownTask(taskDataArguments) {
    const { delay } = taskDataArguments;

    // We use a continuous loop that runs while the service is active
    await new Promise(async (resolve) => {
      while (BackgroundService.isRunning()) {
        if (!this.targetTime || !this.currentMedicine) {
           await sleep(delay);
           continue;
        }

        const now = Date.now();
        const diffMs = this.targetTime - now;

        if (diffMs <= 0) {
           // Medicine time! Let Notifee handle the alarm, we just update the foreground
           await BackgroundService.updateNotification({taskTitle: 'Medicine Due Now', taskDesc: `It's time to take ${this.currentMedicine}`});
           await sleep(delay);
           continue;
        }

        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        let timeStr = '';
        if (hours > 0) timeStr += `${hours}h `;
        timeStr += `${minutes}m`;

        // Update the foreground notification
        await BackgroundService.updateNotification({
            taskTitle: 'Next Medicine',
            taskDesc: `${this.currentMedicine} in ${timeStr}`
        });

        await sleep(delay);
      }
      resolve();
    });
  }
}

export default new ForegroundTaskManager();
