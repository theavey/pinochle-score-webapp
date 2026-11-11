import { useEffect, useState } from 'preact/hooks';
import { mergeStates } from '../domain/merge';
import type { AppState } from '../domain/types';
import { getStorage, migrate } from '../storage/persist';
import { validateAppState } from '../storage/schema';
import { applySyncedState, getState, onStateChange } from '../ui/store';
import { decrypt, deriveKeys, encrypt, formatCode, generateCode, parseCode } from './crypto';
import type { SyncKeys } from './crypto';
import { LIVE_AUTH_PREFIX, LIVE_PROTOCOL, livePath, syncPath } from './protocol';
import type { LiveNotice, SyncGet, SyncPutOk } from './protocol';

/**
 * Background sync: pull the group's encrypted copy, merge it with this
 * device's data (mergeStates), and push the result back. The app stays
 * local-first: everything works offline and syncs when it can.
 */

export type SyncStatus =
  | { state: 'off' }
  | { state: 'syncing' }
  | { state: 'synced'; at: number }
  | { state: 'offline' }
  | { state: 'error'; message: string };

const CONFIG_KEY = 'pinochle:sync:v1';
const PUSH_DELAY_MS = 800;

let keys: SyncKeys | null = null;
let code: string | null = null;
let status: SyncStatus = { state: 'off' };
let lastVersion = 0;
let running: Promise<void> | null = null;
let again = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectDelay = 1000;
let started = false;
/** Set for a group this device just created: the first sync can push without pulling. */
let freshGroup = false;
const statusListeners = new Set<() => void>();

class SyncHttpError extends Error {
  constructor(readonly status: number) {
    super(`Sync request failed (${status})`);
  }
}

function setStatus(next: SyncStatus) {
  status = next;
  for (const l of statusListeners) l();
}

export function getSyncStatus(): SyncStatus {
  return status;
}

/** The current sync code (secret), or null when sync is off. */
export function getSyncCode(): string | null {
  return code;
}

export function useSyncStatus(): SyncStatus {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => {
      setTick((t) => t + 1);
    };
    statusListeners.add(l);
    return () => {
      statusListeners.delete(l);
    };
  }, []);
  return status;
}

/** Link that joins another device to this group. The code is in the #fragment, which browsers never send to a server. */
export function inviteLink(syncCode: string): string {
  return `${window.location.origin}/#/join/${syncCode}`;
}

/** Start sync on app launch if this device was set up before. */
export function initSync(): void {
  if (started) return;
  started = true;
  onStateChange((_state, source) => {
    if (source === 'local' && keys) schedulePush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !keys) return;
    void syncNow();
  });
  window.addEventListener('online', () => {
    if (!keys) return;
    void syncNow();
  });
  const saved = loadConfig();
  if (saved) void begin(saved);
}

/** Start a new sync group from this device. Returns its code. */
export async function startNewGroup(): Promise<string> {
  const fresh = generateCode();
  await begin(fresh, true);
  return fresh;
}

/** Join an existing group. Returns false if the code isn't valid. */
export async function joinGroup(input: string): Promise<boolean> {
  const bytes = parseCode(input);
  if (!bytes) return false;
  await begin(formatCode(bytes));
  return true;
}

/** Stop syncing on this device. Its data stays; the group and other devices are unaffected. */
export function stopSync(): void {
  keys = null;
  code = null;
  lastVersion = 0;
  clearTimeout(pushTimer);
  clearTimeout(reconnectTimer);
  socket?.close(1000, 'Stopped');
  socket = null;
  try {
    getStorage()?.removeItem(CONFIG_KEY);
  } catch {
    /* nothing saved */
  }
  setStatus({ state: 'off' });
}

/**
 * Erase the group's copy on the server and start a new group (new code) with
 * this device's data. Other devices must rejoin with the new link. Use after
 * losing a device that had the old code.
 */
export async function resetGroup(): Promise<string> {
  if (keys) {
    const res = await api(keys, 'DELETE');
    if (!res.ok && res.status !== 404) throw new SyncHttpError(res.status);
  }
  stopSync();
  return startNewGroup();
}

/** Sync as soon as possible. Concurrent calls coalesce into one extra run. */
export function syncNow(): Promise<void> {
  if (!keys) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    // `again` is set by calls that arrive while this run is in flight.
    const repeat = () => again && keys !== null;
    do {
      again = false;
      await runOnce();
    } while (repeat());
  })().finally(() => {
    running = null;
  });
  return running;
}

async function begin(syncCode: string, isNew = false): Promise<void> {
  const bytes = parseCode(syncCode);
  if (!bytes) throw new Error('Invalid sync code');
  stopSync();
  freshGroup = isNew;
  keys = await deriveKeys(bytes);
  code = formatCode(bytes);
  saveConfig(code);
  await syncNow();
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void syncNow();
  }, PUSH_DELAY_MS);
}

