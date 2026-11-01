import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from './rules';
import { computeStats } from './stats';
import type { Game, PlayedHand, SeatQuad } from './types';

const seats: SeatQuad<string> = ['a', 'b', 'c', 'd'];

function h(p: Partial<PlayedHand>): PlayedHand {
  return {
    kind: 'played',
    id: Math.random().toString(),
    createdAt: 0,
    dealer: 0,
    players: seats,
    bidder: 0,
    bid: 25,
    stuck: false,
    meld: [0, 0],
    tricks: [15, 10],
    tookTrick: [true, true],
    ...p,
  };
}

function g(hands: PlayedHand[], extra: Partial<Game> = {}): Game {
  return {
    id: Math.random().toString(),
    createdAt: 0,
    updatedAt: 0,
    seats,
    firstDealer: 0,
    rules: { ...DEFAULT_RULES, targetScore: 50 },
    hands,
    endedEarly: null,
    draft: null,
    ...extra,
  };
}

describe('computeStats', () => {
  it('credits bids to the bidder and wins to the team', () => {
    const games = [
      g([
        h({ bidder: 0, bid: 25, meld: [20, 0] }), // made: [35, 10]
        h({ bidder: 1, bid: 30, meld: [0, 5] }), // set: [50, -20], team 0 wins
        h({ bidder: 2, bid: 25, meld: [10, 0], stuck: true }), // after the win; still counted as a bid
      ]),
    ];
    const { players, partnerships } = computeStats(games);
    expect(players.get('a')).toMatchObject({ bidsWon: 1, bidsMade: 1, wins: 1, games: 1 });
    expect(players.get('b')).toMatchObject({ bidsWon: 1, bidsSet: 1, wins: 0, decided: 1 });
    expect(players.get('c')).toMatchObject({ stuck: 1, wins: 1 });
    expect(partnerships).toHaveLength(2);
    expect(partnerships.find((p) => p.players.includes('a'))).toMatchObject({ wins: 1 });
  });

  it('credits a substitute for the hands they bid', () => {
    const sub: SeatQuad<string> = ['e', 'b', 'c', 'd'];
    const { players } = computeStats([g([h({ players: sub, bidder: 0 })], { seats: sub })]);
    expect(players.get('e')?.bidsWon).toBe(1);
    expect(players.get('a')).toBeUndefined();
  });

  it('skips abandoned and empty games; active games count bids but not results', () => {
    const { players } = computeStats([
      g([h({})], { endedEarly: { kind: 'abandoned', at: 1 } }),
      g([]),
      g([h({ bid: 25 })]),
    ]);
    expect(players.get('a')).toMatchObject({ games: 1, bidsWon: 1, decided: 0 });
  });
});
