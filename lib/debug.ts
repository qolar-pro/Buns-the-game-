/**
 * Development-only logging.
 *
 * Game loops log per-frame and per-asset detail that is useful locally and pure
 * noise (and a small cost) in production. These no-op outside development so the
 * call sites can stay where they are.
 */
const enabled = process.env.NODE_ENV !== 'production';

export function debug(...args: unknown[]): void {
  if (enabled) console.log(...args);
}

export function debugWarn(...args: unknown[]): void {
  if (enabled) console.warn(...args);
}

/**
 * Errors are kept in production: a failed asset load or a corrupt save is
 * something we want reported from real sessions, not silenced.
 */
export function debugError(...args: unknown[]): void {
  console.error(...args);
}
