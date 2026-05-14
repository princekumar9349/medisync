import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'ocr-storage' });

const zustandStorage = {
  setItem: (name: string, value: string) => {
    return storage.set(name, value);
  },
  getItem: (name: string) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name: string) => {
    return storage.delete(name);
  },
};

export interface MedicineExtraction {
  id?: string; // local id for rendering
  name: string;
  name_confidence: number;
  shorthand: string;
  shorthand_confidence: number;
  duration: string;
  duration_confidence: number;
  instructions: string;
  meal_instruction: string;
  inferred_timing: string[];
  needs_review: boolean;
}

export interface OCRJobState {
  activeJobId: string | null;
  jobStartedAt: number | null;
  imageUris: string[];
  status: 'IDLE' | 'PENDING' | 'COMPLETED' | 'FAILED';
  error: string | null;
  
  // Payload for review
  overallConfidence: number;
  medicines: MedicineExtraction[];
  
  // Actions
  setJob: (jobId: string, imageUris: string[]) => void;
  updateStatus: (status: 'PENDING' | 'COMPLETED' | 'FAILED', error?: string | null) => void;
  setExtraction: (confidence: number, medicines: MedicineExtraction[]) => void;
  updateMedicine: (index: number, updates: Partial<MedicineExtraction>) => void;
  deleteMedicine: (index: number) => void;
  addMedicine: (medicine: MedicineExtraction) => void;
  clearJob: () => void;
}

export const useOCRStore = create<OCRJobState>()(
  persist(
    (set, get) => ({
      activeJobId: null,
      jobStartedAt: null,
      imageUris: [],
      status: 'IDLE',
      error: null,
      
      overallConfidence: 0,
      medicines: [],
      
      setJob: (jobId, imageUris) => set({ 
        activeJobId: jobId, 
        imageUris, 
        jobStartedAt: Date.now(),
        status: 'PENDING',
        error: null,
        overallConfidence: 0,
        medicines: []
      }),
      
      updateStatus: (status, error = null) => set({ status, error }),
      
      setExtraction: (overallConfidence, medicines) => set({ 
        overallConfidence, 
        // Assign a local ID for easier flatlist keys
        medicines: medicines.map((m, i) => ({ ...m, id: Date.now().toString() + i })) 
      }),
      
      updateMedicine: (index, updates) => set((state) => {
        const meds = [...state.medicines];
        if (meds[index]) {
          meds[index] = { ...meds[index], ...updates };
        }
        return { medicines: meds };
      }),
      
      deleteMedicine: (index) => set((state) => {
        const meds = [...state.medicines];
        meds.splice(index, 1);
        return { medicines: meds };
      }),
      
      addMedicine: (medicine) => set((state) => ({
        medicines: [...state.medicines, { ...medicine, id: Date.now().toString() }]
      })),
      
      clearJob: () => set({ 
        activeJobId: null, 
        jobStartedAt: null, 
        imageUris: [], 
        status: 'IDLE', 
        error: null,
        overallConfidence: 0,
        medicines: []
      }),
    }),
    {
      name: 'ocr-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
