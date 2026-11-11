import { describe, expect, it } from 'vitest';
import { mergeStates } from './merge';
import { initialState, reduce } from './reducer';
import type { Action } from './reducer';
import { DEFAULT_RULES } from './rules';
import type { AppState } from './types';
import type { HandInput } from './draft';
import { emptyDraft } from './draft';

const apply = (s: AppState, ...actions: Action[]) => actions.reduce(reduce, s);

/** Four players and one game, as created on one device. */
function base(): AppState {
  return apply(
    initialState(),
    { type: 'addPlayer', id: 'a', name: 'Ann', now: 1 },
    { type: 'addPlayer', id: 'b', name: 'Bob', now: 1 },
    { type: 'addPlayer', id: 'c', name: 'Cy', now: 1 },
    { type: 'addPlayer', id: 'd', name: 'Di', now: 1 },
    {
      type: 'createGame',
      id: 'g1',
      seats: ['a', 'b', 'c', 'd'],
      firstDealer: 0,
      rules: DEFAULT_RULES,
      now: 2,
    },
  );
}

const hand = (bid: number): HandInput => ({
  kind: 'played',
  dealer: 0,
  players: ['a', 'b', 'c', 'd'],
  bidder: 1,
  bid,
  stuck: false,
  meld: [5, 10],
  tricks: [10, 15],
  tookTrick: [true, true],
});

/** The parts of the state that sync (defaults and settings are per device). */
const synced = (s: AppState) => ({
  players: s.players,
  games: s.games,
  tombstones: s.tombstones,
});

