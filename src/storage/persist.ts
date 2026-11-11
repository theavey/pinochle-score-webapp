import { initialState } from '../domain/reducer';
import type { AppState } from '../domain/types';
import { validateAppState } from './schema';

export const STORAGE_KEY = 'pinochle:v1';
const CORRUPT_PREFIX = 'pinochle:corrupt:';

export interface LoadResult {
  state: AppState;
  /** Something the user should know about (e.g. data could not be read). */
  warning: string | null;
  /** False when storage is unusable (e.g. blocked); changes won't persist. */
  storageAvailable: boolean;
}

export function getStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__pinochle_probe__';
    s.setItem(probe, probe);
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * v1 -> v2: the hand-in-progress draft stored the *bidding* team's trick
 * points (`bidderTricks`); it now stores the *defending* team's
 * (`defenderTricks`), since they usually have fewer counters to add up.
 */
function migrateV1toV2(state: Obj): Obj {
  const games = Array.isArray(state.games)
    ? state.games.map((g: unknown) => {
        if (!isObj(g) || !isObj(g.draft)) return g;
        const { bidderTricks, ...draft } = g.draft;
        const total = isObj(g.rules) ? g.rules.trickTotal : undefined;
        const bt = typeof bidderTricks === 'string' ? /^\d{1,6}$/.exec(bidderTricks.trim()) : null;
        const n = bt ? Number(bt[0]) : NaN;
        const defenderTricks = typeof total === 'number' && n <= total ? String(total - n) : '';
        return { ...g, draft: { ...draft, defenderTricks } };
      })
    : state.games;
  return { ...state, games, schemaVersion: 2 };
}

/**
 * v2 -> v3: players get `updatedAt` (renames: newest wins when merging) and
 * the state gets tombstones (deleted games and removed players), so merging
 * with another device or a backup can't bring deleted things back.
 */
function migrateV2toV3(state: Obj): Obj {
  const players = Array.isArray(state.players)
    ? state.players.map((p: unknown) =>
        isObj(p) && !('updatedAt' in p) ? { ...p, updatedAt: p.createdAt } : p,
      )
    : state.players;
  return { ...state, players, tombstones: { games: [], players: [] }, schemaVersion: 3 };
}

/**
 * v3 -> v4: rules get `winByLead` (win as soon as a team leads by that many
 * points). Off for every existing game and for the default rules, so no
 * finished or in-progress game changes outcome.
 */
function migrateV3toV4(state: Obj): Obj {
  const withRule = (r: unknown) =>
    isObj(r) && !('winByLead' in r) ? { ...r, winByLead: null } : r;
  const games = Array.isArray(state.games)
    ? state.games.map((g: unknown) => (isObj(g) ? { ...g, rules: withRule(g.rules) } : g))
    : state.games;
  return { ...state, games, defaultRules: withRule(state.defaultRules), schemaVersion: 4 };
}

/**
 * Bring older saved formats up to the current schema, one version at a
 * time. Anything unrecognized is passed through for validation to reject.
 */
export function migrate(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  let state = raw;
  if (state.schemaVersion === 1) state = migrateV1toV2(state);
  if (state.schemaVersion === 2) state = migrateV2toV3(state);
  if (state.schemaVersion === 3) state = migrateV3toV4(state);
  return state;
}

export function loadState(storage: Storage | null): LoadResult {
  if (!storage) {
    return {
      state: initialState(),
      warning: 'This browser is blocking storage, so scores will be lost when the page closes.',
      storageAvailable: false,
    };
  }
  const text = storage.getItem(STORAGE_KEY);
  if (text === null) return { state: initialState(), warning: null, storageAvailable: true };
  try {
    return {
      state: validateAppState(migrate(JSON.parse(text))),
      warning: null,
      storageAvailable: true,
    };
  } catch (err) {
    // Never overwrite data we couldn't read: set it aside so it can be recovered.
    try {
      storage.setItem(`${CORRUPT_PREFIX}${Date.now()}`, text);
    } catch {
      /* storage full; the original key is still intact until the next save */
    }
    console.error('Saved data could not be loaded', err);
    return {
      state: initialState(),
      warning:
        'Saved data could not be read and was set aside. Starting fresh; contact the maintainer to recover it.',
      storageAvailable: true,
    };
  }
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export function saveState(storage: Storage | null, state: AppState): SaveResult {
  if (!storage) return { ok: false, error: 'Storage unavailable' };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (err) {
    const quota = err instanceof DOMException && err.name === 'QuotaExceededError';
    return {
      ok: false,
      error: quota
        ? 'Device storage is full. Export a backup and delete old games.'
        : 'Could not save to this device.',
    };
  }
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
