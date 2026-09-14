/**
 * Vibration API wrapper for meaningful moments only (success/error/commit).
 * No-op on desktop browsers and any device without support — never throws.
 */
export function haptic(kind: 'success' | 'error' | 'tap' = 'tap') {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const pattern = kind === 'success' ? [12] : kind === 'error' ? [16, 40, 16] : [8];
  try { navigator.vibrate(pattern); } catch { /* unsupported or blocked; ignore */ }
}
