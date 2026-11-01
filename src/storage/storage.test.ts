import { describe, expect, it } from 'vitest';
import { initialState, reduce } from '../domain/reducer';
import type { Action } from '../domain/reducer';
import { DEFAULT_RULES } from '../domain/rules';
import type { AppState } from '../domain/types';
import { exportBackup, mergeStates, parseBackup } from './backup';
import { STORAGE_KEY, loadState, saveState } from './persist';
import { validateAppState } from './schema';

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  quotaBytes = Infinity;
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    if (v.length > this.quotaBytes) throw new DOMException('full', 'QuotaExceededError');
    this.m.set(k, v);
  }
}

function sample(): AppState {
  const actions: Action[] = [
    { type: 'addPlayer', id: 'p0', name: 'Ann', now: 1 },
    { type: 'addPlayer', id: 'p1', name: 'Bob', now: 1 },
    { type: 'addPlayer', id: 'p2', name: 'Cy', now: 1 },
    { type: 'addPlayer', id: 'p3', name: 'Di', now: 1 },
    {
      type: 'createGame',
      id: 'g1',
      seats: ['p0', 'p1', 'p2', 'p3'],
      firstDealer: 2,
      rules: DEFAULT_RULES,
      now: 2,
    },
    {
      type: 'saveHand',
      gameId: 'g1',
      handId: 'h1',
      now: 3,
      hand: {
        kind: 'played',
        dealer: 2,
        players: ['p0', 'p1', 'p2', 'p3'],
        bidder: 3,
        bid: 26,
        stuck: false,
        meld: [4, 12],
        tricks: [9, 16],
        tookTrick: [true, true],
      },
    },
    {
      type: 'setDraft',
      gameId: 'g1',
      now: 4,
      draft: {
        editingHandId: null,
        dealer: 3,
        bidder: 0,
        bid: '27',
        stuck: false,
        meld: ['10', ''],
        bidderTricks: '',
        tookTrick: [false, false],
        thrownIn: false,
      },
    },
  ];
  return actions.reduce(reduce, initialState());
}

describe('validateAppState', () => {
  it('accepts a real state unchanged', () => {
    const s = sample();
    expect(validateAppState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('drops unknown keys, including __proto__', () => {
    const raw = JSON.parse(JSON.stringify(sample())) as Record<string, unknown>;
    const text = JSON.stringify(raw).replace('{', '{"__proto__":{"polluted":1},"extra":1,');
    const s = validateAppState(JSON.parse(text));
    expect(Object.keys(s)).not.toContain('extra');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(s)).toBe(Object.prototype);
  });

  it.each<[string, (s: AppState) => unknown]>([
    ['wrong version', (s) => ({ ...s, schemaVersion: 99 })],
    ['non-integer bid', (s) => mutateHand(s, { bid: 25.5 })],
    ['negative meld', (s) => mutateHand(s, { meld: [-1, 0] })],
    ['bad seat', (s) => mutateHand(s, { bidder: 4 })],
    ['string number', (s) => mutateHand(s, { bid: '25' })],
    ['long name', (s) => ({ ...s, players: [{ ...s.players[0], name: 'x'.repeat(500) }] })],
    ['unknown player', (s) => ({ ...s, players: s.players.slice(1) })],
    ['duplicate seats', (s) => mutateGame(s, { seats: ['p0', 'p0', 'p1', 'p2'] })],
    ['not an object', () => 'hello'],
  ])('rejects %s', (_, f) => {
    expect(() => validateAppState(f(sample()))).toThrow();
  });
});

function mutateGame(s: AppState, patch: Record<string, unknown>): unknown {
  const g = s.games[0];
  return { ...s, games: [{ ...g, ...patch }] };
}
function mutateHand(s: AppState, patch: Record<string, unknown>): unknown {
  const g = s.games[0];
  return mutateGame(s, { hands: [{ ...g?.hands[0], ...patch }] });
}

describe('persistence', () => {
  it('round-trips through storage, including the in-progress draft', () => {
    const storage = new MemoryStorage();
    expect(saveState(storage, sample())).toEqual({ ok: true });
    const loaded = loadState(storage);
    expect(loaded.warning).toBeNull();
    expect(loaded.state).toEqual(sample());
    expect(loaded.state.games[0]?.draft?.bid).toBe('27');
  });

  it('starts fresh when nothing is saved', () => {
    expect(loadState(new MemoryStorage()).state).toEqual(initialState());
  });

  it('sets corrupt data aside instead of losing it', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    const res = loadState(storage);
    expect(res.warning).toMatch(/set aside/);
    expect(res.state).toEqual(initialState());
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
    expect(keys.some((k) => k?.startsWith('pinochle:corrupt:'))).toBe(true);
    // The original is still there until something new is saved.
    expect(storage.getItem(STORAGE_KEY)).toBe('{not json');
  });

  it('reports a full device', () => {
    const storage = new MemoryStorage();
    storage.quotaBytes = 10;
    const res = saveState(storage, sample());
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/full/);
  });

  it('reports unavailable storage', () => {
    expect(loadState(null).storageAvailable).toBe(false);
    expect(saveState(null, sample()).ok).toBe(false);
  });
});

describe('backup', () => {
  it('round-trips export and import', () => {
    expect(parseBackup(exportBackup(sample(), 0))).toEqual(sample());
  });

  it('rejects non-backups with friendly messages', () => {
    expect(() => parseBackup('nope')).toThrow(/not JSON/);
    expect(() => parseBackup('{"a":1}')).toThrow(/not a pinochle/);
    expect(() =>
      parseBackup(JSON.stringify({ format: 'pinochle-score-backup', data: { bad: true } })),
    ).toThrow(/damaged/);
    expect(() => parseBackup('x'.repeat(3 * 1024 * 1024))).toThrow(/too large/);
  });

  it('merges by player name and keeps the newest copy of each game', () => {
    const current = sample();
    const other = reduce(
      reduce(initialState(), { type: 'addPlayer', id: 'q0', name: 'ann', now: 1 }),
      { type: 'addPlayer', id: 'p1', name: 'Zed', now: 1 },
    );
    const withGame = ['q2', 'q3'].reduce<AppState>(
      (s, id) => reduce(s, { type: 'addPlayer', id, name: id, now: 1 }),
      other,
    );
    const incoming = reduce(withGame, {
      type: 'createGame',
      id: 'g2',
      seats: ['q0', 'p1', 'q2', 'q3'],
      firstDealer: 0,
      rules: DEFAULT_RULES,
      now: 5,
    });

    const merged = mergeStates(current, incoming);
    expect(merged.games.map((g) => g.id).sort()).toEqual(['g1', 'g2']);
    const g2 = merged.games.find((g) => g.id === 'g2');
    // "ann" matched existing "Ann" (p0); "Zed" clashed on id p1 and got a new id.
    expect(g2?.seats[0]).toBe('p0');
    expect(g2?.seats[1]).not.toBe('p1');
    expect(merged.players.find((p) => p.id === g2?.seats[1])?.name).toBe('Zed');
    expect(merged.players.find((p) => p.id === 'p1')?.name).toBe('Bob');

    // Older copy of an existing game does not overwrite the newer one.
    const stale = {
      ...sample(),
      games: sample().games.map((g) => ({ ...g, hands: [], updatedAt: 0 })),
    };
    expect(mergeStates(current, stale).games.find((g) => g.id === 'g1')?.hands).toHaveLength(1);
  });
});
