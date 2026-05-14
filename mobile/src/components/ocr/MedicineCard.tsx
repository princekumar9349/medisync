import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOCRStore, MedicineExtraction } from '../../store/ocrStore';
import { COLORS } from '../../theme';

interface Props {
  index: number;
  medicine: MedicineExtraction;
}

export default function MedicineCard({ index, medicine }: Props) {
  const { updateMedicine, deleteMedicine } = useOCRStore();

  const isUnreadable = (val: string) => val.includes('[UNREADABLE]');
  const getConfidenceColor = (conf: number, val: string) => {
    if (isUnreadable(val)) return 'border-red-400 bg-red-50';
    if (conf < 0.8) return 'border-amber-400 bg-amber-50';
    return 'border-slate-200 bg-white';
  };

  const getConfidenceIcon = (conf: number, val: string) => {
    if (isUnreadable(val)) return <Ionicons name="alert-circle" size={18} color="#EF4444" />;
    if (conf < 0.8) return <Ionicons name="warning" size={18} color="#F59E0B" />;
    return <Ionicons name="checkmark-circle" size={18} color="#10B981" />;
  };

  return (
    <View className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-4">
      {/* Header */}
      <View className="flex-row justify-between items-center mb-4">
        <View className="bg-teal-100 px-3 py-1 rounded-full">
          <Text className="text-teal-800 font-bold text-xs">Medicine {index + 1}</Text>
        </View>
        <TouchableOpacity onPress={() => deleteMedicine(index)} className="p-1">
          <Ionicons name="trash-outline" size={20} color={COLORS.slate400} />
        </TouchableOpacity>
      </View>

      {/* Name Input */}
      <View className="mb-4">
        <Text className="text-xs font-bold text-slate-500 mb-1 ml-1 uppercase">Name</Text>
        <View className={`flex-row items-center border rounded-xl px-3 h-14 ${getConfidenceColor(medicine.name_confidence, medicine.name)}`}>
          <TextInput
            className="flex-1 text-base text-slate-800 font-medium"
            value={isUnreadable(medicine.name) ? '' : medicine.name}
            onChangeText={(t) => updateMedicine(index, { name: t, name_confidence: 1.0 })}
            placeholder={isUnreadable(medicine.name) ? "Please enter medicine name" : "Medicine Name"}
            placeholderTextColor={isUnreadable(medicine.name) ? "#EF4444" : "#94A3B8"}
          />
          {getConfidenceIcon(medicine.name_confidence, medicine.name)}
        </View>
      </View>

      {/* Timing Row */}
      <View className="flex-row mb-4 space-x-3">
        <View className="flex-1 mr-2">
          <Text className="text-xs font-bold text-slate-500 mb-1 ml-1 uppercase">Timing</Text>
          <View className={`flex-row items-center border rounded-xl px-3 h-14 ${getConfidenceColor(medicine.shorthand_confidence, medicine.shorthand)}`}>
            <TextInput
              className="flex-1 text-base text-slate-800 font-medium"
              value={isUnreadable(medicine.shorthand) ? '' : medicine.shorthand}
              onChangeText={(t) => updateMedicine(index, { shorthand: t, shorthand_confidence: 1.0 })}
              placeholder="e.g. 1-0-1 or Morning"
            />
          </View>
        </View>
        
        <View className="flex-1 ml-2">
          <Text className="text-xs font-bold text-slate-500 mb-1 ml-1 uppercase">Duration</Text>
          <View className={`flex-row items-center border rounded-xl px-3 h-14 ${getConfidenceColor(medicine.duration_confidence, medicine.duration)}`}>
            <TextInput
              className="flex-1 text-base text-slate-800 font-medium"
              value={isUnreadable(medicine.duration) ? '' : medicine.duration}
              onChangeText={(t) => updateMedicine(index, { duration: t, duration_confidence: 1.0 })}
              placeholder="e.g. 5 days"
            />
          </View>
        </View>
      </View>

      {/* Smart Schedule Preview */}
      {medicine.inferred_timing && medicine.inferred_timing.length > 0 && (
        <View className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex-row items-center flex-wrap">
          <Text className="text-xs text-slate-500 mr-2">Schedule Preview:</Text>
          {medicine.inferred_timing.map((time, i) => (
            <View key={i} className="bg-white border border-teal-200 px-2 py-1 rounded-lg flex-row items-center mr-2 mb-1">
              <Ionicons 
                name={time === 'morning' ? 'sunny' : time === 'afternoon' ? 'partly-sunny' : 'moon'} 
                size={12} 
                color={COLORS.teal600} 
              />
              <Text className="text-xs text-teal-800 font-medium ml-1 capitalize">{time}</Text>
            </View>
          ))}
        </View>
      )}

    </View>
  );
}
