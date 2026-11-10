const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ALGO: Record<string, string> = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' };

function base32(s: string): Uint8Array<ArrayBuffer> {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const v = B32.indexOf(c);
    if (v < 0) throw new Error('bad base32');
    bits += v.toString(2).padStart(5, '0');
  }
  const out = new Uint8Array(new ArrayBuffer(Math.floor(bits.length / 8)));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}

/** Current RFC 6238 code for an otpauth://totp/ URI. */
export async function totp(uri: string, now = Date.now()): Promise<string> {
  const q = new URL(uri).searchParams;
  const step = Number(q.get('period') ?? 30);
  const digits = Number(q.get('digits') ?? 6);
  const hash = ALGO[(q.get('algorithm') ?? 'SHA1').toUpperCase()];
  if (!hash) throw new Error('unsupported algorithm');
  const key = await crypto.subtle.importKey(
    'raw',
    base32(q.get('secret') ?? ''),
    { name: 'HMAC', hash },
    false,
    ['sign'],
  );
  const counter = new DataView(new ArrayBuffer(8));
  counter.setBigUint64(0, BigInt(Math.floor(now / 1000 / step)));
  const mac = new DataView(await crypto.subtle.sign('HMAC', key, counter.buffer));
  const off = mac.getUint8(mac.byteLength - 1) & 0x0f;
  const code = (mac.getUint32(off) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

/** Milliseconds until the next code. */
export function msToNextStep(uri: string, now = Date.now()): number {
  const step = Number(new URL(uri).searchParams.get('period') ?? 30) * 1000;
  return step - (now % step);
}
