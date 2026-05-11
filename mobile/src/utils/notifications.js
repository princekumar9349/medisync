import NotificationService from '../services/NotificationService';

export async function showFlashMessage(title, body) {
  await NotificationService.displayNotification(title, body);
}

export async function setupNotifications() {
  try {
    console.log('[setupNotifications] Initializing notifications...');
    await NotificationService.requestPermissions();
    await NotificationService.createChannels();
    console.log('[setupNotifications] Initialization complete.');
  } catch (error) {
    console.error('[setupNotifications] Error during initialization:', error);
  }
}

export { NotificationService };
