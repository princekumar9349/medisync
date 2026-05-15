/**
 * services/scanService.js — Centralized OCR scan service
 *
 * Encapsulates all scan logic away from UI components:
 *   1. Image → multipart upload  → /scan  → {job_id}
 *   2. Poll  → /scan/status/{id} → COMPLETED|FAILED
 *   3. Extract medicines, confidence, raw_text
 *
 * Exported hooks:
 *   useScanService()  — React hook for components
 *
 * Exported functions (pure, no React):
 *   submitScanJob(imageUri)
 *   pollScanJob(jobId, opts)
 *   runFullScan(imageUri, callbacks)
 */

import { Platform } from 'react-native';
import { API_BASE, getToken } from './api';

// ─── Constants ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS  = 2000;   // 2 second base interval
const MAX_POLL_TIME_MS  = 60000;  // 60 second hard timeout
const UPLOAD_TIMEOUT_MS = 45000;  // 45 second upload timeout

// ─── Error normalizer ─────────────────────────────────────────────────────────
export function normalizeError(err) {
  if (!err) return 'An unexpected error occurred.';
  // Server error with detail field (FastAPI style)
  if (err?.response?.data?.detail) return err.response.data.detail;
  // Fetch-level error with message
  if (err?.message) return err.message;
  // Raw string
  if (typeof err === 'string') return err;
  // Last resort — stringify but never show [object Object]
  try {
    const s = JSON.stringify(err);
    return s === '{}' ? 'An unexpected error occurred.' : s;
  } catch {
    return 'An unexpected error occurred.';
  }
}

// ─── Step 1: Submit image ─────────────────────────────────────────────────────
/**
 * Submit a prescription image to the async OCR pipeline.
 * Backend: POST /scan (multipart/form-data, field: "files")
 * Returns: { job_id: string, status: string }
 */
