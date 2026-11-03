import { useState } from 'preact/hooks';
import { draftBidSummary, emptyDraft, parseDraft, parseWhole } from '../../../domain/draft';
import { scoreHand } from '../../../domain/scoring';
import { biddingOrder, otherTeam, teamOf } from '../../../domain/seats';
import type { Game, HandDraft, Seat, Team } from '../../../domain/types';
import { ConfirmDialog, Dialog } from '../../components/Dialog';
import { NumberField } from '../../components/NumberField';
import { newId, playerName, signed, teamName } from '../../format';
import { dispatch, useStore } from '../../store';

interface Props {
  game: Game;
  nextDealer: Seat;
  handNumber: number;
}

export function HandForm({ game, nextDealer, handNumber }: Props) {
  const { state } = useStore();
  const rules = game.rules;
  const draft: HandDraft = game.draft ?? emptyDraft(nextDealer);
  const [attempted, setAttempted] = useState(false);
  const [pickDealer, setPickDealer] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editing = draft.editingHandId
    ? game.hands.findIndex((h) => h.id === draft.editingHandId)
    : -1;
  const players = editing >= 0 ? (game.hands[editing]?.players ?? game.seats) : game.seats;
  const pname = (s: Seat) => playerName(state, players[s]);
  const tname = (t: Team) => teamName(state, players, t);

  const update = (patch: Partial<HandDraft>) => {
    dispatch({ type: 'setDraft', gameId: game.id, draft: { ...draft, ...patch }, now: Date.now() });
  };
  const clear = () => {
    setAttempted(false);
    dispatch({ type: 'setDraft', gameId: game.id, draft: null, now: Date.now() });
  };

  const result = parseDraft(draft, rules, players);
  const errors = attempted && !result.ok ? result.errors : {};
  const preview = result.ok
    ? scoreHand({ ...result.hand, id: 'preview', createdAt: 0 }, rules)
    : null;

  const b = draft.bidder === null ? null : teamOf(draft.bidder);
  const d = b === null ? null : otherTeam(b);
  const bid = parseWhole(draft.bid);
  const need = draftBidSummary(draft)?.need ?? null;
  const defenderTricks = parseWhole(draft.defenderTricks);
  const tricksFor = (t: Team): number | null => {
    if (d === null || defenderTricks === null || defenderTricks > rules.trickTotal) return null;
    return t === d ? defenderTricks : rules.trickTotal - defenderTricks;
  };

  let tricksHint: string | undefined;
  if (need !== null) {
    if (need > rules.trickTotal) {
      tricksHint = `Bidders need ${need}, only ${rules.trickTotal} available${rules.allowThrowIn ? ' (consider throwing in)' : ''}`;
    } else if (need <= 0) {
      tricksHint = rules.meldNeedsTrick
        ? 'Meld covers the bid; bidders just need a trick'
        : 'Meld covers the bid';
    } else {
      tricksHint = `Bidders need ${need}: set if this is over ${rules.trickTotal - need}`;
    }
  }

  const save = () => {
    setAttempted(true);
    if (!result.ok) return;
    const handId = draft.editingHandId ?? newId();
    const ok = dispatch(
      { type: 'saveHand', gameId: game.id, handId, hand: result.hand, now: Date.now() },
      editing >= 0 ? `Hand ${editing + 1} updated` : `Hand ${handNumber} saved`,
    );
    if (ok) setAttempted(false);
  };

  const order = biddingOrder(draft.dealer);
  const title = editing >= 0 ? `Editing hand ${editing + 1}` : `Hand ${handNumber}`;

  return (
    <section
      class={`card hand-form${editing >= 0 ? ' editing' : ''}`}
      aria-labelledby="hand-title"
      id="hand-form"
    >
      <div class="row space">
        <h2 id="hand-title">{title}</h2>
        <button
          type="button"
          class="link-btn"
          onClick={() => {
            setPickDealer(true);
          }}
        >
          Dealer: <strong>{pname(draft.dealer)}</strong> ▾
        </button>
      </div>

      <fieldset class={`field${errors.bidder ? ' has-error' : ''}`}>
        <legend>Who took the bid?</legend>
        <div class="bidder-grid">
          {order.map((s) => (
            <button
              key={s}
              type="button"
              class={`bidder-btn team-${teamOf(s)}${draft.bidder === s ? ' selected' : ''}`}
              aria-pressed={draft.bidder === s}
              onClick={() => {
                update({ bidder: s, stuck: false });
              }}
            >
              {pname(s)}
              {s === draft.dealer && <small> dealer</small>}
            </button>
          ))}
        </div>
        {rules.stuckDealer && (
          <button
            type="button"
            class={`chip-btn${draft.stuck ? ' selected' : ''}`}
            aria-pressed={draft.stuck}
            onClick={() => {
              update({ bidder: draft.dealer, bid: String(rules.minBid), stuck: true });
            }}
          >
            Everyone passed: {pname(draft.dealer)} stuck at {rules.minBid}
          </button>
        )}
        {errors.bidder && <p class="field-error">{errors.bidder}</p>}
      </fieldset>

      <NumberField
        id="bid"
        label="Bid"
        value={draft.bid}
        start={rules.minBid}
        min={0}
        error={errors.bid}
        onChange={(v) => {
          update({ bid: v, stuck: draft.stuck && v === String(rules.minBid) });
        }}
      />

      <div class="grid-2">
        {([0, 1] as const).map((t) => (
          <NumberField
            key={t}
            id={`meld${t}`}
            label={`Meld: ${tname(t)}${b === t ? ' (bid)' : ''}`}
            value={draft.meld[t]}
            start={0}
            error={errors[t === 0 ? 'meld0' : 'meld1']}
            onChange={(v) => {
              const meld: [string, string] = [...draft.meld];
              meld[t] = v;
              update({ meld });
            }}
          />
        ))}
      </div>

      {rules.allowThrowIn && b !== null && (
        <label class="toggle">
          <input
            type="checkbox"
            checked={draft.thrownIn}
            onChange={(e) => {
              update({ thrownIn: e.currentTarget.checked });
            }}
          />
          <span>
            <strong>{pname(draft.bidder as Seat)} throws in</strong>
            <small>Concede without playing: bidding team loses {bid ?? 'the bid'}.</small>
          </span>
        </label>
      )}

      {!draft.thrownIn && b !== null && d !== null && (
        <>
          <NumberField
            id="tricks"
            label={`Trick points: ${tname(d)} (defending)`}
            value={draft.defenderTricks}
            start={0}
            max={rules.trickTotal}
            error={errors.tricks}
            hint={tricksHint}
            onChange={(v) => {
              update({ defenderTricks: v });
            }}
          />
          <p class="other-tricks">
            {tname(b)} (bid): <strong>{tricksFor(b) ?? '–'}</strong> trick points
          </p>
          {rules.meldNeedsTrick &&
            ([b, d] as const).map((t) =>
              tricksFor(t) === 0 && (parseWhole(draft.meld[t]) ?? 0) > 0 ? (
                <label class="toggle" key={t}>
                  <input
                    type="checkbox"
                    checked={draft.tookTrick[t]}
                    onChange={(e) => {
                      const took: [boolean, boolean] = [...draft.tookTrick];
                      took[t] = e.currentTarget.checked;
                      update({ tookTrick: took });
                    }}
                  />
                  <span>
                    <strong>{tname(t)} took a trick</strong>
                    <small>No counters, but a trick saves their meld.</small>
                  </span>
                </label>
              ) : null,
            )}
        </>
      )}

      {preview && (
        <div class={`preview${preview.made ? '' : ' set'}`} role="status">
          {([0, 1] as const).map((t) => (
            <div key={t} class={`preview-team team-${t}-text`}>
              <span>{tname(t)}</span>
              <strong>{signed(preview.delta[t])}</strong>
              {t === preview.bidderTeam && (
                <span class="tag">
                  {draft.thrownIn ? 'threw in' : preview.made ? 'made it' : 'SET'}
                </span>
              )}
              {!preview.meldCounted[t] &&
                (parseWhole(draft.meld[t]) ?? 0) > 0 &&
                !draft.thrownIn && <span class="tag">meld lost</span>}
            </div>
          ))}
        </div>
      )}

      <div class="row form-actions">
        {editing >= 0 ? (
          <>
            <button type="button" class="btn" onClick={clear}>
              Cancel edit
            </button>
            <button
              type="button"
              class="btn btn-danger-outline"
              onClick={() => {
                setConfirmDelete(true);
              }}
            >
              Delete
            </button>
          </>
        ) : (
          <button type="button" class="btn" onClick={clear} disabled={!game.draft}>
            Clear
          </button>
        )}
        <button type="button" class="btn btn-primary grow" onClick={save}>
          {editing >= 0 ? 'Save changes' : 'Save hand'}
        </button>
      </div>

      <Dialog
        open={pickDealer}
        title={`Who dealt hand ${editing >= 0 ? editing + 1 : handNumber}?`}
        onClose={() => {
          setPickDealer(false);
        }}
      >
        <p class="muted small">Use this for a misdeal or if the deal went out of turn.</p>
        <div class="bidder-grid">
          {([0, 1, 2, 3] as const).map((s) => (
            <button
              key={s}
              type="button"
              class={`bidder-btn team-${teamOf(s)}${draft.dealer === s ? ' selected' : ''}`}
              onClick={() => {
                update({ dealer: s });
                setPickDealer(false);
              }}
            >
              {pname(s)}
            </button>
          ))}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete hand ${editing + 1}?`}
        message="Later totals will be recalculated. You can undo right after."
        confirmLabel="Delete hand"
        danger
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          setConfirmDelete(false);
          if (draft.editingHandId) {
            dispatch(
              { type: 'deleteHand', gameId: game.id, handId: draft.editingHandId, now: Date.now() },
              `Hand ${editing + 1} deleted`,
            );
          }
        }}
      />
    </section>
  );
}
