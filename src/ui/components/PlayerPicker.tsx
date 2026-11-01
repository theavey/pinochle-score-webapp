import { useState } from 'preact/hooks';
import { MAX_NAME_LENGTH, findPlayerByName, normalizeName } from '../../domain/reducer';
import type { PlayerId } from '../../domain/types';
import { newId } from '../format';
import { dispatch, useStore } from '../store';
import { Dialog } from './Dialog';

interface Props {
  open: boolean;
  title: string;
  /** Players already at the table (shown as "swap"). */
  seated: PlayerId[];
  onPick: (id: PlayerId) => void;
  onClose: () => void;
}

/** Choose a player from the roster, or add a new one by name. */
export function PlayerPicker({ open, title, seated, onPick, onClose }: Props) {
  const { state } = useStore();
  const [name, setName] = useState('');
  const query = normalizeName(name).toLocaleLowerCase();
  const players = [...state.players]
    .filter((p) => !query || p.name.toLocaleLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
  const exact = findPlayerByName(state, name);

  const add = () => {
    const n = normalizeName(name);
    if (!n) return;
    if (exact) {
      pick(exact.id);
      return;
    }
    const id = newId();
    if (dispatch({ type: 'addPlayer', id, name: n, now: Date.now() })) pick(id);
  };

  const pick = (id: PlayerId) => {
    setName('');
    onPick(id);
  };

  return (
    <Dialog
      open={open}
      title={title}
      onClose={() => {
        setName('');
        onClose();
      }}
    >
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          type="text"
          class="grow"
          placeholder="Search or add a name"
          aria-label="Player name"
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          value={name}
          onInput={(e) => {
            setName(e.currentTarget.value);
          }}
        />
        <button type="submit" class="btn btn-primary" disabled={!normalizeName(name)}>
          {exact ? 'Pick' : 'Add'}
        </button>
      </form>
      <ul class="pick-list">
        {players.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              class="pick-item"
              onClick={() => {
                pick(p.id);
              }}
            >
              <span>{p.name}</span>
              {seated.includes(p.id) && <span class="badge">seated · swap</span>}
            </button>
          </li>
        ))}
        {players.length === 0 && (
          <li class="muted small">
            {state.players.length === 0
              ? 'No players yet. Type a name above.'
              : 'No match. Tap Add.'}
          </li>
        )}
      </ul>
    </Dialog>
  );
}
