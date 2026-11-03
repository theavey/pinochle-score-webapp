import { RULE_LIMITS } from './rules';
import { otherTeam, teamOf } from './seats';
import type { Hand, HandDraft, PlayerId, Rules, Seat, SeatQuad, TeamPair } from './types';

export function emptyDraft(dealer: Seat): HandDraft {
  return {
    editingHandId: null,
    dealer,
    bidder: null,
    bid: '',
    stuck: false,
    meld: ['', ''],
    defenderTricks: '',
    tookTrick: [false, false],
    thrownIn: false,
  };
}

export function draftFromHand(hand: Hand): HandDraft {
  const b = teamOf(hand.bidder);
  return {
    editingHandId: hand.id,
    dealer: hand.dealer,
    bidder: hand.bidder,
    bid: String(hand.bid),
    stuck: hand.stuck,
    meld: [String(hand.meld[0]), String(hand.meld[1])],
    defenderTricks: hand.kind === 'played' ? String(hand.tricks[otherTeam(b)]) : '',
    tookTrick: hand.kind === 'played' ? [...hand.tookTrick] : [false, false],
    thrownIn: hand.kind === 'thrownIn',
  };
}

/** Parse a whole, non-negative integer typed by the user. Returns null if invalid/empty. */
export function parseWhole(s: string): number | null {
  const t = s.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  return Number(t);
}

export type DraftField = 'bidder' | 'bid' | 'meld0' | 'meld1' | 'tricks';

/** Hand data before it gets an id; distributes over the Hand union. */
export type HandInput = Hand extends infer H
  ? H extends Hand
    ? Omit<H, 'id' | 'createdAt'>
    : never
  : never;

export type DraftResult =
  { ok: true; hand: HandInput } | { ok: false; errors: Partial<Record<DraftField, string>> };

/**
 * Validate a draft and turn it into hand data. Errors are keyed by field so
 * the form can show them inline.
 */
export function parseDraft(
  draft: HandDraft,
  rules: Rules,
  players: SeatQuad<PlayerId>,
): DraftResult {
  const errors: Partial<Record<DraftField, string>> = {};
  const max = RULE_LIMITS.maxEntry;

  if (draft.bidder === null) errors.bidder = 'Pick who won the bid';

  const bid = parseWhole(draft.bid);
  if (bid === null) errors.bid = 'Enter the bid';
  else if (bid < rules.minBid) errors.bid = `Minimum bid is ${rules.minBid}`;
  else if (bid > max) errors.bid = 'Bid looks too large';

  const meld: TeamPair<number | null> = [parseWhole(draft.meld[0]), parseWhole(draft.meld[1])];
  ([0, 1] as const).forEach((t) => {
    const m = meld[t];
    const key = t === 0 ? 'meld0' : 'meld1';
    if (m === null) errors[key] = 'Enter meld (0 if none)';
    else if (m > max) errors[key] = 'Meld looks too large';
  });

  let tricks: TeamPair<number> = [0, 0];
  if (!draft.thrownIn && draft.bidder !== null) {
    const dt = parseWhole(draft.defenderTricks);
    if (dt === null) errors.tricks = 'Enter trick points';
    else if (dt > rules.trickTotal) errors.tricks = `Trick points can't exceed ${rules.trickTotal}`;
    else {
      const d = otherTeam(teamOf(draft.bidder));
      tricks = [0, 0];
      tricks[d] = dt;
      tricks[otherTeam(d)] = rules.trickTotal - dt;
    }
  }

  if (draft.thrownIn && !rules.allowThrowIn) errors.tricks = 'Throw-ins are off for this game';

  if (
    Object.keys(errors).length > 0 ||
    draft.bidder === null ||
    bid === null ||
    meld[0] === null ||
    meld[1] === null
  ) {
    return { ok: false, errors };
  }

  const base = {
    dealer: draft.dealer,
    players: [...players] as SeatQuad<PlayerId>,
    bidder: draft.bidder,
    bid,
    stuck: draft.stuck,
    meld: [meld[0], meld[1]] as TeamPair<number>,
  };
  if (draft.thrownIn) return { ok: true, hand: { ...base, kind: 'thrownIn' } };
  return {
    ok: true,
    hand: {
      ...base,
      kind: 'played',
      tricks,
      tookTrick: [draft.tookTrick[0] || tricks[0] > 0, draft.tookTrick[1] || tricks[1] > 0],
    },
  };
}

export interface BidSummary {
  bidder: Seat;
  bid: number;
  stuck: boolean;
  thrownIn: boolean;
  /**
   * Trick points the bidding team still needs (bid minus their meld), or null
   * until their meld is entered. Zero or less means the meld covers the bid.
   */
  need: number | null;
}

/** What's known so far about the bid in a hand being entered, or null if no bid yet. */
export function draftBidSummary(draft: HandDraft): BidSummary | null {
  if (draft.bidder === null) return null;
  const bid = parseWhole(draft.bid);
  if (bid === null) return null;
  const meld = parseWhole(draft.meld[teamOf(draft.bidder)]);
  return {
    bidder: draft.bidder,
    bid,
    stuck: draft.stuck,
    thrownIn: draft.thrownIn,
    need: meld === null ? null : bid - meld,
  };
}
