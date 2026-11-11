import { useState } from 'preact/hooks';
import { parseCode } from '../../sync/crypto';
import { joinGroup } from '../../sync/engine';
import { href, navigate } from '../router';
import { showToast } from '../store';

/** Opened from an invite link (#/join/<code>): confirm before merging this device in. */
export function JoinSync({ code }: { code: string }) {
  const [busy, setBusy] = useState(false);
  const valid = parseCode(code) !== null;

  const join = async () => {
    setBusy(true);
    const ok = await joinGroup(code);
    // Replace the URL so the secret code doesn't linger in history.
    navigate({ name: 'settings' }, true);
    showToast(
      ok ? 'Joined. Games are syncing.' : 'That invite link is not valid.',
      ok ? 'info' : 'error',
    );
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
        {valid ? (
          <>
            <h2>Join this sync group?</h2>
            <p>
              Games and players on this device will be merged with the group’s, and from then on
              changes sync between all devices in the group.
            </p>
            <p class="muted small">
              Only join a group you trust: anyone with this link can see and change its games.
            </p>
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
        ) : (
          <>
            <h2>Invite link not valid</h2>
            <p>Ask for a new invite link from a device that is already syncing.</p>
            <a class="btn" href={href({ name: 'home' })}>
              Home
            </a>
          </>
        )}
      </section>
    </main>
  );
}
