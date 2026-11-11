/**
 * Sync codes and end-to-end encryption, using only the browser's WebCrypto.
 *
 * A sync code is 160 random bits, written as 32 Crockford base32 characters.
 * HKDF turns it into three independent values:
 * - groupId: names the group on the server (reveals nothing about the code);
 * - authToken: proves membership (the server keeps only its SHA-256 hash);
 * - encryption key (AES-256-GCM): never leaves the device.
 * Data is gzipped, then encrypted with a fresh random IV every time; the
 * groupId is bound in as additional data so a blob can't be moved to another
 * group.
 */

/** Byte arrays backed by a plain ArrayBuffer (what WebCrypto accepts). */
type Bytes = Uint8Array<ArrayBuffer>;

const CODE_BYTES = 20;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I, L, O, U)
const SALT = new TextEncoder().encode('pinochle-score sync v1');

export interface SyncKeys {
  groupId: string;
  authToken: string;
  key: CryptoKey;
}

export function generateCode(): string {
  return formatCode(crypto.getRandomValues(new Uint8Array(CODE_BYTES)));
}

/** "ABCD-EFGH-..." groups of four, for reading aloud or typing. */
export function formatCode(bytes: Uint8Array): string {
  return (base32(bytes).match(/.{1,4}/g) ?? []).join('-');
}

/** Parse a code as typed: case, spaces and dashes don't matter; O/I/L read as 0/1/1. */
export function parseCode(input: string): Bytes | null {
  const clean = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{32}$/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | ALPHABET.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

export async function deriveKeys(code: Bytes): Promise<SyncKeys> {
  const ikm = await crypto.subtle.importKey('raw', code, 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ]);
  const bits = (info: string, length: number) =>
    crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: new TextEncoder().encode(info) },
      ikm,
      length,
    );
  const groupId = hex(new Uint8Array(await bits('group-id', 128)));
  const authToken = base64url(new Uint8Array(await bits('auth-token', 256)));
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: new TextEncoder().encode('data-key') },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { groupId, authToken, key };
}

/** gzip + AES-GCM; returns base64 of (12-byte IV || ciphertext). */
export async function encrypt(keys: SyncKeys, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const packed = await gzip(new TextEncoder().encode(plaintext));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(keys.groupId) },
      keys.key,
      packed,
    ),
  );
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return base64(out);
}

/** Reverse of encrypt. Throws if the data was tampered with or the key is wrong. */
export async function decrypt(keys: SyncKeys, data: string): Promise<string> {
  const bytes = fromBase64(data);
  if (bytes.length < 13) throw new Error('Sync data is damaged');
  const packed = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: bytes.slice(0, 12),
      additionalData: new TextEncoder().encode(keys.groupId),
    },
    keys.key,
    bytes.slice(12),
  );
  return new TextDecoder().decode(await gunzip(new Uint8Array(packed)));
}

async function gzip(data: Bytes): Promise<Bytes> {
  return pipe(data, new CompressionStream('gzip'));
}

async function gunzip(data: Bytes): Promise<Bytes> {
  return pipe(data, new DecompressionStream('gzip'));
}

async function pipe(
  data: Bytes,
  transform: CompressionStream | DecompressionStream,
): Promise<Bytes> {
  const stream = new Blob([data]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET.charAt((value >> bits) & 31);
    }
  }
  if (bits > 0) out += ALPHABET.charAt((value << (5 - bits)) & 31);
  return out;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function base64url(bytes: Uint8Array): string {
  return base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64(s: string): Bytes {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
