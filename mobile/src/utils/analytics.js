/**
 * utils/analytics.js
 * Lightweight, future-proof analytics wrapper for Medisync.
 * Currently uses structured console logging, but can be seamlessly
 * replaced with Firebase/Mixpanel later without refactoring components.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

export const Analytics = {
  /**
   * Track a generic event with metadata payload.
   */
  track: (eventName, payload = {}) => {
    const event = {
      event: eventName,
      timestamp: new Date().toISOString(),
      ...payload,
    };
    
    if (!IS_PROD) {
      console.log(`[Analytics: Track] ${eventName}`, payload);
    }
    // TODO: Plug in Mixpanel/Firebase here
  },

  /**
   * Track screen views.
   */
  screen: (screenName, params = {}) => {
    if (!IS_PROD) {
      console.log(`[Analytics: Screen] Navigated to ${screenName}`, params);
    }
    // TODO: Plug in Firebase Analytics logScreenView here
  },

  /**
   * Track non-fatal errors or validation failures.
   */
  error: (eventName, metadata = {}) => {
    if (!IS_PROD) {
      console.warn(`[Analytics: Error] ${eventName}`, metadata);
    }
    // TODO: Plug in Sentry or Crashlytics here
  }
};
