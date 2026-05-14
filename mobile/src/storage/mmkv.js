import * as SecureStore from 'expo-secure-store';

let MMKV;
try {
  MMKV = require('react-native-mmkv').MMKV;
} catch (e) {
  console.warn('[MMKV] react-native-mmkv not available in Expo Go. Using fallback memory storage.');
}

const ENCRYPTION_KEY_ID = 'medisync_mmkv_encryption_key';

let storageInstance = null;

// Fallback memory storage for Expo Go testing
class MemoryStorage {
  constructor() { this.store = new Map(); }
  set(key, value) { this.store.set(key, value); }
  getString(key) { return this.store.get(key); }
  getBoolean(key) { return this.store.get(key) === true; }
  getNumber(key) { return Number(this.store.get(key)); }
  delete(key) { this.store.delete(key); }
  clearAll() { this.store.clear(); }
}

export async function initStorage() {
  if (storageInstance) return storageInstance;

  if (!MMKV) {
    storageInstance = new MemoryStorage();
    return storageInstance;
  }

  let key = await SecureStore.getItemAsync(ENCRYPTION_KEY_ID);
  if (!key) {
    key = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    await SecureStore.setItemAsync(ENCRYPTION_KEY_ID, key);
  }

  storageInstance = new MMKV({
    id: 'medisync-secure-storage',
    encryptionKey: key,
  });

  return storageInstance;
}

export function getStorage() {
  if (!storageInstance) {
    throw new Error('Storage accessed before initStorage() was called.');
  }
  return storageInstance;
}
