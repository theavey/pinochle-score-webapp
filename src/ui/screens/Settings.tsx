import { useEffect, useState } from 'preact/hooks';
import { MAX_NAME_LENGTH } from '../../domain/reducer';
import type { AppState, Player, Rules } from '../../domain/types';
import { backupFileName, exportBackup, mergeBackup, parseBackup } from '../../storage/backup';
import { requestPersistence } from '../../storage/persist';
import { Choice } from '../components/Choice';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { RulesEditor } from '../components/RulesEditor';
import { href } from '../router';
import {
  createInvite,
  inviteLink,
  isSyncOn,
  joinWithInvite,
  resetGroup,
  startNewGroup,
  stopSync,
  useSyncStatus,
} from '../../sync/engine';
import type { Invite } from '../../sync/engine';
import { dispatch, getState, showToast, useStore } from '../store';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function download(text: string, name: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

async function exportData() {
  const now = Date.now();
  const text = exportBackup(getState(), now);
  const name = backupFileName(now);
  const file = new File([text], name, { type: 'application/json' });
  // On phones the share sheet lets you save to Files/Drive or send it to yourself.
  if ('canShare' in navigator && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Pinochle backup' });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }
  download(text, name);
}

function PlayersSection() {
  const { state } = useStore();
  const [editing, setEditing] = useState<Player | null>(null);
  const [name, setName] = useState('');
  const [mergeInto, setMergeInto] = useState('');
  const sorted = [...state.players].sort((a, b) => a.name.localeCompare(b.name));
  const close = () => {
    setEditing(null);
    setMergeInto('');
  };

  return (
    <section class="card">
      <h2>Players</h2>
      {sorted.length === 0 && <p class="muted small">Players you add to games appear here.</p>}
      <ul class="pick-list">
        {sorted.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              class="pick-item"
              onClick={() => {
                setEditing(p);
                setName(p.name);
              }}
            >
              <span>{p.name}</span>
              <span class="muted small">Edit</span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={editing !== null} title={`Edit ${editing?.name ?? ''}`} onClose={close}>
        {editing && (
          <>
            <form
              class="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  dispatch(
                    { type: 'renamePlayer', id: editing.id, name, now: Date.now() },
                    'Player renamed',
                  )
                )
                  close();
              }}
            >
              <input
                class="grow"
                type="text"
                aria-label="Name"
                maxLength={MAX_NAME_LENGTH}
                value={name}
                onInput={(e) => {
                  setName(e.currentTarget.value);
                }}
              />
              <button type="submit" class="btn btn-primary">
                Rename
              </button>
            </form>
            <div class="field">
              <span class="field-label">Same person as…</span>
              <Choice
                label={`Merge ${editing.name} into`}
                stacked
                value={mergeInto || null}
                options={sorted
                  .filter((p) => p.id !== editing.id)
                  .map((p) => ({ value: p.id, label: p.name }))}
                onChange={setMergeInto}
              />
              <button
                type="button"
                class="btn"
                disabled={!mergeInto}
                onClick={() => {
                  if (
                    dispatch(
                      { type: 'mergePlayers', from: editing.id, into: mergeInto, now: Date.now() },
                      `Merged ${editing.name}`,
                    )
                  )
                    close();
                }}
              >
                Merge
              </button>
              <p class="field-hint">Moves all of {editing.name}’s games to the chosen player.</p>
            </div>
            <button
              type="button"
              class="btn btn-danger-outline"
              onClick={() => {
                if (
                  dispatch(
                    { type: 'deletePlayer', id: editing.id, now: Date.now() },
                    'Player removed',
                  )
                )
                  close();
              }}
            >
              Remove player
            </button>
          </>
        )}
      </Dialog>
    </section>
  );
}

