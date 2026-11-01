import { useState } from 'preact/hooks';
import type { GameScore } from '../../../domain/scoring';
import type { Game, Rules, Seat } from '../../../domain/types';
import { ConfirmDialog, Dialog } from '../../components/Dialog';
import { PlayerPicker } from '../../components/PlayerPicker';
import { RulesEditor } from '../../components/RulesEditor';
import { SeatTable } from '../../components/SeatTable';
import { navigate } from '../../router';
import { dispatch, useStore } from '../../store';

type Panel = null | 'menu' | 'rules' | 'seats' | 'call' | 'abandon' | 'delete';

export function GameMenu({ game, score }: { game: Game; score: GameScore }) {
  const { state } = useStore();
  const [panel, setPanel] = useState<Panel>(null);
  const [rules, setRules] = useState<Rules>(game.rules);
  const [seatToFill, setSeatToFill] = useState<Seat | null>(null);
  const close = () => {
    setPanel(null);
  };
  const active = score.status === 'active';

  return (
    <>
      <button
        type="button"
        class="icon-btn"
        aria-label="Game menu"
        onClick={() => {
          setPanel('menu');
        }}
      >
        ⋯
      </button>

      <Dialog open={panel === 'menu'} title="Game options" onClose={close}>
        <div class="menu">
          <button
            type="button"
            class="btn"
            onClick={() => {
              setRules(game.rules);
              setPanel('rules');
            }}
          >
            Target score &amp; rules
          </button>
          <button
            type="button"
            class="btn"
            onClick={() => {
              setPanel('seats');
            }}
          >
            Change seats / substitute
          </button>
          <label class="toggle">
            <input
              type="checkbox"
              checked={state.settings.keepAwake}
              onChange={(e) => {
                dispatch({ type: 'setSettings', settings: { keepAwake: e.currentTarget.checked } });
              }}
            />
            <span>
              <strong>Keep screen awake</strong>
              <small>While a game is open (if the device allows it).</small>
            </span>
          </label>
          {active ? (
            <>
              <button
                type="button"
                class="btn"
                onClick={() => {
                  setPanel('call');
                }}
              >
                End game now (leader wins)
              </button>
              <button
                type="button"
                class="btn"
                onClick={() => {
                  setPanel('abandon');
                }}
              >
                Abandon game (no result)
              </button>
            </>
          ) : (
            game.endedEarly && (
              <button
                type="button"
                class="btn"
                onClick={() => {
                  dispatch(
                    { type: 'reopenGame', gameId: game.id, now: Date.now() },
                    'Game reopened',
                  );
                  close();
                }}
              >
                Reopen game
              </button>
            )
          )}
          <button
            type="button"
            class="btn btn-danger-outline"
            onClick={() => {
              setPanel('delete');
            }}
          >
            Delete game
          </button>
        </div>
      </Dialog>

      <Dialog
        open={panel === 'rules'}
        title="Rules for this game"
        onClose={close}
        actions={
          <>
            <button type="button" class="btn" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => {
                dispatch(
                  { type: 'setGameRules', gameId: game.id, rules, now: Date.now() },
                  'Rules updated; scores recalculated',
                );
                close();
              }}
            >
              Apply
            </button>
          </>
        }
      >
        <p class="muted small">Changes apply to every hand in this game, including past ones.</p>
        <RulesEditor rules={rules} onChange={setRules} idPrefix="game" />
      </Dialog>

      <Dialog open={panel === 'seats' && seatToFill === null} title="Seats" onClose={close}>
        <p class="muted small">
          Tap a seat to substitute a player or swap two players. Hands already played keep who
          actually played them.
        </p>
        <SeatTable
          seats={game.seats}
          dealer={score.nextDealer}
          onSeat={(s) => {
            setSeatToFill(s);
          }}
        />
      </Dialog>

      <PlayerPicker
        open={seatToFill !== null}
        title="Who sits here now?"
        seated={game.seats}
        onPick={(id) => {
          if (seatToFill !== null) {
            dispatch(
              { type: 'setSeat', gameId: game.id, seat: seatToFill, playerId: id, now: Date.now() },
              'Seating changed',
            );
          }
          setSeatToFill(null);
        }}
        onClose={() => {
          setSeatToFill(null);
        }}
      />

      <ConfirmDialog
        open={panel === 'call'}
        title="End the game now?"
        message={
          score.totals[0] === score.totals[1]
            ? 'The score is tied, so it will be recorded as a tie.'
            : 'The team that is ahead will be recorded as the winner. You can reopen it later.'
        }
        confirmLabel="End game"
        onCancel={close}
        onConfirm={() => {
          dispatch(
            { type: 'endGame', gameId: game.id, kind: 'called', now: Date.now() },
            'Game ended',
          );
          close();
        }}
      />
      <ConfirmDialog
        open={panel === 'abandon'}
        title="Abandon this game?"
        message="It stays in history without a winner and is left out of win/loss stats."
        confirmLabel="Abandon"
        onCancel={close}
        onConfirm={() => {
          dispatch(
            { type: 'endGame', gameId: game.id, kind: 'abandoned', now: Date.now() },
            'Game abandoned',
          );
          close();
        }}
      />
      <ConfirmDialog
        open={panel === 'delete'}
        title="Delete this game?"
        message="It will be removed from history and stats. You can undo right after."
        confirmLabel="Delete game"
        danger
        onCancel={close}
        onConfirm={() => {
          close();
          navigate({ name: 'home' }, true);
          dispatch({ type: 'deleteGame', gameId: game.id }, 'Game deleted');
        }}
      />
    </>
  );
}
