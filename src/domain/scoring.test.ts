import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from './rules';
import { scoreGame, scoreHand } from './scoring';
import type { Game, Hand, PlayedHand, Rules, Seat, ThrownInHand } from './types';

const R: Rules = { ...DEFAULT_RULES };
const PLAYERS: [string, string, string, string] = ['a', 'b', 'c', 'd'];

let n = 0;
function played(
  p: Partial<PlayedHand> & Pick<PlayedHand, 'bidder' | 'bid' | 'meld' | 'tricks'>,
): PlayedHand {
  n += 1;
  return {
    kind: 'played',
    id: `h${n}`,
    createdAt: n,
    dealer: 0,
    players: PLAYERS,
    stuck: false,
    tookTrick: [p.tricks[0] > 0, p.tricks[1] > 0],
    ...p,
  };
}

function thrownIn(p: Pick<ThrownInHand, 'bidder' | 'bid' | 'meld'>): ThrownInHand {
  n += 1;
  return {
    kind: 'thrownIn',
    id: `h${n}`,
    createdAt: n,
    dealer: 0,
    players: PLAYERS,
    stuck: false,
    ...p,
  };
}

function game(hands: Hand[], rules: Partial<Rules> = {}, extra: Partial<Game> = {}) {
  return {
    hands,
    rules: { ...R, ...rules },
    firstDealer: 0 as Seat,
    endedEarly: null,
    ...extra,
  };
}

describe('scoreHand', () => {
  it('bidding team that makes its bid scores meld + tricks', () => {
    const s = scoreHand(played({ bidder: 1, bid: 30, meld: [8, 12], tricks: [7, 18] }), R);
    expect(s.bidderTeam).toBe(1);
    expect(s.made).toBe(true);
    expect(s.delta).toEqual([15, 30]);
  });

  it('making the bid exactly counts as made', () => {
    const s = scoreHand(played({ bidder: 0, bid: 25, meld: [10, 0], tricks: [15, 10] }), R);
    expect(s.made).toBe(true);
    expect(s.delta).toEqual([25, 10]);
  });

  it('set bidders lose the bid; defenders still score', () => {
    const s = scoreHand(played({ bidder: 2, bid: 32, meld: [14, 6], tricks: [12, 13] }), R);
    expect(s.made).toBe(false);
    expect(s.bidderPoints).toBe(26);
    expect(s.delta).toEqual([-32, 19]);
  });

  it('meld is lost for a team that takes no tricks', () => {
    const s = scoreHand(played({ bidder: 0, bid: 25, meld: [20, 9], tricks: [25, 0] }), R);
    expect(s.meldCounted).toEqual([true, false]);
    expect(s.delta).toEqual([45, 0]);
  });

  it('a trick with no counters still saves meld', () => {
    const hand = played({
      bidder: 0,
      bid: 25,
      meld: [20, 9],
      tricks: [25, 0],
      tookTrick: [true, true],
    });
    expect(scoreHand(hand, R).delta).toEqual([45, 9]);
  });

  it('bidding team without a trick loses its meld and is set', () => {
    const s = scoreHand(played({ bidder: 1, bid: 25, meld: [5, 30], tricks: [25, 0] }), R);
    expect(s.meldCounted[1]).toBe(false);
    expect(s.delta).toEqual([30, -25]);
  });

  it('meld always counts when the trick requirement is off', () => {
    const rules = { ...R, meldNeedsTrick: false };
    const s = scoreHand(played({ bidder: 0, bid: 25, meld: [20, 9], tricks: [25, 0] }), rules);
    expect(s.delta).toEqual([45, 9]);
  });

  it('throw-in: bidder loses bid, defenders score meld only (default)', () => {
    const s = scoreHand(thrownIn({ bidder: 3, bid: 28, meld: [11, 6] }), R);
    expect(s.made).toBe(false);
    expect(s.delta).toEqual([11, -28]);
  });

  it('throw-in scoring variants', () => {
    const h = thrownIn({ bidder: 0, bid: 30, meld: [10, 7] });
    expect(scoreHand(h, { ...R, throwInDefenderScoring: 'meldPlusAllTricks' }).delta).toEqual([
      -30, 32,
    ]);
    expect(scoreHand(h, { ...R, throwInDefenderScoring: 'nothing' }).delta).toEqual([-30, 0]);
  });
});

