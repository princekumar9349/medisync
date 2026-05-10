import NotificationService from '../services/NotificationService';

export async function showFlashMessage(title, body) {
  await NotificationService.displayNotification(title, body);
}

export async function setupNotifications() {
  await NotificationService.requestPermissions();
  await NotificationService.createChannels();
}

export { NotificationService };
