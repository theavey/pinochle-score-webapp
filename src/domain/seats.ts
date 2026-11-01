import type { Seat, Team, SeatQuad, PlayerId, TeamPair } from './types';

export const SEATS: readonly Seat[] = [0, 1, 2, 3];
export const TEAMS: readonly Team[] = [0, 1];

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function otherTeam(team: Team): Team {
  return (1 - team) as Team;
}

export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

/** The next seat clockwise (to the left), which is where the deal and bidding pass. */
export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function isSeat(n: unknown): n is Seat {
  return n === 0 || n === 1 || n === 2 || n === 3;
}

/** Seats of a team in table order. */
export function seatsOfTeam(team: Team): [Seat, Seat] {
  return team === 0 ? [0, 2] : [1, 3];
}

/** Player ids on a team, given a seating. */
export function teamPlayers(seats: SeatQuad<PlayerId>, team: Team): [PlayerId, PlayerId] {
  const [a, b] = seatsOfTeam(team);
  return [seats[a], seats[b]];
}

/** Bidding order for a hand: starts left of the dealer, dealer bids last. */
export function biddingOrder(dealer: Seat): SeatQuad<Seat> {
  const first = nextSeat(dealer);
  return [first, nextSeat(first), nextSeat(nextSeat(first)), dealer];
}

export function pair<T>(f: (t: Team) => T): TeamPair<T> {
  return [f(0), f(1)];
}
