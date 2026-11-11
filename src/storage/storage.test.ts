import { describe, expect, it } from 'vitest';
import { initialState, reduce } from '../domain/reducer';
import type { Action } from '../domain/reducer';
import { DEFAULT_RULES } from '../domain/rules';
import type { AppState } from '../domain/types';
import { SCHEMA_VERSION } from '../domain/types';
import { exportBackup, mergeBackup, parseBackup } from './backup';
import { STORAGE_KEY, loadState, migrate, saveState } from './persist';
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
        defenderTricks: '',
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
    [
      'zero win-by-lead margin',
      (s) => mutateGame(s, { rules: { ...DEFAULT_RULES, winByLead: 0 } }),
    ],
    [
      'fractional win-by-lead',
      (s) => ({ ...s, defaultRules: { ...DEFAULT_RULES, winByLead: 1.5 } }),
    ],
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
  it('round-trips the win-by-lead rule', () => {
    const storage = new MemoryStorage();
    const s = sample();
    const on = { ...s, defaultRules: { ...s.defaultRules, winByLead: 150 } };
    expect(saveState(storage, on)).toEqual({ ok: true });
    expect(loadState(storage).state.defaultRules.winByLead).toBe(150);
  });

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

  it('merges a backup by player name and keeps the newest copy of each game', () => {
    const current = sample();
    const incoming = ['q0', 'q1', 'q2', 'q3'].reduce<AppState>(
      (st, id, i) =>
        reduce(st, { type: 'addPlayer', id, name: ['ann', 'Zed', 'X', 'Y'][i] ?? id, now: 1 }),
      initialState(),
    );
    const withGame = reduce(incoming, {
      type: 'createGame',
      id: 'g2',
      seats: ['q0', 'q1', 'q2', 'q3'],
      firstDealer: 0,
      rules: DEFAULT_RULES,
      now: 5,
    });

    const merged = mergeBackup(current, withGame);
    expect(merged.games.map((g) => g.id).sort()).toEqual(['g1', 'g2']);
    // "ann" is the same person as "Ann" (p0), so g2 now refers to p0.
    expect(merged.games.find((g) => g.id === 'g2')?.seats[0]).toBe('p0');
    expect(merged.players.map((p) => p.name).sort()).toEqual(
      ['Ann', 'Bob', 'Cy', 'Di', 'X', 'Y', 'Zed'].sort(),
    );

    // Older copy of an existing game does not overwrite the newer one.
    const stale = {
      ...sample(),
      games: sample().games.map((g) => ({ ...g, hands: [], updatedAt: 0 })),
    };
    expect(mergeBackup(current, stale).games.find((g) => g.id === 'g1')?.hands).toHaveLength(1);
  });
});

describe('migrating older saves', () => {
  type Raw = Record<string, unknown>;

  /** A save as v3 wrote it: no win-by-lead rule. */
  function v3State(): Raw {
    const s = JSON.parse(JSON.stringify(sample())) as Raw & {
      games: { rules: Raw }[];
      defaultRules: Raw;
    };
    s.schemaVersion = 3;
    for (const g of s.games) delete g.rules.winByLead;
    delete s.defaultRules.winByLead;
    return s;
  }

  /** A save as v2 wrote it: also no player updatedAt, no tombstones. */
  function v2State(): Raw {
    const s = v3State() as Raw & { players: Raw[] };
    s.schemaVersion = 2;
    delete s.tombstones;
    s.players = s.players.map((p) => {
      const rest = { ...p };
      delete rest.updatedAt;
      return rest;
    });
    return s;
  }

  /** A save as v1 wrote it: also, the draft stored the bidding team's tricks. */
  function v1(draftPatch: Record<string, unknown>): string {
    const s = v2State() as Record<string, unknown> & {
      games: { draft: Record<string, unknown> }[];
    };
    s.schemaVersion = 1;
    const g = s.games[0];
    if (!g) throw new Error('sample has a game');
    const rest = { ...g.draft };
    delete rest.defenderTricks;
    g.draft = { ...rest, bidderTricks: '', ...draftPatch };
    return JSON.stringify(s);
  }

  it('loads a v3 save with win-by-lead off, in every game and the defaults', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(v3State()));
    const res = loadState(storage);
    expect(res.warning).toBeNull();
    expect(res.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(res.state.games[0]?.rules.winByLead).toBeNull();
    expect(res.state.defaultRules.winByLead).toBeNull();
    expect(res.state).toEqual(sample());
  });

  it('migrates v3 rules to v4 with an explicit winByLead: null', () => {
    const m = migrate(v3State()) as {
      schemaVersion: number;
      games: { rules: Raw }[];
      defaultRules: Raw;
    };
    expect(m.schemaVersion).toBe(4);
    expect(m.games[0]?.rules).toHaveProperty('winByLead', null);
    expect(m.defaultRules).toHaveProperty('winByLead', null);
  });

  it('imports a v3 backup', () => {
    const text = JSON.stringify({
      format: 'pinochle-score-backup',
      exportedAt: '2026-11-01T00:00:00.000Z',
      data: v3State(),
    });
    const s = parseBackup(text);
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.games[0]?.rules.winByLead).toBeNull();
    expect(s.defaultRules.winByLead).toBeNull();
  });

  it('loads a v2 save: players get updatedAt, tombstones start empty', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(v2State()));
    const res = loadState(storage);
    expect(res.warning).toBeNull();
    expect(res.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(res.state.tombstones).toEqual({ games: [], players: [] });
    for (const p of res.state.players) expect(p.updatedAt).toBe(p.createdAt);
    expect(res.state.games).toEqual(sample().games);
    expect(res.state.defaultRules.winByLead).toBeNull();
  });

  it('converts a half-entered hand to the defending team’s trick points', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, v1({ bidder: 0, bidderTricks: '18' }));
    const res = loadState(storage);
    expect(res.warning).toBeNull();
    expect(res.state.schemaVersion).toBe(SCHEMA_VERSION);
    // 25 trick points per hand: bidders had 18, so defenders had 7.
    expect(res.state.games[0]?.draft?.defenderTricks).toBe('7');
    expect(res.state.games[0]?.draft).not.toHaveProperty('bidderTricks');
    // Everything else is untouched.
    expect(res.state.games[0]?.hands).toEqual(sample().games[0]?.hands);
    expect(res.state.games[0]?.rules.winByLead).toBeNull();
    expect(res.state.defaultRules.winByLead).toBeNull();
  });

  it('clears trick points it cannot convert', () => {
    for (const bidderTricks of ['', 'x', '99']) {
      const storage = new MemoryStorage();
      storage.setItem(STORAGE_KEY, v1({ bidderTricks }));
      expect(loadState(storage).state.games[0]?.draft?.defenderTricks).toBe('');
    }
  });

  it('imports a v1 backup', () => {
    const text = JSON.stringify({
      format: 'pinochle-score-backup',
      exportedAt: '2026-11-01T00:00:00.000Z',
      data: JSON.parse(v1({ bidderTricks: '20' })) as unknown,
    });
    expect(parseBackup(text).games[0]?.draft?.defenderTricks).toBe('5');
  });

  it('rejects data from a newer, unknown version', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...sample(), schemaVersion: 99 }));
    expect(loadState(storage).warning).toMatch(/set aside/);
  });
});
