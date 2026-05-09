import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { apiUpdateMe } from '../../services/api';
import { COLORS, FONTS, SPACING, RADIUS } from '../../theme';

export default function OnboardingScreen() {
  const navigation = useNavigation();
  const { user, login } = useAuth(); // We'll re-login to update context

  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [weight, setWeight] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!age || !gender) {
      Alert.alert('Missing Fields', 'Please fill in at least your Age and Gender to continue.');
      return;
    }

    setLoading(true);
    try {
      const updateData = {
        age: parseInt(age, 10),
        gender: gender.toLowerCase(),
        weight: weight ? parseFloat(weight) : null,
        blood_group: bloodGroup || null,
      };

      await apiUpdateMe(updateData);
      
      // Update local context
      const updatedUser = { ...user, ...updateData };
      await login(updatedUser); // Just updates the user object in context

      // Navigation handles routing automatically since AppNavigator checks user.age
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Welcome to Medisync! 👋</Text>
          <Text style={styles.subtitle}>
            Please provide a few details to complete your profile. This helps our AI and your doctor provide better care.
          </Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Age *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 45"
              keyboardType="number-pad"
              value={age}
              onChangeText={setAge}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Gender *</Text>
            <View style={styles.genderRow}>
              {['Male', 'Female', 'Other'].map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderBtn, gender.toLowerCase() === g.toLowerCase() && styles.genderBtnActive]}
                  onPress={() => setGender(g)}
                >
                  <Text style={[styles.genderBtnText, gender.toLowerCase() === g.toLowerCase() && styles.genderBtnTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Weight (kg) <Text style={{ color: COLORS.slate400 }}>(Optional)</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 70"
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={setWeight}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Blood Group <Text style={{ color: COLORS.slate400 }}>(Optional)</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. O+"
              value={bloodGroup}
              onChangeText={setBloodGroup}
              autoCapitalize="characters"
            />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
            <Text style={styles.saveBtnText}>{loading ? 'Saving...' : 'Complete Profile'}</Text>
          </TouchableOpacity>
          
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  container: { padding: SPACING.xl, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: FONTS.bold, color: COLORS.slate800, marginBottom: 8 },
  subtitle: { fontSize: 14, color: COLORS.slate500, marginBottom: 32, lineHeight: 20 },
  
  formGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: FONTS.semibold, color: COLORS.slate700, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: COLORS.slate200, borderRadius: RADIUS.lg,
    padding: 14, fontSize: 16, backgroundColor: COLORS.slate50, color: COLORS.slate800
  },

  genderRow: { flexDirection: 'row', gap: 10 },
  genderBtn: {
    flex: 1, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.slate200,
    borderRadius: RADIUS.lg, alignItems: 'center', backgroundColor: COLORS.white
  },
  genderBtnActive: { borderColor: COLORS.brand500, backgroundColor: COLORS.brand50 },
  genderBtnText: { fontSize: 14, color: COLORS.slate600, fontWeight: FONTS.medium },
  genderBtnTextActive: { color: COLORS.brand600, fontWeight: FONTS.bold },

  saveBtn: {
    backgroundColor: COLORS.brand600, paddingVertical: 16, borderRadius: RADIUS.lg,
    alignItems: 'center', marginTop: 24,
  },
  saveBtnText: { color: COLORS.white, fontSize: 16, fontWeight: FONTS.bold },
});