function SyncSection() {
  const status = useSyncStatus();
  const on = isSyncOn();
  const [joining, setJoining] = useState(false);
  const [typed, setTyped] = useState('');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Make a one-time invite and offer it through the share sheet (or show it). */
  const makeInvite = async () => {
    setBusy(true);
    try {
      const made = await createInvite();
      setInvite(made);
      await shareInvite(made);
    } catch {
      showToast('Could not make an invite right now. Try again when online.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const shareInvite = async (inv: Invite) => {
    const url = inviteLink(inv.code);
    if ('share' in navigator) {
      try {
        await navigator.share({ title: 'Join my pinochle scores', url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied');
    } catch {
      /* the code is on screen to type instead */
    }
  };

  const statusText =
    status.state === 'synced'
      ? 'Synced'
      : status.state === 'syncing'
        ? 'Syncing…'
        : status.state === 'offline'
          ? 'Offline: changes are saved here and will sync when you’re back online'
          : status.state === 'error'
            ? status.message
            : 'Off';

  const expiry = invite
    ? new Date(invite.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    <section class="card" aria-labelledby="sync-title">
      <h2 id="sync-title">Sync between devices</h2>
      {!on ? (
        <>
          <p class="muted small">
            Keep games in step across your phone, iPad and other devices (they can show the live
            score, too). Data is encrypted on each device before it’s sent, so the server can’t read
            it.
          </p>
          <div class="row wrap">
            <button
              type="button"
              class="btn btn-primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void startNewGroup()
                  .then(() => makeInvite())
                  .finally(() => {
                    setBusy(false);
                  });
              }}
            >
              Start syncing
            </button>
            <button
              type="button"
              class="btn"
              aria-expanded={joining}
              onClick={() => {
                setJoining(!joining);
              }}
            >
              Join with a code
            </button>
          </div>
          {joining && (
            <form
              class="row"
              onSubmit={(e) => {
                e.preventDefault();
                setBusy(true);
                void joinWithInvite(typed)
                  .then((result) => {
                    if (result === 'joined') {
                      setTyped('');
                      setJoining(false);
                      showToast('Joined. Games are syncing.');
                    } else if (result === 'used') {
                      showToast(
                        'That invite was already used or has expired. Ask for a new one.',
                        'error',
                      );
                    } else showToast('That code isn’t valid. Check it and try again.', 'error');
                  })
                  .catch(() => {
                    showToast('Could not join right now. Try again when online.', 'error');
                  })
                  .finally(() => {
                    setBusy(false);
                  });
              }}
            >
              <input
                class="grow"
                type="text"
                aria-label="Invite code"
                placeholder="XXXXX-XXXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellcheck={false}
                value={typed}
                onInput={(e) => {
                  setTyped(e.currentTarget.value);
                }}
              />
              <button type="submit" class="btn btn-primary" disabled={busy || !typed.trim()}>
                Join
              </button>
            </form>
          )}
        </>
      ) : (
        <>
          <p class={status.state === 'error' ? 'field-error' : 'small'} role="status">
            {statusText}
          </p>
          <div class="row wrap">
            <button
              type="button"
              class="btn btn-primary"
              disabled={busy}
              onClick={() => void makeInvite()}
            >
              Invite a device
            </button>
          </div>
          {invite && (
            <div class="invite">
              <p class="small">
                Open the link on the other device, or type this code under <em>Join with a code</em>
                :
              </p>
              <p class="sync-code" aria-label="Invite code">
                {invite.code}
              </p>
              <p class="muted tiny">Works once, until {expiry}.</p>
              <div class="row wrap">
                <button
                  type="button"
                  class="btn btn-small"
                  onClick={() => void shareInvite(invite)}
                >
                  Share invite link
                </button>
                <button
                  type="button"
                  class="btn btn-small"
                  onClick={() => {
                    setInvite(null);
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
          <p class="muted tiny">
            Each invite works once and expires after an hour, so an old link or code that turns up
            later can’t be used. Devices that have joined stay in the group until you reset it.
          </p>
          <div class="row wrap">
            <button type="button" class="btn btn-small" onClick={stopSync}>
              Stop syncing on this device
            </button>
            <button
              type="button"
              class="btn btn-small btn-danger-outline"
              onClick={() => {
                setConfirmReset(true);
              }}
            >
              Reset sync group…
            </button>
          </div>
          <ConfirmDialog
            open={confirmReset}
            title="Reset the sync group?"
            message="The group's copy on the server is erased and a new group is made from this device's games. Every other device stops syncing until it joins again with a new invite. Use this if a device that joined was lost or shouldn't have access any more."
            confirmLabel="Reset group"
            danger
            onCancel={() => {
              setConfirmReset(false);
            }}
            onConfirm={() => {
              setConfirmReset(false);
              setInvite(null);
              void resetGroup()
                .then(() => makeInvite())
                .catch(() => {
                  showToast('Could not reset right now. Try again when online.', 'error');
                });
            }}
          />
        </>
      )}
    </section>
  );
}

function BackupSection() {
  const [pending, setPending] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return;
    try {
      const next = mode === 'merge' ? mergeBackup(getState(), pending) : pending;
      dispatch(
        { type: 'replaceState', state: next },
        mode === 'merge' ? 'Backup merged' : 'Backup restored',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    }
    setPending(null);
  };

  return (
    <section class="card">
      <h2>Backup</h2>
      <p class="muted small">
        Scores live only on this device. Export a backup now and then (to Files, Drive, or email to
        yourself) so a lost phone or cleared browser doesn’t lose your history. Importing on another
        device moves your history there.
      </p>
      <div class="row wrap">
        <button type="button" class="btn btn-primary" onClick={() => void exportData()}>
          Export backup
        </button>
        <label class="btn">
          Import backup
          <input
            type="file"
            accept="application/json,.json"
            class="visually-hidden"
            onChange={(e) => {
              const input = e.currentTarget;
              void onFile(input.files?.[0]).finally(() => {
                input.value = '';
              });
            }}
          />
        </label>
      </div>
      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
      <Dialog
        open={pending !== null}
        title="Import backup"
        onClose={() => {
          setPending(null);
        }}
        actions={
          <>
            <button
              type="button"
              class="btn"
              onClick={() => {
                setPending(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-danger-outline"
              onClick={() => {
                apply('replace');
              }}
            >
              Replace
            </button>
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => {
                apply('merge');
              }}
            >
              Merge
            </button>
          </>
        }
      >
        <p>
          Backup has {plural(pending?.games.length ?? 0, 'game')} and{' '}
          {plural(pending?.players.length ?? 0, 'player')}.
        </p>
        <p class="muted small">
          <strong>Merge</strong> adds them to what’s here (same-name players are combined).{' '}
          <strong>Replace</strong> discards everything on this device first.
        </p>
      </Dialog>
    </section>
  );
}

function StorageSection() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  useEffect(() => {
    void requestPersistence().then(setPersisted);
    const raw = localStorage.getItem('pinochle:v1');
    if (raw) setUsage(`${Math.ceil(raw.length / 1024)} KB used`);
  }, []);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return (
    <section class="card">
      <h2>This device</h2>
      <ul class="facts">
        <li>
          Installed as an app: <strong>{standalone ? 'yes' : 'no'}</strong>
        </li>
        <li>
          Protected from automatic cleanup:{' '}
          <strong>{persisted === null ? 'unknown' : persisted ? 'yes' : 'no'}</strong>
        </li>
        {usage && <li>{usage}</li>}
      </ul>
      {!standalone && (
        <details>
          <summary>Install on your home screen (recommended)</summary>
          <p class="small">
            <strong>iPhone/iPad (Safari):</strong> tap Share, then “Add to Home Screen”. Safari may
            erase website data that hasn’t been used for a while; installed apps are exempt.
          </p>
          <p class="small">
            <strong>Android (Chrome):</strong> tap ⋮, then “Install app” or “Add to Home screen”.
          </p>
          <p class="small muted">
            Note: an installed app keeps its own copy of the data, separate from the browser tab.
            Use Export/Import to move games between them.
          </p>
        </details>
      )}
    </section>
  );
}

export function Settings() {
  const { state } = useStore();
  const [rules, setRules] = useState<Rules>(state.defaultRules);

  return (
    <main class="page">
      <header class="topbar">
        <a class="icon-btn" href={href({ name: 'home' })} aria-label="Back to home">
          ‹
        </a>
        <h1>Settings</h1>
        <span class="icon-btn" aria-hidden="true" />
      </header>

      <section class="card">
        <h2>Default rules for new games</h2>
        <RulesEditor
          rules={rules}
          idPrefix="defaults"
          onChange={(r) => {
            setRules(r);
            dispatch({ type: 'setDefaultRules', rules: r });
          }}
        />
        <p class="muted tiny">
          Each game keeps its own copy, so changing these won’t alter past games.
        </p>
      </section>

      <PlayersSection />
      <SyncSection />
      <BackupSection />
      <StorageSection />

      <section class="card">
        <h2>About</h2>
        <p class="small">
          Version {__APP_VERSION__}. Works offline. No accounts, no tracking: nothing you enter
          leaves this device unless you export it.
        </p>
        <p class="small muted">
          Updates download automatically and apply the next time you open the app.
        </p>
      </section>
    </main>
  );
}
