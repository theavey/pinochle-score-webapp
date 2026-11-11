import { useState } from 'preact/hooks';
import { parseInvite } from '../../sync/crypto';
import { joinWithInvite } from '../../sync/engine';
import { href, navigate } from '../router';
import { showToast } from '../store';

type Problem = null | 'used' | 'offline';

/**
 * Opened from an invite link (#/join/<invite>). Nothing is claimed until the
 * person taps Join: invites work once, and a link preview or an accidental
 * open mustn't use one up.
 */
export function JoinSync({ code }: { code: string }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const valid = parseInvite(code) !== null;

  const join = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const result = await joinWithInvite(code);
      if (result === 'joined') {
        // Replace the URL so the (now used) invite doesn't linger in history.
        navigate({ name: 'settings' }, true);
        showToast('Joined. Games are syncing.');
        return;
      }
      setProblem('used');
    } catch {
      setProblem('offline');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="page">
      <header class="topbar">
        <a class="icon-btn" href={href({ name: 'home' })} aria-label="Back to home">
          ‹
        </a>
        <h1>Sync devices</h1>
        <span class="icon-btn" aria-hidden="true" />
      </header>
      <section class="card">
        {!valid ? (
          <>
            <h2>Invite link not valid</h2>
            <p>
              Ask for a new invite from a device that is already syncing (Settings → Sync between
              devices → Invite a device). Links from before invites became one-time no longer work.
            </p>
            <a class="btn" href={href({ name: 'home' })}>
              Home
            </a>
          </>
        ) : problem === 'used' ? (
          <>
            <h2>Invite already used or expired</h2>
            <p>
              Each invite works once, for an hour. Ask for a new one from a device that is already
              syncing (Settings → Sync between devices → Invite a device).
            </p>
            <a class="btn" href={href({ name: 'home' })}>
              Home
            </a>
          </>
        ) : (
          <>
            <h2>Join this sync group?</h2>
            <p>
              Games and players on this device will be merged with the group’s, and from then on
              changes sync between all devices in the group.
            </p>
            <p class="muted small">
              Only join a group you trust: its members can see and change its games.
            </p>
            {problem === 'offline' && (
              <p class="field-error" role="alert">
                Couldn’t reach the server. Check the connection and try again.
              </p>
            )}
            <div class="row wrap">
              <button
                type="button"
                class="btn"
                onClick={() => {
                  navigate({ name: 'home' }, true);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-primary"
                disabled={busy}
                onClick={() => void join()}
              >
                {busy ? 'Joining…' : 'Join'}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
