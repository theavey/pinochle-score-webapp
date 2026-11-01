import { describe, expect, it } from 'vitest';
import { ActionError, initialState, normalizeName, reduce } from './reducer';
import type { Action } from './reducer';
import { DEFAULT_RULES } from './rules';
import type { AppState, HandDraft } from './types';
import { emptyDraft } from './draft';
import type { HandInput } from './draft';

function apply(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reduce, state);
}

function withPlayers(...names: string[]): AppState {
  return apply(
    initialState(),
    ...names.map((name, i): Action => ({ type: 'addPlayer', id: `p${i}`, name, now: i })),
  );
}

const four = () => withPlayers('Ann', 'Bob', 'Cy', 'Di', 'Ed');

function withGame(): AppState {
  return reduce(four(), {
    type: 'createGame',
    id: 'g1',
    seats: ['p0', 'p1', 'p2', 'p3'],
    firstDealer: 0,
    rules: { ...DEFAULT_RULES, targetScore: 200 },
    now: 10,
  });
}

const hand: HandInput = {
  kind: 'played',
  dealer: 0,
  players: ['p0', 'p1', 'p2', 'p3'],
  bidder: 1,
  bid: 25,
  stuck: false,
  meld: [5, 10],
  tricks: [10, 15],
  tookTrick: [true, true],
};

describe('players', () => {
  it('normalizes names', () => {
    expect(normalizeName('  Ann   Marie ')).toBe('Ann Marie');
    expect(normalizeName('x'.repeat(100))).toHaveLength(24);
  });

  it('rejects empty and duplicate names (case-insensitive)', () => {
    const s = withPlayers('Ann');
    expect(() => reduce(s, { type: 'addPlayer', id: 'x', name: '  ', now: 0 })).toThrow(
      ActionError,
    );
    expect(() => reduce(s, { type: 'addPlayer', id: 'x', name: 'ann', now: 0 })).toThrow(
      /already exists/,
    );
  });

  it('renames, but not onto another player', () => {
    const s = withPlayers('Ann', 'Bob');
    expect(reduce(s, { type: 'renamePlayer', id: 'p0', name: 'Annie' }).players[0]?.name).toBe(
      'Annie',
    );
    expect(() => reduce(s, { type: 'renamePlayer', id: 'p0', name: 'BOB' })).toThrow();
    // Changing only the case of your own name is fine.
    expect(reduce(s, { type: 'renamePlayer', id: 'p0', name: 'ANN' }).players[0]?.name).toBe('ANN');
  });

  it('only deletes players who are not in any game', () => {
    const s = withGame();
    expect(() => reduce(s, { type: 'deletePlayer', id: 'p0' })).toThrow(/Merge/);
    expect(reduce(s, { type: 'deletePlayer', id: 'p4' }).players).toHaveLength(4);
  });

  it('merges a duplicate player into another everywhere', () => {
    let s = withGame();
    s = reduce(s, { type: 'saveHand', gameId: 'g1', handId: 'h1', hand, now: 11 });
    s = reduce(s, { type: 'mergePlayers', from: 'p0', into: 'p4' });
    expect(s.players.map((p) => p.id)).not.toContain('p0');
    expect(s.games[0]?.seats[0]).toBe('p4');
    expect(s.games[0]?.hands[0]?.players[0]).toBe('p4');
  });

  it('refuses to merge two people who played together', () => {
    expect(() => reduce(withGame(), { type: 'mergePlayers', from: 'p0', into: 'p1' })).toThrow(
      /same game/,
    );
  });
});

describe('games', () => {
  it('creates a game and remembers its rules as the new default', () => {
    const s = withGame();
    expect(s.games).toHaveLength(1);
    expect(s.defaultRules.targetScore).toBe(200);
  });

  it('requires four distinct, known players', () => {
    const base = four();
    const create = (seats: [string, string, string, string]): Action => ({
      type: 'createGame',
      id: 'g',
      seats,
      firstDealer: 0,
      rules: DEFAULT_RULES,
      now: 0,
    });
    expect(() => reduce(base, create(['p0', 'p0', 'p1', 'p2']))).toThrow(/four different/);
    expect(() => reduce(base, create(['p0', 'p1', 'p2', 'zz']))).toThrow(/Unknown/);
  });

  it('saves a hand, clears the draft, and edits in place', () => {
    const draft: HandDraft = emptyDraft(0);
    let s = reduce(withGame(), { type: 'setDraft', gameId: 'g1', draft, now: 11 });
    expect(s.games[0]?.draft).toEqual(draft);
    s = reduce(s, { type: 'saveHand', gameId: 'g1', handId: 'h1', hand, now: 12 });
    expect(s.games[0]?.draft).toBeNull();
    expect(s.games[0]?.hands).toHaveLength(1);
    s = reduce(s, {
      type: 'saveHand',
      gameId: 'g1',
      handId: 'h1',
      hand: { ...hand, bid: 30 },
      now: 13,
    });
    expect(s.games[0]?.hands).toHaveLength(1);
    expect(s.games[0]?.hands[0]).toMatchObject({ bid: 30, createdAt: 12 });
  });

  it('deletes a hand and any draft editing it', () => {
    let s = reduce(withGame(), { type: 'saveHand', gameId: 'g1', handId: 'h1', hand, now: 12 });
    s = reduce(s, {
      type: 'setDraft',
      gameId: 'g1',
      draft: { ...emptyDraft(0), editingHandId: 'h1' },
      now: 13,
    });
    s = reduce(s, { type: 'deleteHand', gameId: 'g1', handId: 'h1', now: 14 });
    expect(s.games[0]?.hands).toHaveLength(0);
    expect(s.games[0]?.draft).toBeNull();
  });

  it('substitutes or swaps seats', () => {
    let s = reduce(withGame(), { type: 'setSeat', gameId: 'g1', seat: 0, playerId: 'p4', now: 1 });
    expect(s.games[0]?.seats).toEqual(['p4', 'p1', 'p2', 'p3']);
    s = reduce(s, { type: 'setSeat', gameId: 'g1', seat: 0, playerId: 'p1', now: 2 });
    expect(s.games[0]?.seats).toEqual(['p1', 'p4', 'p2', 'p3']);
  });

  it('ends early and reopens', () => {
    let s = reduce(withGame(), { type: 'endGame', gameId: 'g1', kind: 'called', now: 5 });
    expect(s.games[0]?.endedEarly).toEqual({ kind: 'called', at: 5 });
    s = reduce(s, { type: 'reopenGame', gameId: 'g1', now: 6 });
    expect(s.games[0]?.endedEarly).toBeNull();
  });

  it('throws for unknown games', () => {
    expect(() =>
      reduce(initialState(), { type: 'deleteHand', gameId: 'x', handId: 'y', now: 0 }),
    ).toThrow(/not found/);
  });

  it('does not mutate the previous state', () => {
    const s = withGame();
    const snapshot = JSON.stringify(s);
    reduce(s, { type: 'saveHand', gameId: 'g1', handId: 'h1', hand, now: 12 });
    reduce(s, { type: 'setSeat', gameId: 'g1', seat: 0, playerId: 'p4', now: 1 });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
