import NotificationService from './NotificationService';
import ForegroundTaskManager from './BackgroundTasks';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MEDICINES_STORE_KEY = '@medisync_medicines';

class ReminderEngine {
  constructor() {
    this.medicines = [];
  }

  async syncMedicines(medicinesFromServer) {
    this.medicines = medicinesFromServer;
    await AsyncStorage.setItem(MEDICINES_STORE_KEY, JSON.stringify(this.medicines));
    await this.scheduleAllReminders();
  }

  async loadFromLocal() {
    const data = await AsyncStorage.getItem(MEDICINES_STORE_KEY);
    if (data) {
      this.medicines = JSON.parse(data);
    }
    return this.medicines;
  }

  // Parses a string like '09:00 AM' into a Date object for today
  parseTiming(timingStr) {
    if (!timingStr) return null;
    const parts = timingStr.split(' ');
    if (parts.length !== 2) return null;
    const timeParts = parts[0].split(':');
    if (timeParts.length !== 2) return null;
    
    let hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    const ampm = parts[1].toUpperCase();

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  async scheduleAllReminders() {
    // Basic implementation: For each medicine, if timing is parsed and is in the future today, schedule it.
    // Production version would need recurrent scheduling (e.g., using AlarmManager directly or calculating next 7 days).
    const now = new Date();
    let nextUpcomingMed = null;
    let nextUpcomingTime = Infinity;

    for (const med of this.medicines) {
      const triggerTime = this.parseTiming(med.timing);
      
      if (triggerTime) {
         // If time has passed today, schedule for tomorrow
         if (triggerTime.getTime() < now.getTime()) {
           triggerTime.setDate(triggerTime.getDate() + 1);
         }

         await NotificationService.scheduleMedicineReminder(med, triggerTime.getTime());

         if (triggerTime.getTime() < nextUpcomingTime) {
            nextUpcomingTime = triggerTime.getTime();
            nextUpcomingMed = med;
         }
      }
    }

    // Start live countdown for the very next medicine
    if (nextUpcomingMed) {
      await ForegroundTaskManager.startCountdown(nextUpcomingMed.name, nextUpcomingTime);
    } else {
      await ForegroundTaskManager.stopCountdown();
    }
  }

  async markAsTaken(medicineId) {
    // Here we would communicate with the backend
    // For now, local logic handles skipping/taking
  }
}

export default new ReminderEngine();
