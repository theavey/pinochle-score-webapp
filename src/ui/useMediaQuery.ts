import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * Whether a CSS media query currently matches; updates when it changes (e.g.
 * on rotation). `onChange` runs for every change event, even ones too quick
 * for a render in between (such as rotating there and back).
 */
export function useMediaQuery(query: string, onChange?: (matches: boolean) => void): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  const callbackRef = useRef(onChange);
  useEffect(() => {
    callbackRef.current = onChange;
  });
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handle = () => {
      setMatches(mql.matches);
      callbackRef.current?.(mql.matches);
    };
    setMatches(mql.matches);
    mql.addEventListener('change', handle);
    return () => {
      mql.removeEventListener('change', handle);
    };
  }, [query]);
  return matches;
}
