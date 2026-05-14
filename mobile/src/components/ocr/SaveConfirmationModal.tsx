import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MedicineExtraction } from '../../store/ocrStore';
import { COLORS } from '../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  medicines: MedicineExtraction[];
}

export default function SaveConfirmationModal({ visible, onClose, onConfirm, medicines }: Props) {
  
  // Validation: Check for duplicates or missing timings
  const duplicateNames = medicines.filter((m, i, arr) => 
    arr.findIndex(x => x.name.toLowerCase() === m.name.toLowerCase()) !== i
  );
  
  const unreadableCount = medicines.filter(m => 
    m.name.includes('[UNREADABLE]') || m.shorthand.includes('[UNREADABLE]')
  ).length;

  const hasIssues = duplicateNames.length > 0 || unreadableCount > 0;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-white rounded-t-3xl pt-6 px-6 pb-10 max-h-[80%]">
          
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-2xl font-bold text-slate-800">Confirm Medicines</Text>
            <TouchableOpacity onPress={onClose} className="p-2 -mr-2 bg-slate-100 rounded-full">
              <Ionicons name="close" size={20} color={COLORS.slate600} />
            </TouchableOpacity>
          </View>

          <ScrollView className="mb-6">
            <Text className="text-slate-600 text-base mb-4">
              You are about to add <Text className="font-bold text-slate-800">{medicines.length}</Text> medicine(s) to your pillbox schedule.
            </Text>

            {hasIssues && (
              <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                <View className="flex-row items-center mb-2">
                  <Ionicons name="alert-circle" size={20} color="#EF4444" />
                  <Text className="font-bold text-red-800 ml-2">Attention Needed</Text>
                </View>
                {unreadableCount > 0 && (
                  <Text className="text-red-700 mt-1">• {unreadableCount} field(s) are marked as [UNREADABLE]. You must fix them before saving.</Text>
                )}
                {duplicateNames.length > 0 && (
                  <Text className="text-red-700 mt-1">• You have duplicate medicines: {duplicateNames.map(d => d.name).join(', ')}.</Text>
                )}
              </View>
            )}

            <View className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              {medicines.map((m, i) => (
                <View key={i} className={`flex-row justify-between items-center ${i !== medicines.length - 1 ? 'border-b border-slate-200 pb-3 mb-3' : ''}`}>
                  <View className="flex-1 pr-4">
                    <Text className="font-bold text-slate-800" numberOfLines={1}>{m.name || 'Unnamed'}</Text>
                    <Text className="text-sm text-slate-500 mt-0.5">{m.shorthand || 'No schedule'}</Text>
                  </View>
                  <View className="bg-white px-2 py-1 rounded border border-slate-200">
                    <Text className="text-xs text-slate-600 font-medium">{m.inferred_timing?.length || 0} doses/day</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          <View className="flex-row space-x-3">
            <TouchableOpacity 
              className="flex-1 py-4 bg-slate-100 rounded-xl items-center mr-2"
              onPress={onClose}
            >
              <Text className="text-slate-700 font-bold text-lg">Back to Edit</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              className={`flex-1 py-4 rounded-xl items-center ml-2 ${unreadableCount > 0 ? 'bg-slate-300' : 'bg-teal-600'}`}
              onPress={onConfirm}
              disabled={unreadableCount > 0}
            >
              <Text className="text-white font-bold text-lg">Confirm & Save</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}
