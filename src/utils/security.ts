/**
 * Autonomous Telegram Channel Manager - Security Utilities
 *
 * Provides cryptographic timing-safe string comparison and secret handling.
 */

/**
 * Perform a constant-time string comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);

  if (aBuf.byteLength !== bBuf.byteLength) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < aBuf.byteLength; i++) {
    result |= aBuf[i] ^ bBuf[i];
  }

  return result === 0;
}
