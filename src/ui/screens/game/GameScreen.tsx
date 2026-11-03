import { useState } from 'preact/hooks';
import { scoreGame } from '../../../domain/scoring';
import { teamName, total } from '../../format';
import { href } from '../../router';
import { useStore } from '../../store';
import { useMediaQuery } from '../../useMediaQuery';
import { useWakeLock } from '../../useWakeLock';
import { GameMenu } from './GameMenu';
import { HandForm } from './HandForm';
import { HandList } from './HandList';
import { ScoreBoard } from './ScoreBoard';
import { TableView } from './TableView';

/** A phone turned sideways (short landscape screen, touch). Not an iPad, which has room to enter hands. */
const PHONE_LANDSCAPE = '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)';

export function GameScreen({ id }: { id: string }) {
  const { state } = useStore();
  const game = state.games.find((g) => g.id === id);
  const score = game ? scoreGame(game) : null;
  useWakeLock(state.settings.keepAwake && score?.status === 'active');

  // Table display: opened with the button, or automatically on a phone turned
  // sideways. Closing it in landscape keeps it closed until the next rotation,
  // so hands can still be entered sideways.
  const [tableOpen, setTableOpen] = useState(false);
  const [autoDismissed, setAutoDismissed] = useState(false);
  const phoneLandscape = useMediaQuery(PHONE_LANDSCAPE, (sideways) => {
    if (!sideways) setAutoDismissed(false);
  });
  const showTable = tableOpen || (phoneLandscape && !autoDismissed);

  if (!game || !score) {
    return (
      <main class="page">
        <p>That game isn’t on this device.</p>
        <a class="btn" href={href({ name: 'home' })}>
          Home
        </a>
      </main>
    );
  }

  const editing = game.draft?.editingHandId != null;
  const showForm = score.status === 'active' || editing;

  let banner: string | null = null;
  if (score.status !== 'active') {
    const w = score.winner;
    const result = `${total(score.totals[0])}–${total(score.totals[1])}`;
    banner =
      score.status === 'abandoned'
        ? `Game abandoned at ${result}`
        : w === null
          ? `Game ended in a tie, ${result}`
          : `${teamName(state, game.seats, w)} win${score.status === 'called' ? ' (called)' : ''}, ${total(score.totals[w])}–${total(score.totals[w === 0 ? 1 : 0])}`;
  }

  if (showTable) {
    return (
      <TableView
        game={game}
        score={score}
        banner={banner}
        onClose={() => {
          setTableOpen(false);
          if (phoneLandscape) setAutoDismissed(true);
        }}
      />
    );
  }

  return (
    <main class="page game-page">
      <header class="topbar">
        <a class="icon-btn" href={href({ name: 'home' })} aria-label="Back to home">
          ‹
        </a>
        <h1>{score.status === 'active' ? 'Scoresheet' : 'Final score'}</h1>
        <div class="topbar-actions">
          <button
            type="button"
            class="btn btn-small"
            onClick={() => {
              setTableOpen(true);
            }}
          >
            Show table
          </button>
          <GameMenu game={game} score={score} />
        </div>
      </header>

      <ScoreBoard game={game} score={score} />

      {banner && (
        <div
          class={`result-banner${score.winner === null ? '' : ` team-${score.winner}`}`}
          role="status"
        >
          <strong>{banner}</strong>
          <div class="row wrap center-row">
            <a class="btn btn-primary" href={href({ name: 'new' })}>
              New game
            </a>
            <a class="btn" href={href({ name: 'history' })}>
              History
            </a>
          </div>
        </div>
      )}

      <div class="game-columns">
        <div>
          {showForm && (
            <HandForm
              game={game}
              nextDealer={score.nextDealer}
              handNumber={game.hands.length + 1}
            />
          )}
        </div>
        <div>
          <HandList game={game} score={score} />
        </div>
      </div>
    </main>
  );
}
