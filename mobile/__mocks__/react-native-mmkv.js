/**
 * Mock implementation of react-native-mmkv for Expo Go compatibility.
 * This file is used by Metro resolver when native MMKV is unavailable.
 */
class MMKVMock {
  constructor() {
    this.store = new Map();
  }
  set(key, value) { this.store.set(key, String(value)); }
  getString(key) { return this.store.get(key); }
  getBoolean(key) { const v = this.store.get(key); return v === 'true'; }
  getNumber(key) { return Number(this.store.get(key) || 0); }
  delete(key) { this.store.delete(key); }
  clearAll() { this.store.clear(); }
  getAllKeys() { return Array.from(this.store.keys()); }
}

module.exports = { MMKV: MMKVMock };
