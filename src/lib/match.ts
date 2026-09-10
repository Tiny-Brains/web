// Reading a match, in the shape the seat components draw.

import type { MatchSummary, Outcome, WeightClass } from '../api'
import { ago } from './format'

/** The fields a seat block needs. Both GET /v1/matches's `seats` and
 *  GET /v1/matches/{id}'s `players` already satisfy it, so neither is converted. */
export type Seat = {
  seat: number
  model_id: string
  owner: string | null
  baseline: boolean | null
  class: WeightClass | null
  score: number | null
  outcome: Outcome
}

/** What a screen reader is given for the row link covering a seats block. */
export function seatsLabel(seats: Seat[]): string {
  return seats.map((p) => `${p.model_id.slice(0, 8)} ${p.score ?? 0}`).join(', ')
}

/**
 * When it happened — which, for a match, is also what state it is in.
 *
 * A FINISHED match is the one case where the time is replaced rather than
 * annotated: the result is already final and only the ladder has not caught up.
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
