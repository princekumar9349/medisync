/**
 * utils/animations.js — Shared animation hooks for Medisync
 *
 * All animations use useNativeDriver: true for 60fps on low-end Android.
 * This file centralizes all motion logic to prevent inconsistent animations.
 *
 * Healthcare design principle: animations should reassure, not distract.
 * Max duration: 400ms. No spring/bounce. No overshooting.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { ANIMATION } from '../theme';

// ─── Fade + Slide In ──────────────────────────────────────────────────────────
/**
 * Fades in and slides up slightly from 12px below.
 * Use for cards appearing after data loads, or OCR card stagger.
 * @param {number} delay — stagger offset in ms (default 0)
 */
export function useFadeSlideIn(delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: ANIMATION.normal,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: ANIMATION.normal,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, []);

  return {
    style: { opacity, transform: [{ translateY }] },
  };
}

// ─── Pulse ────────────────────────────────────────────────────────────────────
/**
 * Gentle loop pulse (scale 1.0 → 1.08 → 1.0).
 * Use for critical badges and SOS buttons. Keep subtle.
 */
export function usePulse(minScale = 0.92, maxScale = 1.0, duration = 800) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: minScale,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: maxScale,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return { style: { transform: [{ scale }] } };
}

// ─── Shimmer ──────────────────────────────────────────────────────────────────
/**
 * Returns an animated X-translation for a shimmer/skeleton loader.
 * The consumer applies it to an absolutely-positioned gradient overlay.
 */
export function useShimmer() {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return shimmer;
}

// ─── Fade In ─────────────────────────────────────────────────────────────────
/**
 * Simple opacity fade-in. Use for toast appearance, modals.
 */
export function useFadeIn(duration = ANIMATION.normal) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, []);

  return { style: { opacity } };
}

// ─── Slide In from Top ────────────────────────────────────────────────────────
/**
 * Slides an element down from -Y (for toasts/banners entering from top).
 */
export function useSlideInTop(fromY = -60, duration = ANIMATION.normal) {
  const translateY = useRef(new Animated.Value(fromY)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, []);

  return { style: { transform: [{ translateY }] } };
}
