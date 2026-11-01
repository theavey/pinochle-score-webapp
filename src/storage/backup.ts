import type { AppState, Game, PlayerId, SeatQuad } from '../domain/types';
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
 * Merge an imported backup into the current data without losing anything:
 * players with the same name are treated as the same person, and when both
 * sides have the same game the most recently updated copy wins.
 */
export function mergeStates(current: AppState, incoming: AppState): AppState {
  const players = [...current.players];
  const byId = new Map(players.map((p) => [p.id, p]));
  const byName = new Map(players.map((p) => [p.name.toLocaleLowerCase(), p]));
  const remap = new Map<PlayerId, PlayerId>();

  for (const p of incoming.players) {
    const sameName = byName.get(p.name.toLocaleLowerCase());
    if (sameName) {
      remap.set(p.id, sameName.id);
    } else if (byId.has(p.id)) {
      // Same id, different name: keep both people, give the import a new id.
      const fresh = `${p.id}-${crypto.randomUUID().slice(0, 8)}`;
      remap.set(p.id, fresh);
      const np = { ...p, id: fresh };
      players.push(np);
      byName.set(np.name.toLocaleLowerCase(), np);
    } else {
      players.push(p);
      byId.set(p.id, p);
      byName.set(p.name.toLocaleLowerCase(), p);
    }
  }

  const map = (q: SeatQuad<PlayerId>) => q.map((id) => remap.get(id) ?? id) as SeatQuad<PlayerId>;
  const fix = (g: Game): Game => ({
    ...g,
    seats: map(g.seats),
    hands: g.hands.map((h) => ({ ...h, players: map(h.players) })),
  });

  const games = new Map(current.games.map((g) => [g.id, g]));
  for (const g of incoming.games) {
    const existing = games.get(g.id);
    if (!existing || g.updatedAt > existing.updatedAt) games.set(g.id, fix(g));
  }

  const merged = { ...current, players, games: [...games.values()] };
  // Re-validate so a merge can never produce a state we can't load later.
  return validateAppState(merged);
}
