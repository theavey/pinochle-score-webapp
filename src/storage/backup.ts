import { mergeStates } from '../domain/merge';
import type { AppState } from '../domain/types';
import { migrate } from './persist';
import { validateAppState } from './schema';
import { ValidationError } from './validate';

export const BACKUP_FORMAT = 'pinochle-score-backup';
export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

export function exportBackup(state: AppState, now: number): string {
  return JSON.stringify(
    { format: BACKUP_FORMAT, exportedAt: new Date(now).toISOString(), data: state },
    null,
    1,
  );
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `pinochle-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/** Parse an untrusted backup file. Throws Error with a user-facing message. */
export function parseBackup(text: string): AppState {
  if (new Blob([text]).size > MAX_BACKUP_BYTES) throw new Error('That file is too large.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error('That file is not a valid backup (not JSON).', { cause: err });
  }
  if (
    typeof raw !== 'object' ||
    raw === null ||
    (raw as { format?: unknown }).format !== BACKUP_FORMAT
  ) {
    throw new Error('That file is not a pinochle score backup.');
  }
  try {
    return validateAppState(migrate((raw as { data?: unknown }).data));
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new Error(`The backup is damaged or from a newer version (${err.message}).`, {
        cause: err,
      });
    }
    throw err;
  }
}

/**
 * Merge an imported backup into the current data without losing anything
 * (see mergeStates in src/domain/merge.ts for the rules). The result is
 * re-validated so a merge can never produce data that won't load.
 */
export function mergeBackup(current: AppState, incoming: AppState): AppState {
  return validateAppState(mergeStates(current, incoming));
}
