import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Switch, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SHADOW } from '../../../theme';
import api from '../../../services/api';

const DemoScenarioScreen = ({ navigation }) => {
  const [demoMode, setDemoMode] = useState(true);
  const [language, setLanguage] = useState('hi');
  const [loading, setLoading] = useState(false);
  const [timeline, setTimeline] = useState([]);
  
  const addLog = (message, source = 'system') => {
    setTimeline(prev => [{ id: Date.now().toString(), message, source, time: new Date().toLocaleTimeString() }, ...prev]);
  };

  const handleTriggerReminder = async () => {
    addLog('Triggering Push Reminder...', 'system');
    // Call the backend, or just simulate locally for demo
    setTimeout(() => addLog('Push Notification Sent: "Time for your medicine"', 'mobile'), 1000);
  };

  const handleTriggerMissedDose = async () => {
    addLog('Fast-forwarding escalation window...', 'system');
    setTimeout(() => addLog('Dose marked as Missed (Demo 10s passed)', 'system'), 1500);
  };

  const handleTriggerVoiceCall = async () => {
    setLoading(true);
    addLog('Initiating AI Voice Call...', 'system');
    try {
      // In a real scenario, this would fetch user details
      const payload = {
        user_id: "demo_user_123",
        phone_number: "+911234567890",
        med_id: "demo_med_001",
        medicine_name: "Aspirin",
        slot: "morning",
        is_critical: false
      };
      // We assume api points to our backend
      const res = await api.post('/voice-ai/initiate', payload);
      addLog(`Voice Call Initiated: ${res.data.status}`, 'voice_ai');
    } catch (err) {
      addLog(`Voice Call Mocked (API not reachable)`, 'voice_ai');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateVoiceConfirm = async () => {
    setLoading(true);
    addLog('Simulating AI Voice Confirmed ("Haan le li")...', 'voice_ai');
    try {
      const payload = {
        med_id: "demo_med_001",
        status: "taken",
        source: "voice_ai",
        note: "Simulated via Demo UI"
      };
      await api.post('/mark-done', payload);
      addLog('Adherence Updated. Source: voice_ai', 'voice_ai');
    } catch (err) {
      addLog('Failed to update adherence', 'system');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateIoTConfirm = async () => {
    setLoading(true);
    addLog('Simulating IoT Dispenser Confirm...', 'iot');
    try {
      const payload = {
        med_id: "demo_med_001",
        status: "taken",
        source: "iot",
        note: "Simulated via Demo UI"
      };
      await api.post('/mark-done', payload);
      addLog('Adherence Updated. Source: iot', 'iot');
    } catch (err) {
      addLog('Failed to update adherence', 'system');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateAlreadyTaken = async () => {
    setLoading(true);
    addLog('Marking dose via Mobile...', 'mobile');
    try {
      await api.post('/mark-done', {
        med_id: "demo_med_001",
        status: "taken",
        source: "mobile",
        note: "Simulated via Demo UI"
      });
      addLog('Adherence Updated. Source: mobile', 'mobile');
      
      setTimeout(() => {
        addLog('Triggering AI Voice Call...', 'system');
        setTimeout(() => {
          addLog('AI Response: "Aapne ye medicine already mark kar di hai."', 'voice_ai');
          setLoading(false);
        }, 1500);
      }, 1000);
      
    } catch (err) {
      addLog('Simulation failed', 'system');
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTimeline([]);
    addLog('Demo state reset', 'system');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Presentation Tools</Text>
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>DEMO</Text>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Configuration</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Demo Mode (Fast Escalation)</Text>
            <Switch value={demoMode} onValueChange={setDemoMode} />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>AI Voice Language</Text>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity onPress={() => setLanguage('en')} style={[styles.langBtn, language === 'en' && styles.langBtnActive]}>
                <Text style={[styles.langText, language === 'en' && styles.langTextActive]}>EN</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setLanguage('hi')} style={[styles.langBtn, language === 'hi' && styles.langBtnActive]}>
                <Text style={[styles.langText, language === 'hi' && styles.langTextActive]}>HI</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Escalation Triggers</Text>
          <TouchableOpacity style={styles.buttonOutline} onPress={handleTriggerReminder} disabled={loading}>
            <Ionicons name="notifications" size={20} color={COLORS.brand600} />
            <Text style={styles.buttonOutlineText}>1. Trigger Reminder (T-0)</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.buttonOutline} onPress={handleTriggerMissedDose} disabled={loading}>
            <Ionicons name="time" size={20} color={COLORS.orange500} />
            <Text style={[styles.buttonOutlineText, { color: COLORS.orange500 }]}>2. Trigger Missed Dose (T+10s)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.purple600 }]} onPress={handleTriggerVoiceCall} disabled={loading}>
            <Ionicons name="call" size={20} color={COLORS.white} />
            <Text style={styles.buttonText}>3. Initiate AI Voice Call (T+15s)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Adherence Sources</Text>
          <TouchableOpacity style={styles.buttonOutline} onPress={handleSimulateVoiceConfirm} disabled={loading}>
            <Ionicons name="mic" size={20} color={COLORS.purple600} />
            <Text style={[styles.buttonOutlineText, { color: COLORS.purple600 }]}>Simulate AI Confirmed</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonOutline} onPress={handleSimulateIoTConfirm} disabled={loading}>
            <Ionicons name="hardware-chip" size={20} color={COLORS.teal600} />
            <Text style={[styles.buttonOutlineText, { color: COLORS.teal600 }]}>Simulate IoT Confirmed</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Safety & Concurrency</Text>
          <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.slate800 }]} onPress={handleSimulateAlreadyTaken} disabled={loading}>
            <Ionicons name="shield-checkmark" size={20} color={COLORS.white} />
            <Text style={styles.buttonText}>Simulate Already Taken (Idempotency)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.timelineContainer}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.sectionTitle}>Live Event Timeline</Text>
            <TouchableOpacity onPress={handleReset}>
              <Text style={{ color: COLORS.red500, fontSize: 12, fontWeight: 'bold' }}>CLEAR</Text>
            </TouchableOpacity>
          </View>
          
          {loading && <ActivityIndicator size="small" color={COLORS.brand500} style={{ marginVertical: 10 }} />}
          
          {timeline.length === 0 ? (
            <Text style={styles.emptyText}>No events recorded yet.</Text>
          ) : (
            timeline.map((item) => (
              <View key={item.id} style={styles.timelineItem}>
                <View style={styles.timelineDot(item.source)} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTime}>{item.time} - {item.source.toUpperCase()}</Text>
                  <Text style={styles.timelineMessage}>{item.message}</Text>
                </View>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { 
    backgroundColor: COLORS.brand600, 
    paddingTop: 50, 
    paddingBottom: 20, 
    paddingHorizontal: 20, 
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'center'
  },
  backButton: { position: 'absolute', left: 20, top: 50, zIndex: 10 },
  headerTitle: { color: COLORS.white, fontSize: 18, fontWeight: FONTS.bold },
  demoBadge: { position: 'absolute', right: 20, top: 50, backgroundColor: COLORS.red500, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  demoBadgeText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },
  content: { padding: 16 },
  card: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 16, ...SHADOW.small },
  sectionTitle: { fontSize: 16, fontWeight: FONTS.bold, color: COLORS.slate800, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  label: { fontSize: 14, color: COLORS.slate600, fontWeight: FONTS.medium },
  langBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, marginLeft: 8 },
  langBtnActive: { backgroundColor: COLORS.brand100, borderColor: COLORS.brand600 },
  langText: { fontSize: 12, color: COLORS.slate600, fontWeight: FONTS.bold },
  langTextActive: { color: COLORS.brand600 },
  
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, marginBottom: 10 },
  buttonText: { color: COLORS.white, fontWeight: FONTS.bold, marginLeft: 8, fontSize: 14 },
  buttonOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  buttonOutlineText: { color: COLORS.brand600, fontWeight: FONTS.bold, marginLeft: 8, fontSize: 14 },
  
  timelineContainer: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginTop: 8, minHeight: 200, ...SHADOW.small },
  emptyText: { color: COLORS.slate400, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
  timelineItem: { flexDirection: 'row', marginBottom: 12 },
  timelineDot: (source) => ({
    width: 10, height: 10, borderRadius: 5, marginTop: 4,
    backgroundColor: source === 'voice_ai' ? COLORS.purple500 : source === 'iot' ? COLORS.teal500 : source === 'mobile' ? COLORS.brand500 : COLORS.slate400
  }),
  timelineContent: { marginLeft: 12, flex: 1 },
  timelineTime: { fontSize: 10, color: COLORS.slate500, fontWeight: 'bold' },
  timelineMessage: { fontSize: 13, color: COLORS.slate800, marginTop: 2 }
});

export default DemoScenarioScreen;
