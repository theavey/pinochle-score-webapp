import { draftBidSummary } from '../../../domain/draft';
import type { GameScore } from '../../../domain/scoring';
import { teamOf } from '../../../domain/seats';
import type { Game } from '../../../domain/types';
import { playerName, signed, teamName, total } from '../../format';
import { useStore } from '../../store';

interface Props {
  game: Game;
  score: GameScore;
  /** Game-over text from the scoresheet, if the game has ended. */
  banner: string | null;
  onClose: () => void;
}

/**
 * Big, glanceable score for everyone at the table. On a phone in landscape it
 * shows the totals and one info line; larger screens show both info lines.
 */
export function TableView({ game, score, banner, onClose }: Props) {
  const { state } = useStore();
  const target = game.rules.targetScore;
  const active = score.status === 'active';

  // Current bid, live from the hand being entered (not when fixing an old hand).
  const bid =
    active && !game.draft?.editingHandId && game.draft ? draftBidSummary(game.draft) : null;
  let bidLine: string | null = null;
  if (bid) {
    const who = playerName(state, game.seats[bid.bidder]);
    const detail = bid.thrownIn
      ? 'throwing in'
      : bid.need === null
        ? null
        : bid.need <= 0
          ? 'meld covers it'
          : `needs ${bid.need}`;
    bidLine = `${who} bid ${bid.bid}${bid.stuck ? ' (stuck)' : ''}${detail ? ` · ${detail}` : ''}`;
  }

  const last = score.results[score.results.length - 1];
  let lastLine: string | null = null;
  if (last) {
    const h = last.hand;
    const who = playerName(state, h.players[h.bidder]);
    const what =
      h.kind === 'thrownIn'
        ? `${who} threw in at ${h.bid}`
        : last.score.made
          ? `${who} made ${h.bid}`
          : `${who} was set at ${h.bid}`;
    lastLine = `Hand ${last.index + 1}: ${what}`;
  }

  return (
    <main class={`table-view${bidLine ? ' has-bid' : ''}`} aria-label="Table display">
      <header class="tv-top">
        <span class="tv-meta">
          {active ? `Hand ${game.hands.length + 1} · playing to ${target}` : `Played to ${target}`}
        </span>
        <button type="button" class="btn btn-small tv-close" onClick={onClose}>
          Scoresheet
        </button>
      </header>

      <section class="tv-teams" aria-label="Score">
        {([0, 1] as const).map((t) => {
          const pts = score.totals[t];
          const need = target - pts;
          return (
            <div key={t} class={`tv-team team-${t}${score.winner === t ? ' winner' : ''}`}>
              <div class="tv-name">{teamName(state, game.seats, t)}</div>
              <div class="tv-total" aria-label={`${total(pts)} points`}>
                {total(pts)}
              </div>
              <div class="progress" aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(100, (100 * pts) / target))}%` }} />
              </div>
              <div class="tv-need">
                {score.winner === t ? 'Winner' : need > 0 ? `${need} to go` : 'Over target'}
              </div>
            </div>
          );
        })}
      </section>

      <section class="tv-info" aria-live="polite">
        {banner && <p class="tv-line tv-banner">{banner}</p>}
        {bidLine && bid && (
          <p class={`tv-line tv-bid team-${teamOf(bid.bidder)}-text`}>{bidLine}</p>
        )}
        {lastLine && last && (
          <p class={`tv-line tv-last${last.score.made ? '' : ' tv-set'}`}>
            <span>{lastLine}</span>
            {' · '}
            <span class="tv-deltas">
              <span class="team-0-text">{signed(last.score.delta[0])}</span>
              {' / '}
              <span class="team-1-text">{signed(last.score.delta[1])}</span>
            </span>
          </p>
        )}
      </section>
    </main>
  );
}
