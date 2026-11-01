import { parseWhole } from '../../domain/draft';

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Value used when + is pressed on an empty field. */
  start?: number;
  min?: number;
  max?: number;
  step?: number;
  error?: string | undefined;
  hint?: string | undefined;
  disabled?: boolean;
}

/**
 * Whole-number input with big −/+ buttons. Uses a text input with
 * inputmode=numeric so phones show the number pad without the quirks of
 * type=number (scroll-to-change, "e", locale commas).
 */
export function NumberField(p: Props) {
  const min = p.min ?? 0;
  const step = p.step ?? 1;
  const n = parseWhole(p.value);
  const bump = (dir: 1 | -1) => {
    let next = n === null ? (p.start ?? min) : n + dir * step;
    next = Math.max(min, p.max === undefined ? next : Math.min(p.max, next));
    p.onChange(String(next));
  };
  const describedBy = p.error ? `${p.id}-err` : p.hint ? `${p.id}-hint` : undefined;
  return (
    <div class={`field${p.error ? ' has-error' : ''}`}>
      <label for={p.id}>{p.label}</label>
      <div class="stepper">
        <button
          type="button"
          class="step"
          aria-label={`Decrease ${p.label}`}
          disabled={p.disabled === true || (n !== null && n <= min)}
          onClick={() => {
            bump(-1);
          }}
        >
          −
        </button>
        <input
          id={p.id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="next"
          maxLength={6}
          value={p.value}
          disabled={p.disabled}
          aria-invalid={p.error ? true : undefined}
          aria-describedby={describedBy}
          onInput={(e) => {
            p.onChange(e.currentTarget.value.replace(/[^0-9]/g, ''));
          }}
          onFocus={(e) => {
            e.currentTarget.select();
          }}
        />
        <button
          type="button"
          class="step"
          aria-label={`Increase ${p.label}`}
          disabled={p.disabled === true || (p.max !== undefined && n !== null && n >= p.max)}
          onClick={() => {
            bump(1);
          }}
        >
          +
        </button>
      </div>
      {p.error ? (
        <p class="field-error" id={`${p.id}-err`}>
          {p.error}
        </p>
      ) : p.hint ? (
        <p class="field-hint" id={`${p.id}-hint`}>
          {p.hint}
        </p>
      ) : null}
    </div>
  );
}
