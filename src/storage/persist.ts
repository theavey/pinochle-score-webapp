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

/**
 * Bring older saved formats up to the current schema. There is only one
 * version so far; future versions add steps here instead of breaking data.
 */
export function migrate(raw: unknown): unknown {
  return raw;
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
