import { describe, expect, it } from 'vitest';
import { draftFromHand, emptyDraft, parseDraft, parseWhole } from './draft';
import { DEFAULT_RULES } from './rules';
import type { HandDraft, Rules } from './types';

const R: Rules = { ...DEFAULT_RULES };
const P: [string, string, string, string] = ['a', 'b', 'c', 'd'];

function draft(p: Partial<HandDraft>): HandDraft {
  return { ...emptyDraft(0), ...p };
}

describe('parseWhole', () => {
  it.each([
    ['0', 0],
    [' 42 ', 42],
    ['', null],
    ['-3', null],
    ['1.5', null],
    ['1e3', null],
    ['abc', null],
    ['9999999', null],
  ])('%j -> %j', (s, want) => {
    expect(parseWhole(s)).toBe(want);
  });
});

describe('parseDraft', () => {
  it('builds a played hand and fills in the other team’s tricks', () => {
    const res = parseDraft(
      draft({ bidder: 1, bid: '30', meld: ['8', '12'], defenderTricks: '7' }),
      R,
      P,
    );
    expect(res).toMatchObject({
      ok: true,
      hand: { kind: 'played', bidder: 1, bid: 30, meld: [8, 12], tricks: [7, 18] },
    });
  });

  it('marks tookTrick from trick points, keeping explicit no-counter tricks', () => {
    const res = parseDraft(
      draft({
        bidder: 0,
        bid: '25',
        meld: ['10', '5'],
        defenderTricks: '0',
        tookTrick: [false, true],
      }),
      R,
      P,
    );
    expect(res.ok && res.hand.kind === 'played' && res.hand.tookTrick).toEqual([true, true]);
  });

  it('builds a thrown-in hand without tricks', () => {
    const res = parseDraft(draft({ bidder: 2, bid: '27', meld: ['9', '4'], thrownIn: true }), R, P);
    expect(res).toMatchObject({ ok: true, hand: { kind: 'thrownIn', bid: 27 } });
  });

  it('reports every missing field', () => {
    const res = parseDraft(draft({}), R, P);
    expect(res.ok).toBe(false);
    if (!res.ok)
      expect(Object.keys(res.errors).sort()).toEqual(['bid', 'bidder', 'meld0', 'meld1']);
  });

  it('enforces the minimum bid and trick total', () => {
    const res = parseDraft(
      draft({ bidder: 0, bid: '20', meld: ['0', '0'], defenderTricks: '26' }),
      R,
      P,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.bid).toMatch(/Minimum/);
      expect(res.errors.tricks).toMatch(/exceed/);
    }
  });

  it('rejects throw-in when disabled', () => {
    const res = parseDraft(
      draft({ bidder: 0, bid: '25', meld: ['0', '0'], thrownIn: true }),
      { ...R, allowThrowIn: false },
      P,
    );
    expect(res.ok).toBe(false);
  });

  it('round-trips through draftFromHand', () => {
    const d = draft({ bidder: 3, bid: '31', meld: ['6', '14'], defenderTricks: '8', dealer: 2 });
    const res = parseDraft(d, R, P);
    if (!res.ok) throw new Error('expected ok');
    const back = draftFromHand({ ...res.hand, id: 'x', createdAt: 0 });
    expect(back).toMatchObject({
      editingHandId: 'x',
      dealer: 2,
      bidder: 3,
      bid: '31',
      meld: ['6', '14'],
      defenderTricks: '8',
    });
  });
});
