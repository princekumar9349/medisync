/**
 * components/Toast.js — Global auto-dismissing toast system.
 *
 * Usage:
 *   const { showToast } = useToast();
 *   showToast('Medicines saved successfully.', 'success');
 *
 * Types: 'success' | 'warning' | 'error' | 'info'
 * Auto-dismisses after 3 seconds. Healthcare-calm styling.
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Animated, View, Text, StyleSheet, StatusBar, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSlideInTop } from '../utils/animations';
import { COLORS, FONTS, SPACING, RADIUS, SEMANTIC } from '../theme';

// ─── Context ──────────────────────────────────────────────────────────────────
const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

// ─── Toast Item ───────────────────────────────────────────────────────────────
function ToastItem({ message, type, onHide }) {
  const anim = useSlideInTop(-80);

  const config = {
    success: { bg: SEMANTIC.successBg, border: SEMANTIC.successBorder, text: SEMANTIC.success, icon: 'checkmark-circle' },
    warning: { bg: SEMANTIC.warningBg, border: SEMANTIC.warningBorder, text: SEMANTIC.warning, icon: 'warning' },
    error:   { bg: SEMANTIC.dangerBg,  border: SEMANTIC.dangerBorder,  text: SEMANTIC.danger,  icon: 'alert-circle' },
    info:    { bg: SEMANTIC.infoBg,    border: SEMANTIC.infoBorder,    text: SEMANTIC.info,    icon: 'information-circle' },
  }[type] || { bg: SEMANTIC.infoBg, border: SEMANTIC.infoBorder, text: SEMANTIC.info, icon: 'information-circle' };

  return (
    <Animated.View
      style={[
        styles.toastCard,
        { backgroundColor: config.bg, borderColor: config.border },
        anim.style,
      ]}
      accessible={true}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
    >
      <Ionicons name={config.icon} size={20} color={config.text} style={{ marginRight: 10 }} />
      <Text style={[styles.toastText, { color: config.text }]} numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, type, key: Date.now() });
    timerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const hideToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      {toast ? (
        <View style={styles.toastContainer} pointerEvents="none">
          <ToastItem key={toast.key} message={toast.message} type={toast.type} onHide={hideToast} />
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

const STATUSBAR_H = Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 48;

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: STATUSBAR_H + 8,
    left: SPACING.lg,
    right: SPACING.lg,
    zIndex: 9999,
    elevation: 20,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 8,
  },
  toastText: {
    flex: 1,
    fontSize: FONTS.sm,
    fontWeight: FONTS.semibold,
    lineHeight: 20,
  },
});
