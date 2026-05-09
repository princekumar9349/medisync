import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { apiReportSymptom } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS, S } from '../../theme';
import { showFlashMessage } from '../../utils/notifications';

export default function SymptomReportScreen() {
  const navigation = useNavigation();

  const [symptom, setSymptom] = useState('');
  const [severity, setSeverity] = useState(1);
  const [timeContext, setTimeContext] = useState(''); // e.g., 'Before Medicine'
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!symptom.trim()) {
      Alert.alert('Missing Info', 'Please describe your symptom.');
      return;
    }

    setLoading(true);
    try {
      await apiReportSymptom(symptom.trim(), severity, timeContext || 'Unknown');
      showFlashMessage('Symptom Reported', 'Your symptom has been logged and sent to your doctor.');
      setSymptom('');
      setSeverity(1);
      setTimeContext('');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🌡️ Report Symptom</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          
          <View style={styles.card}>
            <Text style={styles.label}>What are you feeling? *</Text>
            <TextInput
              style={styles.inputArea}
              placeholder="e.g., Severe headache, Nausea, Fever..."
              placeholderTextColor={COLORS.slate400}
              value={symptom}
              onChangeText={setSymptom}
              multiline
              numberOfLines={4}
            />

            <Text style={[styles.label, { marginTop: 24 }]}>Severity (1 = Mild, 5 = Severe)</Text>
            <View style={styles.severityRow}>
              {[1, 2, 3, 4, 5].map(level => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.severityBtn,
                    severity === level && { backgroundColor: level > 3 ? COLORS.red500 : COLORS.amber500, borderColor: level > 3 ? COLORS.red600 : COLORS.amber600 }
                  ]}
                  onPress={() => setSeverity(level)}
                >
                  <Text style={[styles.severityText, severity === level && { color: COLORS.white }]}>{level}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: 24 }]}>When did it happen?</Text>
            <View style={styles.timeRow}>
              {['Before Medicine', 'After Medicine', 'Random', 'Constantly'].map(ctx => (
                <TouchableOpacity
                  key={ctx}
                  style={[styles.timeBtn, timeContext === ctx && styles.timeBtnActive]}
                  onPress={() => setTimeContext(ctx)}
                >
                  <Text style={[styles.timeText, timeContext === ctx && styles.timeTextActive]}>{ctx}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
            <Text style={styles.submitBtnText}>{loading ? 'Sending...' : 'Submit Report'}</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bgLight },
  header: { paddingHorizontal: SPACING.lg, paddingVertical: 14, backgroundColor: COLORS.white, borderBottomWidth: 1, borderColor: COLORS.slate100 },
  headerTitle: { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.slate800 },
  
  container: { padding: SPACING.lg },
  
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.slate100, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: FONTS.bold, color: COLORS.slate700, marginBottom: 12 },
  
  inputArea: {
    backgroundColor: COLORS.slate50, borderWidth: 1, borderColor: COLORS.slate200,
    borderRadius: RADIUS.lg, padding: 14, fontSize: 16, color: COLORS.slate800,
    minHeight: 100, textAlignVertical: 'top'
  },

  severityRow: { flexDirection: 'row', justifyContent: 'space-between' },
  severityBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.slate50,
    borderWidth: 1, borderColor: COLORS.slate200, alignItems: 'center', justifyContent: 'center'
  },
  severityText: { fontSize: 16, fontWeight: FONTS.bold, color: COLORS.slate500 },

  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full,
    backgroundColor: COLORS.slate50, borderWidth: 1, borderColor: COLORS.slate200
  },
  timeBtnActive: { backgroundColor: COLORS.brand50, borderColor: COLORS.brand400 },
  timeText: { fontSize: 13, fontWeight: FONTS.medium, color: COLORS.slate600 },
  timeTextActive: { color: COLORS.brand700, fontWeight: FONTS.bold },

  submitBtn: {
    backgroundColor: COLORS.red500, paddingVertical: 16, borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  submitBtnText: { color: COLORS.white, fontSize: 16, fontWeight: FONTS.bold },
});