describe('scoreGame', () => {
  it('accumulates running totals and rotates the dealer', () => {
    const g = game([
      played({ dealer: 2, bidder: 3, bid: 25, meld: [5, 10], tricks: [10, 15] }),
      played({ dealer: 3, bidder: 0, bid: 26, meld: [12, 4], tricks: [20, 5] }),
    ]);
    const s = scoreGame(g);
    expect(s.results.map((r) => r.totals)).toEqual([
      [15, 25],
      [47, 34],
    ]);
    expect(s.totals).toEqual([47, 34]);
    expect(s.status).toBe('active');
    expect(s.winner).toBeNull();
    expect(s.nextDealer).toBe(0);
  });

  it('uses firstDealer before any hands are played', () => {
    expect(scoreGame(game([], {}, { firstDealer: 3 })).nextDealer).toBe(3);
  });

  it('a team reaching the target wins', () => {
    const s = scoreGame(
      game([played({ bidder: 0, bid: 25, meld: [60, 0], tricks: [20, 5] })], {
        targetScore: 50,
      }),
    );
    expect(s.status).toBe('won');
    expect(s.winner).toBe(0);
    expect(s.decidingHand).toBe(0);
  });

  it('defenders can win by reaching the target alone', () => {
    const s = scoreGame(
      game([played({ bidder: 0, bid: 40, meld: [10, 40], tricks: [10, 15] })], {
        targetScore: 50,
      }),
    );
    expect(s.totals).toEqual([-40, 55]);
    expect(s.winner).toBe(1);
  });

  it('bidder goes out first when both teams cross on the same hand', () => {
    // Team 1 bids and makes it, but finishes with fewer points than team 0.
    const hands2 = [
      played({ bidder: 1, bid: 25, meld: [120, 100], tricks: [10, 15] }),
      played({ bidder: 1, bid: 25, meld: [20, 30], tricks: [12, 13] }),
    ];
    const s2 = scoreGame(game(hands2));
    expect(s2.totals).toEqual([162, 158]);
    expect(s2.winner).toBe(1);

    const s3 = scoreGame(game(hands2, { bidderGoesOut: false }));
    expect(s3.winner).toBe(0);
  });

  it('defenders go out when the bidder is set', () => {
    const hands = [
      played({ bidder: 0, bid: 25, meld: [130, 125], tricks: [10, 15] }),
      played({ bidder: 0, bid: 40, meld: [5, 5], tricks: [10, 15] }),
    ];
    const s = scoreGame(game(hands));
    expect(s.totals).toEqual([100, 160]);
    expect(s.winner).toBe(1);
    expect(s.decidingHand).toBe(1);
  });

  it('a tie over the target without bidder-goes-out keeps playing', () => {
    const hands = [played({ bidder: 0, bid: 25, meld: [145, 148], tricks: [15, 10] })];
    const s = scoreGame(game(hands, { bidderGoesOut: false }));
    expect(s.totals).toEqual([160, 158]);
    expect(s.winner).toBe(0);
    const tie = [played({ bidder: 0, bid: 25, meld: [145, 150], tricks: [15, 10] })];
    expect(scoreGame(game(tie, { bidderGoesOut: false })).status).toBe('active');
  });

  it('editing an earlier hand recomputes later totals', () => {
    const h1 = played({ bidder: 0, bid: 25, meld: [10, 5], tricks: [15, 10] });
    const h2 = played({ bidder: 1, bid: 25, meld: [5, 15], tricks: [5, 20] });
    expect(scoreGame(game([h1, h2])).totals).toEqual([35, 50]);
    const edited = { ...h1, meld: [20, 5] as [number, number] };
    expect(scoreGame(game([edited, h2])).totals).toEqual([45, 50]);
  });

  it('called games are won by the leader, or tied', () => {
    const hands = [played({ bidder: 0, bid: 25, meld: [10, 5], tricks: [15, 10] })];
    const called = scoreGame(game(hands, {}, { endedEarly: { kind: 'called', at: 1 } }));
    expect(called.status).toBe('called');
    expect(called.winner).toBe(0);

    const tied = [played({ bidder: 0, bid: 25, meld: [10, 15], tricks: [15, 10] })];
    const t = scoreGame(game(tied, {}, { endedEarly: { kind: 'called', at: 1 } }));
    expect(t.status).toBe('called');
    expect(t.winner).toBeNull();
  });

  it('abandoned games have no winner', () => {
    const hands = [played({ bidder: 0, bid: 25, meld: [10, 5], tricks: [15, 10] })];
    const s = scoreGame(game(hands, {}, { endedEarly: { kind: 'abandoned', at: 1 } }));
    expect(s.status).toBe('abandoned');
    expect(s.winner).toBeNull();
  });

  it('raising the target un-finishes a won game', () => {
    const hands = [played({ bidder: 0, bid: 25, meld: [140, 0], tricks: [20, 5] })];
    expect(scoreGame(game(hands)).status).toBe('won');
    expect(scoreGame(game(hands, { targetScore: 200 })).status).toBe('active');
  });

  it('negative totals are allowed', () => {
    const hands = [played({ bidder: 0, bid: 50, meld: [0, 0], tricks: [10, 15] })];
    expect(scoreGame(game(hands)).totals).toEqual([-50, 15]);
  });
});
