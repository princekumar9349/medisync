/**
 * utils/parseAIResponse.js — Centralized AI response cleanup
 *
 * NEVER allows raw JSON, object literals, or escaped strings to reach the UI.
 *
 * Usage:
 *   import parseAIResponse from '../../utils/parseAIResponse';
 *   const text = parseAIResponse(apiResult);
 */

/**
 * Safely extract a readable string from any AI/backend response shape.
 * Handles: string, {response}, {answer}, {text}, {message}, nested objects,
 * JSON-stringified objects like "{'text': '...'}", and escaped sequences.
 *
 * @param {*} raw — anything returned by the API
 * @param {string} fallback — shown if nothing extractable
 * @returns {string}
 */
export default function parseAIResponse(
  raw,
  fallback = "I'm having trouble right now. Please try again."
) {
  if (!raw) return fallback;

  // Already a plain string
  if (typeof raw === 'string') {
    return cleanText(raw) || fallback;
  }

  // Object — try known fields in priority order
  if (typeof raw === 'object') {
    const candidates = [
      raw.response,
      raw.answer,
      raw.text,
      raw.message,
      raw.content,
      raw.reply,
    ];
    for (const c of candidates) {
      if (c && typeof c === 'string') {
        return cleanText(c) || fallback;
      }
      // Nested one level deep
      if (c && typeof c === 'object') {
        const inner = c.text || c.response || c.answer || c.message;
        if (inner && typeof inner === 'string') return cleanText(inner) || fallback;
      }
    }
    // Last resort: JSON.stringify but only for dev debugging — never shown to users
    return fallback;
  }

  return fallback;
}

/**
 * Cleans extracted text:
 * - Strips Python-style dict wrappers like {'text': "..."}
 * - Removes escaped chars \n \t
 * - Collapses excess whitespace
 * - Strips leading/trailing quotes
 */
function cleanText(text) {
  if (!text || typeof text !== 'string') return '';

  let t = text.trim();

  // Strip Python-style dict: {'response': "actual text"} or {"text": "actual text"}
  const dictMatch = t.match(/^\{['"]\w+['"]\s*:\s*['"]([\s\S]+)['"]\s*\}$/);
  if (dictMatch) t = dictMatch[1];

  // Strip JSON string wrapper: "{\"text\":\"actual text\"}"
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const parsed = JSON.parse(t);
      if (typeof parsed === 'object') {
        const v = parsed.response || parsed.answer || parsed.text || parsed.message;
        if (v && typeof v === 'string') t = v;
      }
    } catch {
      // not valid JSON — keep as-is
    }
  }

  // Replace escaped newlines and tabs with real ones
  t = t.replace(/\\n/g, '\n').replace(/\\t/g, ' ');

  // Strip leading/trailing single or double quotes if the whole string is quoted
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1);
  }

  // Normalize multiple blank lines → single blank line
  t = t.replace(/\n{3,}/g, '\n\n');

  return t.trim();
}
