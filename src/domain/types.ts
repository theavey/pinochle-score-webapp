/**
 * Core domain types for 4-player partnership pinochle.
 *
 * Seats are numbered 0..3 clockwise around the table. Partners sit across
 * from each other, so team 0 = seats 0 & 2 and team 1 = seats 1 & 3. The deal
 * (and bidding) passes to the left, i.e. to the next seat clockwise.
 */

export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;
export type TeamPair<T> = [T, T];
export type SeatQuad<T> = [T, T, T, T];

export type PlayerId = string;
export type GameId = string;
export type HandId = string;

export interface Player {
  id: PlayerId;
  name: string;
  createdAt: number;
}

/** What the defenders score when the bidding team throws in (concedes). */
export type ThrowInDefenderScoring = 'meld' | 'meldPlusAllTricks' | 'nothing';

export interface Rules {
  /** Score a team must reach to win. */
  targetScore: number;
  /** Lowest legal opening bid. Also the forced bid when the dealer is stuck. */
  minBid: number;
  /** Trick points available per hand (counters + last trick). */
  trickTotal: number;
  /** A team's meld only counts if that team takes at least one trick. */
  meldNeedsTrick: boolean;
  /** If both teams reach the target on one hand, the bidding team wins if it made its bid. */
  bidderGoesOut: boolean;
  /** The bidder may concede after meld instead of playing the hand. */
  allowThrowIn: boolean;
  throwInDefenderScoring: ThrowInDefenderScoring;
  /** When everyone passes, the dealer must take the bid at the minimum. */
  stuckDealer: boolean;
}

interface HandBase {
  id: HandId;
  createdAt: number;
  /** Seat that dealt this hand. */
  dealer: Seat;
  /** Who was sitting in each seat when this hand was played. */
  players: SeatQuad<PlayerId>;
  bidder: Seat;
  bid: number;
  /** Bid was forced on the dealer because everyone passed. */
  stuck: boolean;
  /** Meld laid down by each team (pre trick requirement). */
  meld: TeamPair<number>;
}

export interface PlayedHand extends HandBase {
  kind: 'played';
  /** Trick (counter) points taken by each team. Sums to rules.trickTotal. */
  tricks: TeamPair<number>;
  /**
   * Whether each team took at least one trick. Implied true when that team
   * has trick points; only meaningful to set explicitly for a team that took
   * a trick containing no counters.
   */
  tookTrick: TeamPair<boolean>;
}

export interface ThrownInHand extends HandBase {
  kind: 'thrownIn';
}

export type Hand = PlayedHand | ThrownInHand;

export type EndedEarly = { kind: 'called' | 'abandoned'; at: number };

/** In-progress hand entry, persisted so nothing is lost when switching apps. */
export interface HandDraft {
  /** When set, the draft is editing an existing hand rather than adding one. */
  editingHandId: HandId | null;
  dealer: Seat;
  bidder: Seat | null;
  bid: string;
  stuck: boolean;
  meld: TeamPair<string>;
  /**
   * Trick points for the defending (non-bidding) team, who usually have fewer
   * counters to add up; the bidding team gets the remainder.
   */
  defenderTricks: string;
  tookTrick: TeamPair<boolean>;
  thrownIn: boolean;
}

export interface Game {
  id: GameId;
  createdAt: number;
  updatedAt: number;
  /** Current seating. Hands keep their own snapshot in case of substitutions. */
  seats: SeatQuad<PlayerId>;
  firstDealer: Seat;
  rules: Rules;
  hands: Hand[];
  endedEarly: EndedEarly | null;
  draft: HandDraft | null;
}

export interface Settings {
  keepAwake: boolean;
}

export const SCHEMA_VERSION = 2;

export interface AppState {
  schemaVersion: typeof SCHEMA_VERSION;
  players: Player[];
  games: Game[];
  defaultRules: Rules;
  settings: Settings;
}
