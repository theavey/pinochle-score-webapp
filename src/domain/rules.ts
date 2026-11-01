import type { Rules } from './types';

export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  targetScore: 150,
  minBid: 25,
  trickTotal: 25,
  meldNeedsTrick: true,
  bidderGoesOut: true,
  allowThrowIn: true,
  throwInDefenderScoring: 'meld',
  stuckDealer: true,
});

export const RULE_LIMITS = {
  targetScore: { min: 1, max: 100_000 },
  minBid: { min: 0, max: 10_000 },
  trickTotal: { min: 1, max: 10_000 },
  /** Upper bound for a single meld/bid entry; generous but blocks fat-finger typos. */
  maxEntry: 10_000,
} as const;

export function describeRules(r: Rules): string[] {
  const lines = [
    `Play to ${r.targetScore}`,
    `Minimum bid ${r.minBid}`,
    `${r.trickTotal} trick points per hand`,
    r.meldNeedsTrick ? 'Meld counts only if the team takes a trick' : 'Meld always counts',
    'Set bidders lose their bid',
    r.bidderGoesOut
      ? 'Bidder goes out first if both teams reach the target'
      : 'Higher score wins if both teams reach the target',
    r.stuckDealer ? 'Dealer is stuck if everyone passes' : 'All-pass redeals',
  ];
  if (r.allowThrowIn) {
    const who = {
      meld: 'defenders score their meld',
      meldPlusAllTricks: `defenders score meld + ${r.trickTotal}`,
      nothing: 'defenders score nothing',
    }[r.throwInDefenderScoring];
    lines.push(`Throw-in allowed (${who})`);
  } else {
    lines.push('No throw-ins');
  }
  return lines;
}
