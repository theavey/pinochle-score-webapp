interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  value: T | null;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  /** One option per row (for long labels or many options). */
  stacked?: boolean;
}

/**
 * Single-choice picker made of buttons. Used instead of <select>: big tap
 * targets on phones, and WebKit's built-in <select> styling is blocked by our
 * strict CSP (style-src 'self'), which the e2e CSP probe catches.
 */
export function Choice<T extends string>({ label, value, options, onChange, stacked }: Props<T>) {
  return (
    <div class={`seg${stacked ? ' seg-stack' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          class={`seg-btn${value === o.value ? ' selected' : ''}`}
          onClick={() => {
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
