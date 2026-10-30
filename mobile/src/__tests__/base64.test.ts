import { bytesToBase64 } from '@/utils/base64';

describe('bytesToBase64 (hand-written encoder) matches the Node reference implementation', () => {
  it('handles every padding case', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 31, 32, 33, 1000, 1001, 1002]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
  it('encodes every possible byte value', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(bytesToBase64(all)).toBe(Buffer.from(all).toString('base64'));
  });
  it('accepts an ArrayBuffer (what the HTTP client returns) and a real PDF header', () => {
    const header = Uint8Array.from(Buffer.from('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3', 'latin1'));
    expect(bytesToBase64(header.buffer.slice(header.byteOffset, header.byteOffset + header.byteLength) as ArrayBuffer)).toBe(Buffer.from(header).toString('base64'));
  });
  it('encodes a large (2 MB) payload correctly', () => {
    const big = Uint8Array.from({ length: 2_000_000 }, (_, i) => (i * 131 + 7) % 256);
    expect(bytesToBase64(big)).toBe(Buffer.from(big).toString('base64'));
  });
});
