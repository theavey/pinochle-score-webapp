import { useState } from 'preact/hooks';
import { describeRules } from '../../domain/rules';
import type { PlayerId, Rules, Seat, SeatQuad } from '../../domain/types';
import { PlayerPicker } from '../components/PlayerPicker';
import { RulesEditor } from '../components/RulesEditor';
import { SeatTable } from '../components/SeatTable';
import { newId, playerName } from '../format';
import { href, navigate } from '../router';
import { dispatch, getState, useStore } from '../store';

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  const r = new Uint32Array(a.length);
  crypto.getRandomValues(r);
  for (let i = a.length - 1; i > 0; i--) {
    const j = (r[i] ?? 0) % (i + 1);
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

function randomSeat(): Seat {
  const r = new Uint32Array(1);
  crypto.getRandomValues(r);
  return ((r[0] ?? 0) % 4) as Seat;
}

/** Start from the seating of the most recent game, if any. */
function initialSeats(): (PlayerId | null)[] {
  const state = getState();
  const last = [...state.games].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!last) return [null, null, null, null];
  return last.seats.map((id) => (state.players.some((p) => p.id === id) ? id : null));
}

export function NewGame() {
  const { state } = useStore();
  const [seats, setSeats] = useState<(PlayerId | null)[]>(initialSeats);
  const [dealer, setDealer] = useState<Seat | null>(null);
  const [rules, setRules] = useState<Rules>(() => ({ ...state.defaultRules }));
  const [picking, setPicking] = useState<Seat | null>(null);
  const [showRules, setShowRules] = useState(false);

  const full = seats.every((s) => s !== null);
  const name = (id: PlayerId | null) => (id ? playerName(state, id) : '?');

  const assign = (seat: Seat, id: PlayerId) => {
    const next = [...seats];
    const other = next.indexOf(id);
    if (other !== -1 && other !== seat) next[other] = next[seat] ?? null;
    next[seat] = id;
    setSeats(next);
    setPicking(null);
  };

  const start = () => {
    if (!full || dealer === null) return;
    const id = newId();
    const ok = dispatch({
      type: 'createGame',
      id,
      seats: seats as SeatQuad<PlayerId>,
      firstDealer: dealer,
      rules,
      now: Date.now(),
    });
    if (ok) navigate({ name: 'game', id }, true);
  };

  return (
    <main class="page">
      <header class="topbar">
        <a class="icon-btn" href={href({ name: 'home' })} aria-label="Back to home">
          ‹
        </a>
        <h1>New game</h1>
        <span class="icon-btn" aria-hidden="true" />
      </header>

      <section class="card">
        <h2>1. Seat the players</h2>
        <p class="muted small">
          Tap a seat to choose who sits there. Play passes to the left (clockwise).
        </p>
        <SeatTable
          seats={seats}
          dealer={dealer}
          onSeat={(s) => {
            setPicking(s);
          }}
        />
        <div class="row wrap">
          <button
            type="button"
            class="btn"
            disabled={!full}
            onClick={() => {
              setSeats(shuffle(seats));
            }}
          >
            Shuffle seats
          </button>
          <button
            type="button"
            class="btn"
            onClick={() => {
              setSeats([null, null, null, null]);
              setDealer(null);
            }}
          >
            Clear
          </button>
        </div>
        {full && (
          <p class="teams-line">
            <span class="team-0-text">
              {name(seats[0] ?? null)} &amp; {name(seats[2] ?? null)}
            </span>{' '}
            vs{' '}
            <span class="team-1-text">
              {name(seats[1] ?? null)} &amp; {name(seats[3] ?? null)}
            </span>
          </p>
        )}
      </section>

      <section class="card">
        <h2>2. First dealer</h2>
        <div class="seg" role="radiogroup" aria-label="First dealer">
          {([0, 1, 2, 3] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={dealer === s}
              class={`seg-btn team-${s % 2}${dealer === s ? ' selected' : ''}`}
              disabled={seats[s] === null}
              onClick={() => {
                setDealer(s);
              }}
            >
              {name(seats[s] ?? null)}
            </button>
          ))}
        </div>
        <button
          type="button"
          class="btn"
          disabled={!full}
          onClick={() => {
            setDealer(randomSeat());
          }}
        >
          Pick at random
        </button>
      </section>

      <section class="card">
        <div class="row space">
          <h2>3. Rules</h2>
          <button
            type="button"
            class="btn btn-small"
            aria-expanded={showRules}
            onClick={() => {
              setShowRules(!showRules);
            }}
          >
            {showRules ? 'Done' : 'Change'}
          </button>
        </div>
        {showRules ? (
          <RulesEditor rules={rules} onChange={setRules} idPrefix="new" />
        ) : (
          <ul class="rules-summary">
            {describeRules(rules).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
      </section>

      <div class="sticky-bottom">
        <button
          type="button"
          class="btn btn-primary btn-big"
          disabled={!full || dealer === null}
          onClick={start}
        >
          {!full ? 'Seat 4 players' : dealer === null ? 'Choose the first dealer' : 'Start game'}
        </button>
      </div>

      <PlayerPicker
        open={picking !== null}
        title="Who sits here?"
        seated={seats.filter((s): s is PlayerId => s !== null)}
        onPick={(id) => {
          if (picking !== null) assign(picking, id);
        }}
        onClose={() => {
          setPicking(null);
        }}
      />
    </main>
  );
}
