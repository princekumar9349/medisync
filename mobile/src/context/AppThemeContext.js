/**
 * context/AppThemeContext.js
 * 
 * Provides Elder Mode (large fonts) and High Contrast (dark/accessible theme)
 * to all screens. Reads from uiStore and applies via React Context.
 * 
 * Usage:
 *   import { useAppTheme } from '../context/AppThemeContext';
 *   const { fontSize, colors, isElderly, isHighContrast } = useAppTheme();
 */

import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { useUIStore } from '../store/uiStore';

// ─── High Contrast Color Override ─────────────────────────────────────────────
const HIGH_CONTRAST_COLORS = {
  background:  '#000000',
  surface:     '#111111',
  card:        '#1a1a1a',
  border:      '#444444',
  text:        '#FFFFFF',
  textSub:     '#CCCCCC',
  textMuted:   '#999999',
  brand:       '#00FFCC',
  brandLight:  '#004D40',
  danger:      '#FF4444',
  success:     '#00FF88',
  warning:     '#FFD700',
};

const NORMAL_COLORS = {
  background:  '#F8FAFC',
  surface:     '#FFFFFF',
  card:        '#FFFFFF',
  border:      '#E2E8F0',
  text:        '#1E293B',
  textSub:     '#475569',
  textMuted:   '#94A3B8',
  brand:       '#0D9488',
  brandLight:  '#F0FDFA',
  danger:      '#EF4444',
  success:     '#10B981',
  warning:     '#F59E0B',
};

// ─── Font Scale ────────────────────────────────────────────────────────────────
const FONT_SCALE_NORMAL = {
  xs:   11,
  sm:   13,
  base: 15,
  md:   15,
  lg:   17,
  xl:   20,
  '2xl': 24,
  '3xl': 30,
};

const FONT_SCALE_ELDERLY = {
  xs:   14,
  sm:   16,
  base: 19,
  md:   19,
  lg:   22,
  xl:   26,
  '2xl': 30,
  '3xl': 36,
};

// ─── Context ───────────────────────────────────────────────────────────────────
const AppThemeContext = createContext({
  isElderly:      false,
  isHighContrast: false,
  colors:         NORMAL_COLORS,
  fontSize:       FONT_SCALE_NORMAL,
  cardStyle:      {},
  textStyle:      {},
  headingStyle:   {},
});

export function AppThemeProvider({ children }) {
  const { isElderlyMode, isHighContrast } = useUIStore();

  const colors   = isHighContrast ? HIGH_CONTRAST_COLORS : NORMAL_COLORS;
  const fontSize = isElderlyMode  ? FONT_SCALE_ELDERLY   : FONT_SCALE_NORMAL;

  const value = {
    isElderly:      isElderlyMode,
    isHighContrast,
    colors,
    fontSize,

    // Ready-made style snippets screens can spread in
    cardStyle: {
      backgroundColor: colors.card,
      borderColor:     colors.border,
      borderRadius:    isElderlyMode ? 20 : 16,
      padding:         isElderlyMode ? 20 : 16,
    },
    textStyle: {
      color:    colors.text,
      fontSize: fontSize.base,
    },
    headingStyle: {
      color:      colors.text,
      fontSize:   fontSize.xl,
      fontWeight: '800',
    },
    subTextStyle: {
      color:    colors.textSub,
      fontSize: fontSize.sm,
    },
    screenStyle: {
      flex:            1,
      backgroundColor: colors.background,
    },
  };

  return (
    <AppThemeContext.Provider value={value}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(AppThemeContext);
}

export default AppThemeContext;