describe('mergeStates', () => {
  it('unions independent changes and gives the same result either way round', () => {
    const phone = apply(base(), {
      type: 'saveHand',
      gameId: 'g1',
      handId: 'h1',
      hand: hand(30),
      now: 10,
    });
    const ipad = apply(
      base(),
      { type: 'addPlayer', id: 'e', name: 'Ed', now: 11 },
      {
        type: 'createGame',
        id: 'g2',
        seats: ['e', 'b', 'c', 'd'],
        firstDealer: 1,
        rules: DEFAULT_RULES,
        now: 12,
      },
    );
    const ab = mergeStates(phone, ipad);
    const ba = mergeStates(ipad, phone);
    expect(synced(ab)).toEqual(synced(ba));
    expect(ab.games.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(ab.games[0]?.hands).toHaveLength(1);
    expect(ab.players.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('is stable: merging again changes nothing', () => {
    const merged = mergeStates(base(), apply(base(), { type: 'deleteGame', gameId: 'g1', now: 5 }));
    expect(mergeStates(merged, merged)).toEqual(merged);
    expect(mergeStates(merged, base())).toEqual(merged);
  });

  it('keeps the newest copy of a game, including a half-entered hand', () => {
    const older = apply(base(), {
      type: 'saveHand',
      gameId: 'g1',
      handId: 'h1',
      hand: hand(30),
      now: 10,
    });
    const newer = apply(older, {
      type: 'setDraft',
      gameId: 'g1',
      draft: { ...emptyDraft(1), bidder: 2, bid: '31' },
      now: 20,
    });
    expect(mergeStates(older, newer).games[0]?.draft?.bid).toBe('31');
    expect(mergeStates(newer, older).games[0]?.draft?.bid).toBe('31');
  });

  it('does not bring a deleted game back from a stale copy', () => {
    const edited = apply(base(), {
      type: 'saveHand',
      gameId: 'g1',
      handId: 'h1',
      hand: hand(30),
      now: 9,
    });
    const deleted = apply(edited, { type: 'deleteGame', gameId: 'g1', now: 12 });
    expect(mergeStates(deleted, edited).games).toEqual([]);
    expect(mergeStates(edited, deleted).games).toEqual([]);
    expect(mergeStates(edited, deleted).tombstones.games).toEqual([{ id: 'g1', at: 12 }]);
  });

  it('lets a later change win over an earlier delete (e.g. Undo)', () => {
    const deleted = apply(base(), { type: 'deleteGame', gameId: 'g1', now: 5 });
    const editedLater = apply(base(), {
      type: 'saveHand',
      gameId: 'g1',
      handId: 'h1',
      hand: hand(30),
      now: 9,
    });
    for (const m of [mergeStates(deleted, editedLater), mergeStates(editedLater, deleted)]) {
      expect(m.games.map((g) => g.id)).toEqual(['g1']);
      expect(m.tombstones.games).toEqual([]);
    }
  });

  it('keeps an undo after the undone change has synced', () => {
    const before = base();
    const saved = apply(before, {
      type: 'saveHand',
      gameId: 'g1',
      handId: 'h1',
      hand: hand(30),
      now: 10,
    });
    // The other device already has the saved hand; this device then undoes it.
    const undone = reduce(saved, { type: 'restore', state: before, now: 20 });
    for (const m of [mergeStates(undone, saved), mergeStates(saved, undone)]) {
      expect(m.games[0]?.hands).toEqual([]);
    }
    // Undoing a delete brings the game back everywhere, too.
    const deleted = apply(saved, { type: 'deleteGame', gameId: 'g1', now: 30 });
    const restored = reduce(deleted, { type: 'restore', state: saved, now: 40 });
    expect(mergeStates(deleted, restored).games.map((g) => g.id)).toEqual(['g1']);
    // And undoing a game's creation deletes it everywhere.
    const created = apply(before, {
      type: 'createGame',
      id: 'g2',
      seats: ['a', 'b', 'c', 'd'],
      firstDealer: 0,
      rules: DEFAULT_RULES,
      now: 50,
    });
    const uncreated = reduce(created, { type: 'restore', state: before, now: 60 });
    expect(mergeStates(created, uncreated).games.map((g) => g.id)).toEqual(['g1']);
  });

  it('takes the newest rename', () => {
    const renamed = apply(base(), { type: 'renamePlayer', id: 'a', name: 'Annie', now: 30 });
    expect(mergeStates(base(), renamed).players[0]?.name).toBe('Annie');
    expect(mergeStates(renamed, base()).players[0]?.name).toBe('Annie');
  });

  it('replays a player merge onto games made on another device', () => {
    const extra = apply(base(), { type: 'addPlayer', id: 'e', name: 'Eddie', now: 3 });
    // Device 1 merges Eddie into a newly added Ed.
    const dev1 = apply(
      extra,
      { type: 'addPlayer', id: 'f', name: 'Ed', now: 4 },
      { type: 'mergePlayers', from: 'e', into: 'f', now: 6 },
    );
    // Device 2, unaware, starts a game with Eddie.
    const dev2 = apply(extra, {
      type: 'createGame',
      id: 'g2',
      seats: ['e', 'b', 'c', 'd'],
      firstDealer: 0,
      rules: DEFAULT_RULES,
      now: 7,
    });
    const merged = mergeStates(dev2, dev1);
    expect(merged.games.find((g) => g.id === 'g2')?.seats[0]).toBe('f');
    expect(merged.players.map((p) => p.id)).not.toContain('e');
    expect(synced(merged)).toEqual(synced(mergeStates(dev1, dev2)));
  });

  it('treats same-name players from two devices as one person', () => {
    const dev1 = apply(initialState(), { type: 'addPlayer', id: 'x1', name: 'Pat', now: 1 });
    const dev2 = apply(
      initialState(),
      { type: 'addPlayer', id: 'x2', name: 'pat', now: 2 },
      { type: 'addPlayer', id: 'q', name: 'Q', now: 2 },
      { type: 'addPlayer', id: 'r', name: 'R', now: 2 },
      { type: 'addPlayer', id: 's', name: 'S', now: 2 },
      {
        type: 'createGame',
        id: 'g9',
        seats: ['x2', 'q', 'r', 's'],
        firstDealer: 0,
        rules: DEFAULT_RULES,
        now: 3,
      },
    );
    const merged = mergeStates(dev1, dev2);
    // The smaller id is kept everywhere, on every device.
    expect(merged.players.filter((p) => p.name.toLowerCase() === 'pat').map((p) => p.id)).toEqual([
      'x1',
    ]);
    expect(merged.games[0]?.seats[0]).toBe('x1');
    expect(synced(merged)).toEqual(synced(mergeStates(dev2, dev1)));
  });

  it('keeps a deleted player that the other device has started using', () => {
    const extra = apply(base(), { type: 'addPlayer', id: 'e', name: 'Ed', now: 3 });
    const dev1 = apply(extra, { type: 'deletePlayer', id: 'e', now: 4 });
    const dev2 = apply(extra, {
      type: 'createGame',
      id: 'g2',
      seats: ['e', 'b', 'c', 'd'],
      firstDealer: 0,
      rules: DEFAULT_RULES,
      now: 5,
    });
    expect(mergeStates(dev1, dev2).players.map((p) => p.id)).toContain('e');
    // Unused, the deletion holds.
    expect(mergeStates(dev1, extra).players.map((p) => p.id)).not.toContain('e');
  });

  it('keeps this device’s defaults and settings', () => {
    const local = apply(base(), { type: 'setSettings', settings: { keepAwake: false } });
    const remote = apply(base(), {
      type: 'setDefaultRules',
      rules: { ...DEFAULT_RULES, targetScore: 500 },
    });
    const merged = mergeStates(local, remote);
    expect(merged.settings.keepAwake).toBe(false);
    expect(merged.defaultRules.targetScore).toBe(DEFAULT_RULES.targetScore);
  });
});
