// Reading a match, in the shape the seat components draw.

import type { MatchSummary, Outcome, RatingChange, WeightClass } from '../api'
import { ago, ordinal } from './format'

/** How much a seat's rating moved. The rating is mu − 3σ, so the move is computed from both and
 *  never from mu alone: a seat can gain mu and still lose rating. Null before the first fold. */
export function ratingMove(c: RatingChange): number | null {
  if (c.mu_before === null || c.sigma_before === null) return null
  return c.mu_after - 3 * c.sigma_after - (c.mu_before - 3 * c.sigma_before)
}

/** The fields a seat block needs. Both GET /v1/matches's `seats` and
 *  GET /v1/matches/{id}'s `players` already satisfy it, so neither is converted. */
export type Seat = {
  seat: number
  version_id: string
  model_id: string
  /** What the competitor called the model. A seat is labelled with this now: before an entry was
   *  a row of its own there was nothing to label it with but eight characters of a uuid. */
  model: string
  version?: number | null
  model_version?: number | null
  owner: string | null
  baseline: boolean | null
  class: WeightClass | null
  score: number | null
  outcome: Outcome
}

/** What a screen reader is given for the row link covering a seats block. */
export function seatsLabel(seats: Seat[]): string {
  return seats.map((p) => `${p.model} ${p.score ?? 0}`).join(', ')
}

/** What a match is doing, where that is anything but rated: a key the row draws as an icon. */
export type MatchState = 'counting' | 'live' | 'queued' | 'cancelled' | 'failed'

/**
 * When it happened, and what state it is in.
 *
 * THE TIME IS THE ONLY WORD. A row used to print "counting the rating change…" or "cancelled 2m
 * ago" where the time goes; the state is now an icon beside the time, named by its tooltip, and a
 * rated match -- nearly every row -- has no state and no icon.
 */
export function matchWhen(m: MatchSummary): { text: string; state: MatchState | null } {
  switch (m.status) {
    case 'finished':
      return { text: ago(m.played_at), state: 'counting' }
    case 'cancelled':
      return { text: ago(m.played_at ?? m.created_at), state: 'cancelled' }
    case 'failed':
      return { text: ago(m.played_at ?? m.created_at), state: 'failed' }
    case 'pending':
      return { text: ago(m.created_at), state: 'queued' }
    case 'claimed':
    case 'running':
      return { text: 'now', state: 'live' }
    default:
      return { text: ago(m.played_at), state: null }
  }
}

/** A seat's place in words: "1st", "=1st" when shared, "DQ" when disqualified, "—" before a result. */
export function placeWord(p: { rank: number | null; outcome: Outcome }, seats: { rank: number | null }[]): string {
  if (p.outcome === 'dq') return 'DQ'
  if (p.rank === null) return '—'
  const shared = seats.filter((x) => x.rank === p.rank).length > 1
  return `${shared ? '=' : ''}${ordinal(p.rank)}`
}

/** Finishing order: best place first, a disqualified or unplaced seat last, seat number breaking ties. */
export function byPlace<T extends { seat: number; rank: number | null; outcome: Outcome }>(seats: T[]): T[] {
  const key = (p: T) => (p.outcome === 'dq' ? 99 : (p.rank ?? 50))
  return [...seats].sort((a, b) => key(a) - key(b) || a.seat - b.seat)
}

/** Whether a match is being played right now. */
export function isLive(status: MatchSummary['status']): boolean {
  return status === 'claimed' || status === 'running'
}
