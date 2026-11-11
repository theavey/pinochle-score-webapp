import type {
  AppState,
  DeletedGame,
  Game,
  Player,
  PlayerId,
  RemovedPlayer,
  SeatQuad,
  Tombstones,
} from './types';

/** Keep at most this many deletion records of each kind (oldest dropped first). */
export const MAX_TOMBSTONES = 5_000;

/**
 * Merge two copies of the app's data (this device's and another device's, or
 * a backup's) without losing anything either side changed.
 *
 * Deterministic and order-independent for everything that syncs: merging A
 * into B gives the same players, games and tombstones as merging B into A, so
 * devices that keep merging each other's data converge. Rules:
 * - Deletions are remembered (tombstones), so a stale copy can't resurrect a
 *   deleted game or a merged-away player. The newest change wins: a deletion
 *   beats any edit made before it, and an edit made after it (e.g. Undo of
 *   the delete) brings the item back and drops the deletion record.
 * - Games: the copy with the newest `updatedAt` wins.
 * - Players: the newest rename wins. Two players with the same name are the
 *   same person (the app's identity rule); they're merged into the smaller id
 *   and every game is re-mapped, unless they appear together in a game.
 * - Defaults and settings are per device: kept from `local`.
 */
export function mergeStates(local: AppState, remote: AppState): AppState {
  const allTombstones = mergeTombstones(local.tombstones, remote.tombstones);

  // Player records: newest rename wins.
  const records = new Map<PlayerId, Player>();
  for (const p of [...local.players, ...remote.players]) {
    const seen = records.get(p.id);
    records.set(p.id, seen ? newerPlayer(seen, p) : p);
  }

  // Games: newest copy wins.
  const gamesById = new Map<string, Game>();
  for (const g of [...local.games, ...remote.games]) {
    const seen = gamesById.get(g.id);
    gamesById.set(g.id, seen ? newerGame(seen, g) : g);
  }

  // A deletion holds unless the item was changed after it.
  const tombstones: Tombstones = { games: [], players: [] };
  for (const t of allTombstones.games) {
    const g = gamesById.get(t.id);
    if (g && g.updatedAt > t.at) continue; // edited (or restored) after the delete
    gamesById.delete(t.id);
    tombstones.games.push(t);
  }
  for (const t of allTombstones.players) {
    const p = records.get(t.id);
    if (p && p.updatedAt > t.at) continue; // renamed (or restored) after removal
    tombstones.players.push(t);
  }
  const games = [...gamesById.values()];

  // Same name, different ids: the same person (e.g. added on two devices).
  const removed = new Map(tombstones.players.map((t) => [t.id, t]));
  const playedTogether = (a: PlayerId, b: PlayerId) =>
    games.some(
      (g) =>
        (g.seats.includes(a) && g.seats.includes(b)) ||
        g.hands.some((h) => h.players.includes(a) && h.players.includes(b)),
    );
  const byName = new Map<string, Player[]>();
  for (const p of records.values()) {
    if (removed.has(p.id)) continue;
    const key = p.name.toLocaleLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const [keep, ...dupes] = [...group].sort((a, b) => compare(a.id, b.id));
    if (!keep) continue;
    for (const dupe of dupes) {
      if (playedTogether(keep.id, dupe.id)) continue;
      const t: RemovedPlayer = { id: dupe.id, at: dupe.updatedAt, mergedInto: keep.id };
      removed.set(dupe.id, t);
      tombstones.players.push(t);
    }
  }

  // Follow "merged into" chains to the player that remains.
  const resolve = (id: PlayerId): PlayerId => {
    let cur = id;
    for (let i = 0; i < 50; i++) {
      const next = removed.get(cur)?.mergedInto;
      if (!next || next === cur) return cur;
      cur = next;
    }
    return cur;
  };
  const remapQuad = (q: SeatQuad<PlayerId>) => q.map(resolve) as SeatQuad<PlayerId>;
  const distinct = (q: readonly PlayerId[]) => new Set(q).size === q.length;
  const remapped = games.map((g) => {
    const next: Game = {
      ...g,
      seats: remapQuad(g.seats),
      hands: g.hands.map((h) => ({ ...h, players: remapQuad(h.players) })),
    };
    // Never produce a game with one person in two seats; keep it as it was.
    const ok = distinct(next.seats) && next.hands.every((h) => distinct(h.players));
    return ok ? next : g;
  });

  // Keep players that weren't removed, plus any a surviving game still uses
  // (e.g. deleted on one device while another started a game with them).
  const used = new Set(remapped.flatMap((g) => [...g.seats, ...g.hands.flatMap((h) => h.players)]));
  const players = [...records.values()].filter((p) => !removed.has(p.id) || used.has(p.id));

  return {
    schemaVersion: local.schemaVersion,
    players: players.sort(byCreated),
    games: remapped.sort(byCreated),
    tombstones: pruneTombstones(tombstones),
    defaultRules: local.defaultRules,
    settings: local.settings,
  };
}

function mergeTombstones(a: Tombstones, b: Tombstones): Tombstones {
  const games = new Map<string, DeletedGame>();
  for (const t of [...a.games, ...b.games]) {
    const seen = games.get(t.id);
    if (!seen || t.at > seen.at) games.set(t.id, t);
  }
  const players = new Map<PlayerId, RemovedPlayer>();
  for (const t of [...a.players, ...b.players]) {
    const seen = players.get(t.id);
    if (!seen || newerRemoval(t, seen)) players.set(t.id, t);
  }
  return { games: [...games.values()], players: [...players.values()] };
}

/** Keep the newest records; sorted so both devices produce identical output. */
function pruneTombstones(t: Tombstones): Tombstones {
  const newest = <T extends { id: string; at: number }>(xs: T[]) =>
    [...new Map(xs.map((x) => [x.id, x])).values()]
      .sort((x, y) => y.at - x.at || compare(x.id, y.id))
      .slice(0, MAX_TOMBSTONES)
      .sort((x, y) => compare(x.id, y.id));
  return { games: newest(t.games), players: newest(t.players) };
}

function newerRemoval(a: RemovedPlayer, b: RemovedPlayer): boolean {
  if (a.at !== b.at) return a.at > b.at;
  return compare(a.mergedInto ?? '', b.mergedInto ?? '') > 0;
}

function newerPlayer(a: Player, b: Player): Player {
  const winner =
    a.updatedAt !== b.updatedAt
      ? a.updatedAt > b.updatedAt
        ? a
        : b
      : compare(a.name, b.name) <= 0
        ? a
        : b;
  return { ...winner, createdAt: Math.min(a.createdAt, b.createdAt) };
}

function newerGame(a: Game, b: Game): Game {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  // Same timestamp but different content (vanishingly rare): pick consistently.
  return compare(JSON.stringify(a), JSON.stringify(b)) <= 0 ? a : b;
}

function byCreated(a: { createdAt: number; id: string }, b: { createdAt: number; id: string }) {
  return a.createdAt - b.createdAt || compare(a.id, b.id);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
