import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useUIStore = create(
  persist(
    (set) => ({
      theme: 'system', // 'light' | 'dark' | 'system'
      isElderlyMode: false,
      isHighContrast: false,
      
      setTheme: (theme) => set({ theme }),
      toggleElderlyMode: () => set((state) => ({ isElderlyMode: !state.isElderlyMode })),
      toggleHighContrast: () => set((state) => ({ isHighContrast: !state.isHighContrast })),
      // ✅ Fix: explicit setters used by ProfileScreen toggles
      setElderlyMode: (val) => set({ isElderlyMode: val }),
      setHighContrast: (val) => set({ isHighContrast: val }),
    }),
    {
      name: 'medisync-ui-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
