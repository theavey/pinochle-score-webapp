import { describe, expect, it } from 'vitest';
import {
  decrypt,
  deriveInviteKeys,
  deriveKeys,
  encrypt,
  formatCode,
  generateCode,
  generateInvite,
  openInvite,
  parseCode,
  parseInvite,
  sealInvite,
} from './crypto';
import {
  AUTH_TOKEN_PATTERN,
  GROUP_ID_PATTERN,
  INVITE_ID_PATTERN,
  MAX_INVITE_DATA_CHARS,
  inviteLive,
  isInvitePut,
} from './protocol';

describe('sync codes', () => {
  it('generates 32-character codes in groups of four that parse back', () => {
    const code = generateCode();
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    const bytes = parseCode(code);
    expect(bytes).toHaveLength(20);
    expect(formatCode(bytes ?? new Uint8Array())).toBe(code);
  });

  it('forgives case, spaces, dashes and look-alike letters', () => {
    const code = '0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ';
    const sloppy = 'o123 4567 89ab cdef ghjk mnpq rstv wxyz';
    expect(parseCode(sloppy)).toEqual(parseCode(code));
    expect(parseCode('I123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ')).toEqual(
      parseCode('1123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ'),
    );
  });

  it('rejects codes of the wrong length or with invalid letters', () => {
    expect(parseCode('ABCD')).toBeNull();
    expect(parseCode('U123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ')).toBeNull();
  });
});

describe('deriveKeys', () => {
  it('derives stable, well-formed, independent values from a code', async () => {
    const code = parseCode(generateCode());
    if (!code) throw new Error('bad code');
    const a = await deriveKeys(code);
    const b = await deriveKeys(code);
    expect(a.groupId).toMatch(GROUP_ID_PATTERN);
    expect(a.authToken).toMatch(AUTH_TOKEN_PATTERN);
    expect(a.groupId).toBe(b.groupId);
    expect(a.authToken).toBe(b.authToken);
    expect(a.authToken).not.toContain(a.groupId);
    // The encryption key can't be exported, so it can't leak by accident.
    expect(a.key.extractable).toBe(false);
  });

  it('gives different codes different groups', async () => {
    const one = await deriveKeys(parseCode(generateCode()) ?? new Uint8Array());
    const two = await deriveKeys(parseCode(generateCode()) ?? new Uint8Array());
    expect(one.groupId).not.toBe(two.groupId);
  });
});

describe('encrypt / decrypt', () => {
  const keysFor = async () => deriveKeys(parseCode(generateCode()) ?? new Uint8Array());

  it('round-trips, never repeats ciphertext, and hides the contents', async () => {
    const keys = await keysFor();
    const text = JSON.stringify({ players: [{ name: 'Ann' }, { name: 'Bob' }] });
    const a = await encrypt(keys, text);
    const b = await encrypt(keys, text);
    expect(a).not.toBe(b);
    expect(await decrypt(keys, a)).toBe(text);
    expect(atob(a)).not.toContain('Ann');
  });

  it('compresses repetitive data', async () => {
    const keys = await keysFor();
    const text = JSON.stringify(Array.from({ length: 500 }, () => ({ bid: 25, meld: [10, 5] })));
    expect((await encrypt(keys, text)).length).toBeLessThan(text.length / 5);
  });

  it('rejects the wrong key, another group, and tampering', async () => {
    const keys = await keysFor();
    const other = await keysFor();
    const data = await encrypt(keys, 'secret');
    await expect(decrypt(other, data)).rejects.toThrow();
    await expect(decrypt({ ...keys, groupId: other.groupId }, data)).rejects.toThrow();
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    bytes[20] = (bytes[20] ?? 0) ^ 1;
    const tampered = btoa(String.fromCharCode(...bytes));
    await expect(decrypt(keys, tampered)).rejects.toThrow();
  });
});

describe('invites', () => {
  it('generates short codes that parse back, forgiving typing', () => {
    const invite = generateInvite();
    expect(invite).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(parseInvite(invite)).toBe(invite.replace('-', ''));
    expect(parseInvite(' 7kq2m x9ard ')).toBe('7KQ2MX9ARD');
    expect(parseInvite('oIL2M-X9ARD')).toBe('0112MX9ARD');
  });

  it('rejects anything that is not an invite, including old permanent sync codes', () => {
    expect(parseInvite('7KQ2M-X9AR')).toBeNull();
    expect(parseInvite('7KQ2M-X9ARU')).toBeNull();
    expect(parseInvite(generateCode())).toBeNull();
  });

  it('round-trips a sync code; the invite id reveals neither', async () => {
    const invite = parseInvite(generateInvite()) ?? '';
    const groupCode = generateCode();
    const keys = await deriveInviteKeys(invite);
    expect(keys.inviteId).toMatch(INVITE_ID_PATTERN);
    expect(keys.inviteId).not.toContain(invite.toLowerCase());
    const sealed = await sealInvite(keys, groupCode);
    expect(sealed).not.toContain(groupCode);
    expect(isInvitePut({ data: sealed })).toBe(true);
    expect(sealed.length).toBeLessThanOrEqual(MAX_INVITE_DATA_CHARS);
    expect(await openInvite(await deriveInviteKeys(invite), sealed)).toBe(groupCode);
  });

  it('a different invite cannot open it', async () => {
    const keys = await deriveInviteKeys(parseInvite(generateInvite()) ?? '');
    const other = await deriveInviteKeys(parseInvite(generateInvite()) ?? '');
    const sealed = await sealInvite(keys, generateCode());
    expect(other.inviteId).not.toBe(keys.inviteId);
    await expect(openInvite(other, sealed)).rejects.toThrow();
    // Same key but a different id (moved to another invite) fails too.
    await expect(openInvite({ ...keys, inviteId: other.inviteId }, sealed)).rejects.toThrow();
  });

  it('expires at the deadline', () => {
    expect(inviteLive(1000, 999)).toBe(true);
    expect(inviteLive(1000, 1000)).toBe(false);
  });

  it('accepts only small base64 payloads', () => {
    expect(isInvitePut({ data: 'QUJD' })).toBe(true);
    expect(isInvitePut({ data: '' })).toBe(false);
    expect(isInvitePut({ data: 'not base64!' })).toBe(false);
    expect(isInvitePut({ data: 'A'.repeat(MAX_INVITE_DATA_CHARS + 4) })).toBe(false);
    expect(isInvitePut(null)).toBe(false);
  });
});
