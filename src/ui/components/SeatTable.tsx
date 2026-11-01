import { biddingOrder, teamOf } from '../../domain/seats';
import type { PlayerId, Seat } from '../../domain/types';
import { playerName } from '../format';
import { useStore } from '../store';

interface Props {
  seats: (PlayerId | null)[];
  dealer: Seat | null;
  /** Highlight a seat (e.g. the bidder). */
  highlight?: Seat | null;
  onSeat?: (seat: Seat) => void;
  emptyLabel?: string;
}

const POS = ['bottom', 'left', 'top', 'right'] as const;

/**
 * Top-down view of the table. Seats go clockwise from the bottom, so the
 * player to a seat's left is the next one clockwise; partners sit across.
 */
export function SeatTable({ seats, dealer, highlight, onSeat, emptyLabel = 'Add player' }: Props) {
  const { state } = useStore();
  const firstBid = dealer === null ? null : biddingOrder(dealer)[0];
  return (
    <div class="table" role="group" aria-label="Table seating">
      <div class="felt" aria-hidden="true">
        <span>Partners sit across</span>
      </div>
      {([0, 1, 2, 3] as const).map((seat) => {
        const id = seats[seat];
        const label = id ? playerName(state, id) : emptyLabel;
        const tags = [
          seat === dealer ? 'dealer' : null,
          seat === firstBid ? 'bids first' : null,
        ].filter(Boolean);
        const content = (
          <>
            <span class="seat-name">{label}</span>
            {seat === dealer && <span class="chip chip-dealer">Dealer</span>}
          </>
        );
        const cls = `seat seat-${POS[seat]} team-${teamOf(seat)}${id ? '' : ' empty'}${
          highlight === seat ? ' highlighted' : ''
        }`;
        return onSeat ? (
          <button
            key={seat}
            type="button"
            class={cls}
            aria-label={`Seat ${POS[seat]}: ${label}${tags.length ? ` (${tags.join(', ')})` : ''}`}
            onClick={() => {
              onSeat(seat);
            }}
          >
            {content}
          </button>
        ) : (
          <div key={seat} class={cls}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
