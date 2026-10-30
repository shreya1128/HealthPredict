/**
 * Base64-encodes raw bytes without relying on `btoa`/`Buffer` (neither is guaranteed in React Native).
 * Used to hand a downloaded PDF to expo-file-system, which writes files from base64 strings.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const hasB = i + 1 < bytes.length;
    const hasC = i + 2 < bytes.length;
    const b = hasB ? bytes[i + 1] : 0;
    const c = hasC ? bytes[i + 2] : 0;
    parts.push(
      ALPHABET[a >> 2] + ALPHABET[((a & 3) << 4) | (b >> 4)] + (hasB ? ALPHABET[((b & 15) << 2) | (c >> 6)] : '=') + (hasC ? ALPHABET[c & 63] : '='),
    );
  }
  return parts.join('');
}