export async function submitScanJob(imageUri) {
  const token = await getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const formData = new FormData();

  if (Platform.OS === 'web') {
    // Web: convert URI to blob
    const blobRes = await fetch(imageUri);
    const blob = await blobRes.blob();
    formData.append('files', blob, 'prescription.jpg');
  } else {
    // Native: React Native FormData object format
    // Backend uses `files: List[UploadFile] = File(...)` — field name is "files"
    formData.append('files', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'prescription.jpg',
    });
  }

  console.log('[scanService] Submitting to', `${API_BASE}/scan`);

  const controller = new AbortController();
  const uploadTimer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/scan`, {
      method:  'POST',
      headers,
      body:    formData,
      signal:  controller.signal,
    });

    clearTimeout(uploadTimer);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.detail || `Upload failed (HTTP ${res.status})`;
      console.error('[scanService] Upload HTTP error:', res.status, errBody);
      throw new Error(msg);
    }

    const data = await res.json();
    console.log('[scanService] Job created:', JSON.stringify(data));
    // Expected: { job_id: "...", status: "PENDING" | "PROCESSING" }
    return data;
  } catch (err) {
    clearTimeout(uploadTimer);
    if (err.name === 'AbortError') {
      throw new Error('Upload timed out after 45s. Check your connection and try again.');
    }
    throw new Error(normalizeError(err));
  }
}

// ─── Step 2: Poll single status check ────────────────────────────────────────
/**
 * Single poll of OCR job status.
 * Returns the raw status response from the backend.
 */
export async function pollScanStatus(jobId) {
  const token = await getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/scan/status/${jobId}`, { headers });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.detail || `Status check failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  console.log('[scanService] Poll response:', JSON.stringify(data));
  return data;
}

// ─── Step 3: Poll with timeout ────────────────────────────────────────────────
/**
 * Poll until COMPLETED or FAILED, with 60s hard timeout.
 *
 * @param {string} jobId
 * @param {object} opts
 *   onStageChange(stage: 0-3)   — UI progress callback
 *   onAttempt(n: number)        — raw attempt count callback
 * @returns {object} final status response (status=COMPLETED with extraction data)
 */
export async function pollScanWithTimeout(jobId, opts = {}) {
  const { onStageChange, onAttempt } = opts;
  const startTime = Date.now();
  let attempts = 0;

  return new Promise((resolve, reject) => {
    let pollTimer = null;

    async function tick() {
      attempts++;
      if (onAttempt) onAttempt(attempts);

      // Hard timeout guard
      if (Date.now() - startTime > MAX_POLL_TIME_MS) {
        reject(new Error('Analysis timed out after 60 seconds. Please try again.'));
        return;
      }

      // Visual stage progression based on elapsed time
      const elapsed = Date.now() - startTime;
      if (onStageChange) {
        if (elapsed < 8000)  onStageChange(1); // Reading text
        else if (elapsed < 20000) onStageChange(2); // Extracting medicines
        else               onStageChange(3); // Building schedule
      }

      try {
        const data = await pollScanStatus(jobId);

        if (data?.status === 'COMPLETED') {
          console.log('[scanService] OCR COMPLETED:', JSON.stringify(data));
          resolve(data);
          return;
        }

        if (data?.status === 'FAILED') {
          const msg = data?.error || 'Prescription analysis failed.';
          console.error('[scanService] OCR FAILED:', msg);
          reject(new Error(msg));
          return;
        }

        // PENDING | PROCESSING — schedule next poll
        // Exponential backoff: 2s → 3s → 4s (max 5s)
        const nextDelay = Math.min(POLL_INTERVAL_MS * Math.pow(1.2, Math.min(attempts, 5)), 5000);
        pollTimer = setTimeout(tick, nextDelay);

      } catch (pollErr) {
        console.warn('[scanService] Poll network error (retrying):', normalizeError(pollErr));
        // Network errors during poll — silently retry (don't fail the whole job)
        if (Date.now() - startTime < MAX_POLL_TIME_MS) {
          pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
        } else {
          reject(new Error('Lost connection while waiting for analysis. Please try again.'));
        }
      }
    }

    // Start immediately
    tick();

    // Return a cancel function as a side-effect via opts
    if (opts.onCancel) {
      opts.cancelFn = () => {
        if (pollTimer) clearTimeout(pollTimer);
        reject(new Error('Scan cancelled.'));
      };
    }
  });
}

// ─── Full orchestrated scan ───────────────────────────────────────────────────
/**
 * Run the complete scan pipeline:
 *   1. Submit image
 *   2. Poll for result
 *   3. Return { jobId, extraction }
 *
 * @param {string} imageUri
 * @param {object} callbacks
 *   onStageChange(stage)  — 0=uploading, 1=reading, 2=extracting, 3=scheduling
 *   onJobCreated(jobId)   — called when job_id received
 * @returns {{ jobId, extraction }}
 */
export async function runFullScan(imageUri, callbacks = {}) {
  const { onStageChange, onJobCreated } = callbacks;

  // Stage 0: uploading
  if (onStageChange) onStageChange(0);

  const submitResult = await submitScanJob(imageUri);
  const jobId = submitResult?.job_id;

  if (!jobId) {
    throw new Error('Server did not return a scan job ID. Please try again.');
  }

  if (onJobCreated) onJobCreated(jobId);

  // Stage 1+: polling
  if (onStageChange) onStageChange(1);

  const finalResult = await pollScanWithTimeout(jobId, {
    onStageChange,
    onAttempt: (n) => {
      if (__DEV__) console.log(`[scanService] Poll attempt #${n} for job ${jobId}`);
    },
  });

  // Extract the OCR payload
  const extraction = finalResult?.extraction ?? finalResult;
  const medicines  = extraction?.medicines ?? [];
  const confidence = extraction?.overall_confidence ?? extraction?.confidence_score ?? 0;
  const rawText    = extraction?.raw_text ?? extraction?.ocr_text ?? '';

  console.log(`[scanService] PARSED MEDS (${medicines.length}):`, JSON.stringify(medicines));
  console.log('[scanService] Confidence:', confidence, '| Raw text length:', rawText.length);

  return {
    jobId,
    medicines,
    confidence,
    rawText,
    extraction,
  };
}
