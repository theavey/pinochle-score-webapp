import { useEffect, useState } from 'preact/hooks';
import { MAX_NAME_LENGTH } from '../../domain/reducer';
import type { AppState, Player, Rules } from '../../domain/types';
import { backupFileName, exportBackup, mergeStates, parseBackup } from '../../storage/backup';
import { requestPersistence } from '../../storage/persist';
import { Choice } from '../components/Choice';
import { Dialog } from '../components/Dialog';
import { RulesEditor } from '../components/RulesEditor';
import { href } from '../router';
import { dispatch, getState, useStore } from '../store';

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
                if (dispatch({ type: 'renamePlayer', id: editing.id, name }, 'Player renamed'))
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
                      { type: 'mergePlayers', from: editing.id, into: mergeInto },
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
                if (dispatch({ type: 'deletePlayer', id: editing.id }, 'Player removed')) close();
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
      const next = mode === 'merge' ? mergeStates(getState(), pending) : pending;
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
