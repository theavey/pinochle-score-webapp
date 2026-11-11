import { useState } from 'preact/hooks';
import { parseWhole } from '../../domain/draft';
import { DEFAULT_RULES, DEFAULT_WIN_BY_LEAD, RULE_LIMITS } from '../../domain/rules';
import type { Rules, ThrowInDefenderScoring } from '../../domain/types';
import { Choice } from './Choice';
import { NumberField } from './NumberField';

interface Props {
  rules: Rules;
  onChange: (rules: Rules) => void;
  idPrefix: string;
}

type NumKey = 'targetScore' | 'minBid' | 'trickTotal' | 'winByLead';

/** Value a field's + button starts from when it's empty. */
const START: Record<NumKey, number> = {
  targetScore: DEFAULT_RULES.targetScore,
  minBid: DEFAULT_RULES.minBid,
  trickTotal: DEFAULT_RULES.trickTotal,
  winByLead: DEFAULT_WIN_BY_LEAD,
};

export function RulesEditor({ rules, onChange, idPrefix }: Props) {
  // Keep raw text locally so a half-typed number doesn't get rejected mid-edit.
  const [text, setText] = useState<Record<NumKey, string>>({
    targetScore: String(rules.targetScore),
    minBid: String(rules.minBid),
    trickTotal: String(rules.trickTotal),
    winByLead: String(rules.winByLead ?? DEFAULT_WIN_BY_LEAD),
  });

  const num = (key: NumKey, label: string, step: number) => {
    const n = parseWhole(text[key]);
    const lim = RULE_LIMITS[key];
    const error =
      n === null
        ? 'Required'
        : n < lim.min || n > lim.max
          ? `Must be ${lim.min}–${lim.max}`
          : undefined;
    return (
      <NumberField
        id={`${idPrefix}-${key}`}
        label={label}
        value={text[key]}
        step={step}
        min={lim.min}
        max={lim.max}
        start={START[key]}
        error={error}
        onChange={(v) => {
          setText({ ...text, [key]: v });
          const parsed = parseWhole(v);
          if (parsed !== null && parsed >= lim.min && parsed <= lim.max) {
            onChange({ ...rules, [key]: parsed });
          }
        }}
      />
    );
  };

  const toggle = (
    key: 'meldNeedsTrick' | 'bidderGoesOut' | 'stuckDealer' | 'allowThrowIn',
    label: string,
    hint: string,
  ) => (
    <label class="toggle">
      <input
        type="checkbox"
        checked={rules[key]}
        onChange={(e) => {
          onChange({ ...rules, [key]: e.currentTarget.checked });
        }}
      />
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
    </label>
  );

  return (
    <div class="rules-editor">
      <div class="grid-3">
        {num('targetScore', 'Play to', 10)}
        {num('minBid', 'Min bid', 1)}
        {num('trickTotal', 'Trick pts', 1)}
      </div>
      <label class="toggle">
        <input
          type="checkbox"
          checked={rules.winByLead !== null}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            setText({ ...text, winByLead: String(DEFAULT_WIN_BY_LEAD) });
            onChange({ ...rules, winByLead: on ? DEFAULT_WIN_BY_LEAD : null });
          }}
        />
        <span>
          <strong>Win when ahead by</strong>
          <small>A team that leads by this much wins, even below the target.</small>
        </span>
      </label>
      {rules.winByLead !== null && num('winByLead', 'Lead needed to win', 10)}
      {toggle(
        'meldNeedsTrick',
        'Meld needs a trick',
        'A team’s meld only counts if it takes at least one trick.',
      )}
      {toggle(
        'bidderGoesOut',
        'Bidder goes out first',
        'If both teams reach the target on one hand, the bidding team wins if it made its bid.',
      )}
      {toggle(
        'stuckDealer',
        'Stuck dealer',
        'If everyone passes, the dealer takes it at the minimum bid.',
      )}
      {toggle(
        'allowThrowIn',
        'Allow throw-in',
        'The bidder may concede after meld: bidding team loses the bid.',
      )}
      {rules.allowThrowIn && (
        <div class="field">
          <span class="field-label">On a throw-in, defenders score</span>
          <Choice
            label="On a throw-in, defenders score"
            stacked
            value={rules.throwInDefenderScoring}
            options={[
              { value: 'meld', label: 'Their meld' },
              {
                value: 'meldPlusAllTricks',
                label: `Their meld + all ${rules.trickTotal} trick points`,
              },
              { value: 'nothing', label: 'Nothing' },
            ]}
            onChange={(v: ThrowInDefenderScoring) => {
              onChange({ ...rules, throwInDefenderScoring: v });
            }}
          />
        </div>
      )}
      <p class="muted small">Set bidders always lose the amount they bid.</p>
    </div>
  );
}
