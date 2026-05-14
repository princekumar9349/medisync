import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Modal, Alert, ActivityIndicator, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useOCRStore, MedicineExtraction } from '../../store/ocrStore';
import { apiPollScanStatus, apiPost } from '../../services/api';
import { Analytics } from '../../utils/analytics';
import { useFadeSlideIn } from '../../utils/animations';
import { COLORS, SEMANTIC } from '../../theme';

// Subcomponents
import MedicineCard from '../../components/ocr/MedicineCard';
import SaveConfirmationModal from '../../components/ocr/SaveConfirmationModal';

// ─── Staggered Card Wrapper ───────────────────────────────────────────────────
// Applies sequential fade+slide-in per card. 60ms stagger = calm, not flashy.
// useNativeDriver: true ensures 60fps even on low-end Android.
function StaggeredCard({ children, index }: { children: React.ReactNode; index: number }) {
  const anim = useFadeSlideIn(index * 60);
  return <Animated.View style={anim.style}>{children}</Animated.View>;
}


export default function OCRReviewScreen() {
  const navigation = useNavigation();
  const { 
    activeJobId, imageUris, status, error, overallConfidence, medicines, 
    jobStartedAt, updateStatus, setExtraction, clearJob 
  } = useOCRStore();

  const [pollingAttempt, setPollingAttempt] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Polling Logic
  useEffect(() => {
    if (status !== 'PENDING' || !activeJobId) return;

    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      try {
        const timeElapsed = Date.now() - (jobStartedAt || Date.now());
        if (timeElapsed > 60000) {
          // Hard timeout at 60s
          updateStatus('FAILED', 'Scanning is taking too long. Please try again.');
          Analytics.error('OCR_TIMEOUT');
          return;
        }

        const res = await apiPollScanStatus(activeJobId);
        
        if (res.status === 'COMPLETED') {
          Analytics.track('OCR_COMPLETED', { confidence: res.extraction.overall_confidence });
          setExtraction(res.extraction.overall_confidence, res.extraction.medicines);
          updateStatus('COMPLETED');
        } else if (res.status === 'FAILED') {
          Analytics.error('OCR_FAILED', { reason: res.error });
          updateStatus('FAILED', res.error || 'Failed to extract prescription data.');
        } else {
          // Still pending. Exponential backoff (2s -> 3s -> 4.5s max 10s)
          setPollingAttempt(prev => prev + 1);
          const nextInterval = Math.min(2000 * Math.pow(1.5, pollingAttempt), 10000);
          timeoutId = setTimeout(poll, nextInterval);
        }
      } catch (err) {
        // Network error during polling, just retry unless timed out
        console.warn('Polling error:', err);
        const nextInterval = Math.min(2000 * Math.pow(1.5, pollingAttempt), 10000);
        timeoutId = setTimeout(poll, nextInterval);
      }
    };

    poll();

    return () => clearTimeout(timeoutId);
  }, [activeJobId, status, pollingAttempt]);

  const handleCancel = () => {
    Alert.alert(
      "Cancel Review?",
      "Are you sure you want to discard this scan?",
      [
        { text: "No", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => {
            Analytics.track('OCR_ABANDONED');
            clearJob();
            navigation.goBack();
        }}
      ]
    );
  };

  const handleFinalSave = async (finalMedicines: MedicineExtraction[]) => {
    try {
      // Logic to save to actual backend
      const payload = {
        medicines: finalMedicines.map(m => ({
          name: m.name,
          duration: m.duration,
          schedule: m.inferred_timing, // the array from parser
          instructions: m.instructions
        }))
      };
      
      await apiPost('/medications/batch', payload); // Assuming this endpoint exists, or similar
      Analytics.track('OCR_SAVED_SUCCESS', { count: finalMedicines.length });
      
      clearJob();
      navigation.navigate('PatientTabs', { screen: 'Pillbox' });
    } catch (err) {
      Alert.alert("Save Failed", err.message);
    }
  };

  // ─── Render: Progress ────────────────────────────────────────────────────────
  if (status === 'PENDING') {
    const elapsedSecs = jobStartedAt ? Math.floor((Date.now() - jobStartedAt) / 1000) : 0;
    let message = 'Analyzing handwriting…';
    if (elapsedSecs > 5) message = 'Structuring medicines…';
    if (elapsedSecs > 15) message = 'Preparing schedules…';
    let submessage = 'This usually takes a few seconds.';
    if (elapsedSecs > 20) submessage = 'Almost there. Verifying accuracy…';

    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: '#FAFAFA', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        accessibilityLabel="Prescription being analyzed. Please wait."
      >
        <View style={{
          width: 80, height: 80, borderRadius: 40,
          backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginBottom: 24,
        }}>
          <ActivityIndicator size="large" color={COLORS.brand500} />
        </View>
        <Text style={{ fontSize: 20, fontWeight: '700', color: COLORS.slate800, textAlign: 'center' }}>{message}</Text>
        <Text style={{ marginTop: 8, textAlign: 'center', color: COLORS.slate500, lineHeight: 22 }}>
          {submessage}{`\n`}We are ensuring everything is accurate.
        </Text>
      </SafeAreaView>
    );
  }

  // ─── Render: Error ───────────────────────────────────────────────────────────
  if (status === 'FAILED') {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center p-6">
        <Ionicons name="warning" size={64} color="#EF4444" />
        <Text className="mt-4 text-xl font-bold text-slate-800">Scan Failed</Text>
        <Text className="mt-2 text-center text-slate-600">{error}</Text>
        <TouchableOpacity 
          className="mt-8 bg-teal-600 px-8 py-3 rounded-xl"
          onPress={() => { clearJob(); navigation.goBack(); }}
        >
          <Text className="text-white font-bold text-lg">Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ─── Render: Review (COMPLETED) ──────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F9FC' }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
      }}>
        <TouchableOpacity
          onPress={handleCancel}
          style={{ padding: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel review and discard scan"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={28} color={COLORS.slate700} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.slate800 }}>Review Medicines</Text>
        <TouchableOpacity
          onPress={() => setShowOriginal(!showOriginal)}
          style={{ padding: 8 }}
          accessibilityRole="button"
          accessibilityLabel={showOriginal ? 'Back to extracted medicines' : 'View original prescription image'}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={showOriginal ? 'list' : 'image-outline'} size={26} color={COLORS.brand600} />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View className="flex-1">
        {showOriginal ? (
          <View className="flex-1 bg-black">
            {imageUris[0] && (
              <Image 
                source={{ uri: imageUris[0] }} 
                className="flex-1" 
                resizeMode="contain" 
              />
            )}
            <View className="absolute bottom-6 w-full items-center">
              <TouchableOpacity 
                className="bg-white/90 px-6 py-3 rounded-full flex-row items-center"
                onPress={() => setShowOriginal(false)}
              >
                <Ionicons name="list" size={20} color={COLORS.slate800} />
                <Text className="ml-2 font-bold text-slate-800">Back to Extraction</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }} contentContainerStyle={{ paddingBottom: 120 }}>
            {overallConfidence < 0.8 && (
              <View style={{
                backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
                padding: 16, borderRadius: 16, marginBottom: 20,
                flexDirection: 'row', alignItems: 'flex-start',
              }}>
                <Ionicons name="warning" size={20} color="#F59E0B" style={{ marginTop: 2, marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: '#92400e', fontSize: 14 }}>Low Confidence Scan</Text>
                  <Text style={{ color: '#B45309', fontSize: 13, marginTop: 4, lineHeight: 20 }}>
                    The handwriting was difficult to read. Please carefully review all fields below before saving.
                  </Text>
                </View>
              </View>
            )}

            {/* Medicine cards — stagger fade in */}
            {medicines.map((med, index) => (
              <StaggeredCard key={med.id || index} index={index}>
                <MedicineCard index={index} medicine={med} />
              </StaggeredCard>
            ))}

            <TouchableOpacity
              style={{
                marginTop: 8, marginBottom: 32, paddingVertical: 16,
                borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.brand300,
                backgroundColor: COLORS.brand50, borderRadius: 16, alignItems: 'center',
              }}
              accessibilityRole="button"
              accessibilityLabel="Add a medicine that was missed in the scan"
            >
              <Text style={{ color: COLORS.brand700, fontWeight: '700' }}>+ Add Missing Medicine</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      {/* Footer Action */}
      {!showOriginal && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB',
          padding: 16, paddingBottom: 28,
        }}>
          <TouchableOpacity
            style={{
              backgroundColor: COLORS.brand600, borderRadius: 16,
              paddingVertical: 16, alignItems: 'center',
            }}
            onPress={() => setShowSaveModal(true)}
            accessibilityRole="button"
            accessibilityLabel={`Review and save ${medicines.length} medicines`}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>Review &amp; Save</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Save Modal */}
      <SaveConfirmationModal
        visible={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onConfirm={() => handleFinalSave(medicines)}
        medicines={medicines}
      />
    </SafeAreaView>
  );
}
