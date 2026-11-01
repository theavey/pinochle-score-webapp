import { useEffect } from 'preact/hooks';

/** Keep the screen on while `enabled` (Screen Wake Lock API, where supported). */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const l = await navigator.wakeLock.request('screen');
        if (cancelled) await l.release();
        else lock = l;
      } catch {
        /* Denied (e.g. low battery mode); the screen will just sleep normally. */
      }
    };
    // The lock is dropped whenever the app is hidden; re-acquire on return.
    const onVisible = () => {
      void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [enabled]);
}