async function runOnce(): Promise<void> {
  const k = keys;
  if (!k) return;
  setStatus({ state: 'syncing' });
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      // Pull. (A group this device just created has nothing to pull yet; if
      // that's ever wrong, the push below gets a 409 and we come back here.)
      const skipPull = freshGroup;
      freshGroup = false;
      const res = skipPull ? null : await api(k, 'GET');
      let remote: AppState | null = null;
      let remoteVersion = 0;
      if (res?.ok) {
        const body = (await res.json()) as SyncGet;
        remoteVersion = body.version;
        remote = validateAppState(migrate(JSON.parse(await decrypt(k, body.data))));
      } else if (res && res.status !== 404) {
        throw new SyncHttpError(res.status);
      }
      if (keys !== k) return; // stopped or reset meanwhile

      // Merge with what's on this device *now* and apply it in the same tick,
      // so edits made while the request was in flight aren't lost.
      const local = getState();
      const merged = remote ? validateAppState(mergeStates(local, remote)) : local;
      if (!sameSynced(merged, local)) applySyncedState(merged);
      if (remote && sameSynced(merged, remote)) {
        lastVersion = remoteVersion;
        break;
      }

      // Push the merged copy; if someone else wrote first, start over.
      const data = await encrypt(k, JSON.stringify(merged));
      const put = await api(k, 'PUT', { baseVersion: remoteVersion, data });
      if (put.status === 409) continue;
      if (!put.ok) throw new SyncHttpError(put.status);
      lastVersion = ((await put.json()) as SyncPutOk).version;
      break;
    }
    if (keys === k) {
      setStatus({ state: 'synced', at: Date.now() });
      // Listen for other devices' changes (the group exists once a sync succeeds).
      connectLive();
    }
  } catch (err) {
    if (keys !== k) return;
    console.warn('Sync failed', err);
    setStatus(describeError(err));
  }
}

function describeError(err: unknown): SyncStatus {
  if (err instanceof SyncHttpError) {
    if (err.status === 401) {
      return {
        state: 'error',
        message:
          'This sync code no longer works (it may have been reset on another device). Stop syncing here and join with the new invite link.',
      };
    }
    if (err.status === 429)
      return { state: 'error', message: 'Too many sync requests; will retry shortly.' };
    return { state: 'error', message: 'The sync server had a problem; will retry.' };
  }
  if (err instanceof TypeError || !navigator.onLine) return { state: 'offline' };
  return {
    state: 'error',
    message:
      'Synced data could not be read (wrong code, or it came from a newer version of the app).',
  };
}

function connectLive() {
  const k = keys;
  if (!k || (socket && socket.readyState <= WebSocket.OPEN)) return;
  if (document.visibilityState !== 'visible') return;
  clearTimeout(reconnectTimer);
  const url = new URL(livePath(k.groupId), window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  let ws: WebSocket;
  try {
    ws = new WebSocket(url, [LIVE_PROTOCOL, LIVE_AUTH_PREFIX + k.authToken]);
  } catch {
    return;
  }
  socket = ws;
  ws.addEventListener('open', () => {
    reconnectDelay = 1000;
  });
  ws.addEventListener('message', (e: MessageEvent) => {
    if (typeof e.data !== 'string') return;
    try {
      const notice = JSON.parse(e.data) as LiveNotice;
      if (typeof notice.version === 'number' && notice.version > lastVersion) void syncNow();
    } catch {
      /* ignore malformed notices */
    }
  });
  ws.addEventListener('close', () => {
    if (socket === ws) socket = null;
    if (keys !== k) return;
    // Reconnect with backoff while the app is open; on return to the
    // foreground it reconnects anyway.
    reconnectTimer = setTimeout(connectLive, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 60_000);
  });
}

function api(k: SyncKeys, method: 'GET' | 'PUT' | 'DELETE', body?: unknown): Promise<Response> {
  return fetch(syncPath(k.groupId), {
    method,
    headers: {
      Authorization: `Bearer ${k.authToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
}

/** Compare only what syncs, ignoring order. */
function sameSynced(a: AppState, b: AppState): boolean {
  const canon = (s: AppState) => {
    const byId = <T extends { id: string }>(xs: T[]) =>
      [...xs].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    return JSON.stringify([
      byId(s.players),
      byId(s.games),
      byId(s.tombstones.games),
      byId(s.tombstones.players),
    ]);
  };
  return canon(a) === canon(b);
}

function loadConfig(): string | null {
  try {
    const raw = getStorage()?.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: unknown };
    return typeof parsed.code === 'string' && parseCode(parsed.code) ? parsed.code : null;
  } catch {
    return null;
  }
}

function saveConfig(syncCode: string) {
  try {
    getStorage()?.setItem(CONFIG_KEY, JSON.stringify({ code: syncCode }));
  } catch {
    /* storage unavailable: sync works until the app closes */
  }
}
