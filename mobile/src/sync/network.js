import NetInfo from '@react-native-community/netinfo';
import { flushSyncQueue } from './retry';

let isListening = false;
let unsubscribe = null;
let lastFlushTime = 0;
const DEBOUNCE_MS = 10000; // 10 seconds debounce

export function startNetworkListener() {
  if (isListening) return;
  isListening = true;

  unsubscribe = NetInfo.addEventListener(state => {
    // When internet is restored, debounce flush to prevent rapid toggling
    if (state.isConnected && state.isInternetReachable) {
      const now = Date.now();
      if (now - lastFlushTime > DEBOUNCE_MS) {
        lastFlushTime = now;
        // Small delay to allow connection stabilization
        setTimeout(() => {
          flushSyncQueue();
        }, 2000);
      }
    }
  });
}

export function stopNetworkListener() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
    isListening = false;
  }
}
