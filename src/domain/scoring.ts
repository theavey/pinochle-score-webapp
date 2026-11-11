import { nextSeat, otherTeam, teamOf } from './seats';
import type { Game, Hand, Rules, Seat, Team, TeamPair } from './types';

export interface HandScore {
  bidderTeam: Team;
  /** Points each team gains (or loses) on this hand. */
  delta: TeamPair<number>;
  /** Did the bidding team make its bid? Always false for a throw-in. */
  made: boolean;
  /** Whether each team's meld counted toward its score. */
  meldCounted: TeamPair<boolean>;
  /** Bidding team's counted meld + tricks (what was compared against the bid). */
  bidderPoints: number;
}

/** Score a single hand. Pure: depends only on the hand and the rules. */
export function scoreHand(hand: Hand, rules: Rules): HandScore {
  const b = teamOf(hand.bidder);
  const d = otherTeam(b);
  const delta: TeamPair<number> = [0, 0];

  if (hand.kind === 'thrownIn') {
    delta[b] = -hand.bid;
    delta[d] = {
      meld: hand.meld[d],
      meldPlusAllTricks: hand.meld[d] + rules.trickTotal,
      nothing: 0,
    }[rules.throwInDefenderScoring];
    const meldCounted: TeamPair<boolean> = [false, false];
    meldCounted[d] = rules.throwInDefenderScoring !== 'nothing';
    return { bidderTeam: b, delta, made: false, meldCounted, bidderPoints: 0 };
  }

  const took: TeamPair<boolean> = [
    hand.tookTrick[0] || hand.tricks[0] > 0,
    hand.tookTrick[1] || hand.tricks[1] > 0,
  ];
  const meldCounted: TeamPair<boolean> = [
    !rules.meldNeedsTrick || took[0],
    !rules.meldNeedsTrick || took[1],
  ];
  const points = (t: Team) => (meldCounted[t] ? hand.meld[t] : 0) + hand.tricks[t];

  const bidderPoints = points(b);
  const made = bidderPoints >= hand.bid;
  delta[b] = made ? bidderPoints : -hand.bid;
  delta[d] = points(d);
  return { bidderTeam: b, delta, made, meldCounted, bidderPoints };
}

/** Why a game was won: a team reached the target, or (optional rule) led by enough. */
export type WinReason = 'target' | 'lead';

export interface Win {
  team: Team;
  by: WinReason;
}

/**
 * Decide whether a hand ended the game, given totals after that hand.
 * Returns the winning team and why, or null if play continues.
 */
export function winnerAfterHand(
  totals: TeamPair<number>,
  score: HandScore,
  rules: Rules,
): Win | null {
  const byTarget = targetWinner(totals, score, rules);
  if (byTarget !== null) return { team: byTarget, by: 'target' };
  // Only when the target hasn't decided it: a big enough lead also ends the game.
  if (rules.winByLead !== null && Math.abs(totals[0] - totals[1]) >= rules.winByLead) {
    return { team: totals[0] > totals[1] ? 0 : 1, by: 'lead' };
  }
  return null;
}

function targetWinner(totals: TeamPair<number>, score: HandScore, rules: Rules): Team | null {
  const t = rules.targetScore;
  const over: TeamPair<boolean> = [totals[0] >= t, totals[1] >= t];
  if (over[0] && over[1]) {
    if (rules.bidderGoesOut && score.made) return score.bidderTeam;
    if (totals[0] === totals[1]) return null;
    return totals[0] > totals[1] ? 0 : 1;
  }
  if (over[0]) return 0;
  if (over[1]) return 1;
  return null;
}

export interface HandResult {
  hand: Hand;
  index: number;
  score: HandScore;
  /** Running totals after this hand. */
  totals: TeamPair<number>;
}

export type GameStatus = 'active' | 'won' | 'called' | 'abandoned';

export interface GameScore {
  results: HandResult[];
  totals: TeamPair<number>;
  status: GameStatus;
  /** Winning team, or null if active, abandoned, or called while tied. */
  winner: Team | null;
  /** Index of the hand that won the game, if any. */
  decidingHand: number | null;
  /** Why the game was won (only when status is 'won'). */
  wonBy: WinReason | null;
  /** Default dealer for the next hand. */
  nextDealer: Seat;
}

/** Replay every hand of a game. All derived numbers come from here. */
export function scoreGame(
  game: Pick<Game, 'hands' | 'rules' | 'firstDealer' | 'endedEarly'>,
): GameScore {
  const totals: TeamPair<number> = [0, 0];
  const results: HandResult[] = [];
  let winner: Team | null = null;
  let decidingHand: number | null = null;
  let wonBy: WinReason | null = null;

  for (const [index, hand] of game.hands.entries()) {
    const score = scoreHand(hand, game.rules);
    totals[0] += score.delta[0];
    totals[1] += score.delta[1];
    results.push({ hand, index, score, totals: [totals[0], totals[1]] });
    if (decidingHand === null) {
      const win = winnerAfterHand(totals, score, game.rules);
      if (win !== null) {
        winner = win.team;
        wonBy = win.by;
        decidingHand = index;
      }
    }
  }

  let status: GameStatus = decidingHand !== null ? 'won' : 'active';
  if (status === 'active' && game.endedEarly) {
    status = game.endedEarly.kind;
    if (status === 'called' && totals[0] !== totals[1]) {
      winner = totals[0] > totals[1] ? 0 : 1;
    }
  }

  const last = game.hands[game.hands.length - 1];
  const nextDealer = last ? nextSeat(last.dealer) : game.firstDealer;

  return { results, totals, status, winner, decidingHand, wonBy, nextDealer };
}

export function isFinished(status: GameStatus): boolean {
  return status !== 'active';
}
