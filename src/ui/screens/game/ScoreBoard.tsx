import type { GameScore } from '../../../domain/scoring';
import type { Game } from '../../../domain/types';
import { teamName, total } from '../../format';
import { useStore } from '../../store';

export function ScoreBoard({ game, score }: { game: Game; score: GameScore }) {
  const { state } = useStore();
  const target = game.rules.targetScore;
  return (
    <section class="scoreboard" aria-label="Score">
      {([0, 1] as const).map((t) => {
        const pts = score.totals[t];
        const need = target - pts;
        const pctDone = Math.max(0, Math.min(100, (100 * pts) / target));
        return (
          <div key={t} class={`team-score team-${t}${score.winner === t ? ' winner' : ''}`}>
            <div class="team-name">{teamName(state, game.seats, t)}</div>
            <div class="team-total" aria-label={`${total(pts)} points`}>
              {total(pts)}
            </div>
            <div
              class="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={target}
              aria-valuenow={Math.max(0, pts)}
            >
              <span style={{ width: `${pctDone}%` }} />
            </div>
            <div class="team-need">
              {score.winner === t ? 'Winner' : need > 0 ? `${need} to go` : 'Over target'}
            </div>
          </div>
        );
      })}
      <div class="target-line">Playing to {target}</div>
    </section>
  );
}
