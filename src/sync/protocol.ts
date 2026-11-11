/**
 * Sync API contract, shared by the app and the Worker. Kept free of browser-
 * and Worker-specific APIs so both sides (and unit tests) can import it.
 *
 * The server only ever sees `groupId` (derived from the sync code, not the
 * code itself), a hash of `authToken`, and encrypted data it cannot read.
 */

/** 16 bytes as lowercase hex. */
export const GROUP_ID_PATTERN = /^[0-9a-f]{32}$/;
/** 32 bytes as base64url (no padding). */
export const AUTH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Largest encrypted payload accepted (base64 text). The data is gzipped first, so this is ample. */
export const MAX_DATA_CHARS = 1_400_000;
/** Largest request body accepted. */
export const MAX_BODY_BYTES = MAX_DATA_CHARS + 1_000;

/** WebSocket subprotocol: browsers can't set headers on WebSockets, so the token rides here. */
export const LIVE_PROTOCOL = 'pinochle-sync';
export const LIVE_AUTH_PREFIX = 'auth.';

export const syncPath = (groupId: string) => `/api/sync/${groupId}`;
export const livePath = (groupId: string) => `/api/sync/${groupId}/live`;

export interface SyncGet {
  version: number;
  data: string;
}
export interface SyncPut {
  /** The version this write is based on; 0 to create the group. */
  baseVersion: number;
  data: string;
}
export interface SyncPutOk {
  version: number;
}
/** 409: someone else wrote first; pull, merge and try again. */
export interface SyncConflict {
  version: number;
}
/** Pushed over the live socket after every successful write. */
export interface LiveNotice {
  version: number;
}

export function isSyncPut(v: unknown): v is SyncPut {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.baseVersion === 'number' &&
    Number.isSafeInteger(o.baseVersion) &&
    o.baseVersion >= 0 &&
    typeof o.data === 'string' &&
    o.data.length > 0 &&
    o.data.length <= MAX_DATA_CHARS &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(o.data)
  );
}

/** Compare two equal-length strings without an early exit (for secret comparisons). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
