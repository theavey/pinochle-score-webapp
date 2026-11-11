import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, describeRules } from './rules';
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

describe('win by lead', () => {
  // Team 0 takes 140 while team 1 is set on a bid of 60: a 200-point lead, below the target.
  const bigLead = () => played({ bidder: 1, bid: 60, meld: [115, 0], tricks: [25, 0] });

  it('is off by default: a big lead below the target keeps playing', () => {
    expect(DEFAULT_RULES.winByLead).toBeNull();
    const s = scoreGame(game([bigLead()]));
    expect(s.totals).toEqual([140, -60]);
    expect(s.status).toBe('active');
    expect(s.winner).toBeNull();
    expect(s.wonBy).toBeNull();
  });

  it('when on, the leader wins once the lead reaches the margin', () => {
    const s = scoreGame(game([bigLead()], { winByLead: 150 }));
    expect(s.status).toBe('won');
    expect(s.winner).toBe(0);
    expect(s.wonBy).toBe('lead');
    expect(s.decidingHand).toBe(0);
  });

  it('a lead of exactly the margin wins; one point less does not', () => {
    // Team 1 is set on 25; team 0 scores meld + all 25 trick points.
    const exact = played({ bidder: 1, bid: 25, meld: [100, 0], tricks: [25, 0] });
    const short = played({ bidder: 1, bid: 25, meld: [99, 0], tricks: [25, 0] });
    const won = scoreGame(game([exact], { winByLead: 150 }));
    expect(won.totals).toEqual([125, -25]);
    expect(won.winner).toBe(0);
    expect(won.wonBy).toBe('lead');
    const notYet = scoreGame(game([short], { winByLead: 150 }));
    expect(notYet.totals).toEqual([124, -25]);
    expect(notYet.status).toBe('active');
  });

  it('the lead can come from the other team being set', () => {
    const hands = [
      played({ bidder: 0, bid: 25, meld: [80, 15], tricks: [20, 5] }),
      // Team 1 bids 100 and is set: team 0 only gains 10, but now leads by 190.
      played({ bidder: 1, bid: 100, meld: [0, 10], tricks: [10, 15] }),
    ];
    const s = scoreGame(game(hands, { winByLead: 150 }));
    expect(s.results.map((r) => r.totals)).toEqual([
      [100, 20],
      [110, -80],
    ]);
    expect(s.winner).toBe(0);
    expect(s.wonBy).toBe('lead');
    expect(s.decidingHand).toBe(1);
  });

  it('works for either team, including a leader below zero', () => {
    const hands = [
      played({ bidder: 0, bid: 150, meld: [0, 0], tricks: [0, 25] }),
      played({ bidder: 0, bid: 25, meld: [0, 0], tricks: [10, 15] }),
    ];
    const s = scoreGame(game(hands, { winByLead: 200 }));
    expect(s.totals).toEqual([-175, 40]);
    expect(s.winner).toBe(1);
    expect(s.wonBy).toBe('lead');
    expect(s.decidingHand).toBe(1);
  });

  it('when the target is reached on the same hand, the target rules decide as before', () => {
    // Both teams cross 150; team 1 bid and made it, so it goes out first,
    // even though team 0 leads by 125 (more than the margin).
    const hands = [played({ bidder: 1, bid: 25, meld: [270, 140], tricks: [10, 15] })];
    const s = scoreGame(game(hands, { winByLead: 100 }));
    expect(s.totals).toEqual([280, 155]);
    expect(s.winner).toBe(1);
    expect(s.wonBy).toBe('target');

    // One team reaching the target with a big lead is a normal target win.
    const one = [played({ bidder: 0, bid: 25, meld: [140, 0], tricks: [20, 5] })];
    const t = scoreGame(game(one, { winByLead: 100 }));
    expect(t.totals).toEqual([160, 5]);
    expect(t.wonBy).toBe('target');
  });

  it('editing an earlier hand recomputes whether the game was won', () => {
    const h1 = played({ bidder: 1, bid: 25, meld: [100, 0], tricks: [25, 0] });
    const h2 = played({ bidder: 0, bid: 25, meld: [0, 20], tricks: [15, 10] });
    const won = scoreGame(game([h1, h2], { winByLead: 150 }));
    expect(won.status).toBe('won');
    expect(won.decidingHand).toBe(0);

    // A smaller first hand: 140 ahead, then team 0 is set. Nobody has won.
    const edited = { ...h1, meld: [90, 0] as [number, number] };
    const s = scoreGame(game([edited, h2], { winByLead: 150 }));
    expect(s.totals).toEqual([90, 5]);
    expect(s.status).toBe('active');
    expect(s.wonBy).toBeNull();

    // Editing the second hand so team 1 is the one set: the lead grows and wins there.
    const setTeam1 = { ...h2, bidder: 1 as Seat, meld: [0, 0] as [number, number] };
    const later = scoreGame(game([edited, setTeam1], { winByLead: 150 }));
    expect(later.totals).toEqual([130, -50]);
    expect(later.status).toBe('won');
    expect(later.wonBy).toBe('lead');
    expect(later.decidingHand).toBe(1);
  });

  it('turning it on mid-game ends a game already ahead by the margin; off resumes it', () => {
    // Scores are derived from the rules, so changing them re-decides the game.
    const hands = [bigLead()];
    expect(scoreGame(game(hands)).status).toBe('active');
    expect(scoreGame(game(hands, { winByLead: 150 })).status).toBe('won');
    expect(scoreGame(game(hands, { winByLead: 250 })).status).toBe('active');
    expect(scoreGame(game(hands, { winByLead: null })).status).toBe('active');
  });

  it('does not change called games', () => {
    const hands = [played({ bidder: 0, bid: 25, meld: [10, 5], tricks: [15, 10] })];
    const s = scoreGame(game(hands, { winByLead: 150 }, { endedEarly: { kind: 'called', at: 1 } }));
    expect(s.status).toBe('called');
    expect(s.winner).toBe(0);
    expect(s.wonBy).toBeNull();
  });
});

describe('describeRules', () => {
  it('mentions win by lead only when it is on', () => {
    expect(describeRules(R).join('\n')).not.toMatch(/leading/);
    expect(describeRules({ ...R, winByLead: 120 })).toContain('Also win by leading by 120');
  });
});
