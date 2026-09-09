// Reading a match, in the one shape the components draw.
//
// GET /v1/matches and GET /v1/matches/{id} do not agree on every field name --
// the list calls a seat's version `version`, the detail calls it `model_version`
// -- so the seat components take neither shape and these map onto the one they do
// take. It is also where "what does this row say about when" is decided, once,
// because the answer is really about state rather than time.

import type { MatchPlayer, MatchSeat, MatchSummary, Outcome, WeightClass } from '../api'
import { ago } from './format'

export type Seat = {
  seat: number
  model_id: string
  owner: string | null
  baseline: boolean | null
  class: WeightClass | null
  score: number | null
  outcome: Outcome
}

export function seatOf(s: MatchSeat): Seat {
  return {
    seat: s.seat,
    model_id: s.model_id,
    owner: s.owner,
    baseline: s.baseline,
    class: s.class,
    score: s.score,
    outcome: s.outcome,
  }
}

export function playerSeat(p: MatchPlayer): Seat {
  return {
    seat: p.seat,
    model_id: p.model_id,
    owner: p.owner,
    baseline: p.baseline,
    class: p.class,
    score: p.score,
    outcome: p.outcome,
  }
}

export function toSeats(m: MatchSummary): Seat[] {
  return m.seats.map(seatOf)
}

/** What a screen reader is given for the row link that covers a seats block. */
export function seatsLabel(seats: Seat[]): string {
  return seats.map((p) => `${p.model_id.slice(0, 8)} ${p.score ?? 0}`).join(', ')
}

/**
 * When it happened -- which, for a match, is also what state it is in.
 *
 * A FINISHED match is the one case where the time is replaced rather than
 * annotated: "counting the rating change…" is the fact worth reading, because the
 * result is already final and only the ladder has not caught up.
 */
export function whenSaid(m: MatchSummary): { text: string; tone: '' | 'counting' | 'bad' } {
  switch (m.status) {
    case 'finished':
      return { text: 'counting the rating change…', tone: 'counting' }
    case 'cancelled':
      return { text: `cancelled ${ago(m.played_at ?? m.created_at)}`, tone: 'bad' }
    case 'failed':
      return { text: `failed ${ago(m.played_at ?? m.created_at)}`, tone: 'bad' }
    case 'pending':
      return { text: 'queued', tone: '' }
    case 'claimed':
    case 'running':
      return { text: 'playing now', tone: 'counting' }
    default:
      return { text: ago(m.played_at), tone: '' }
  }
}
