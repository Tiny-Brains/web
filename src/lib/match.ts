// Reading a match, in the shape the seat components draw.

import type { MatchSummary, Outcome, WeightClass } from '../api'
import { ago, num } from './format'

/** The fields a seat block needs. Both GET /v1/matches's `seats` and
 *  GET /v1/matches/{id}'s `players` already satisfy it, so neither is converted. */
export type Seat = {
  seat: number
  version_id: string
  model_id: string
  /** What the competitor called the model. A seat is labelled with this now: before an entry was
   *  a row of its own there was nothing to label it with but eight characters of a uuid. */
  model: string
  repo: string
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

/**
 * What came of a match, in words: the row's short form and the page's sentence.
 *
 * NOT A RULE. The referee ends a match for one of the cartridge's reasons and the ladder decides
 * each seat's outcome; both arrive on the row as codes, and a code is what the rows used to show
 * (`idle_food`, in a 10px pill) or omit. This only puts the two into English. A reason this
 * table does not know is still said -- by the outcomes alone -- rather than dropped, so a
 * cartridge that grows a reason degrades to "x won at turn n" and not to silence. The stalemate
 * length is the engine's number and is deliberately not written here.
 */
export function outcomeSaid(
  reason: string | null,
  turns: number | null,
  seats: { model: string; outcome: Outcome }[],
): { short: string; long: string } | null {
  const winner = seats.find((s) => s.outcome === 'win') ?? null
  const dq = seats.filter((s) => s.outcome === 'dq')
  const drawn = !winner && seats.some((s) => s.outcome === 'draw')
  if (!winner && !drawn && dq.length === 0 && !reason) return null

  const turn = turns === null ? null : `turn ${num(turns)}`
  const at = turn ? ` at ${turn}` : ''
  const who = winner ? `${winner.model} won` : drawn ? 'drawn' : null
  const why = REASONS[reason ?? ''] ?? null

  // A disqualification is the first thing to say, whatever ended the match.
  if (dq.length > 0) {
    const names = dq.map((s) => s.model).join(' and ')
    const short = [`${names} disqualified`, who, turn].filter(Boolean).join(' · ')
    const long = `${names} ${dq.length > 1 ? 'were' : 'was'} disqualified${at}${winner ? `, and ${winner.model} won` : ''}.`
    return { short, long }
  }

  const short = [who, why?.short, turn].filter(Boolean).join(' · ')
  const long = why ? why.long(winner?.model ?? null, drawn, at) : who ? `${cap(who)}${at}.` : `Ended${at}.`
  return short ? { short, long } : null
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** The cartridge's end reasons, as the book names them (games/ants/scoring), in a row's few words
 *  and a page's sentence. `long` takes the winner, whether it was drawn, and " at turn n". */
const REASONS: Record<string, { short: string; long: (winner: string | null, drawn: boolean, at: string) => string }> = {
  turn_limit: {
    short: 'on score at the turn limit',
    long: (w, d, at) =>
      w ? `${w} won on score when the turn limit fell${at}.` : d ? `Drawn on score at the turn limit${at}.` : `The turn limit fell${at}.`,
  },
  lone_survivor: {
    short: 'last colony standing',
    long: (w, _d, at) => (w ? `${w} won as the last colony standing${at}.` : `One colony was left standing${at}.`),
  },
  extermination: {
    short: 'both colonies wiped out',
    long: (w, d, at) =>
      w
        ? `${w} won on score after both colonies were wiped out${at}.`
        : d
          ? `Drawn: both colonies were wiped out${at}.`
          : `Both colonies were wiped out${at}.`,
  },
  rank_stabilized: {
    short: 'decisive lead',
    long: (w, _d, at) =>
      w ? `${w} won: the lead was decisive${at}, and the referee called it.` : `The lead was decisive${at}, and the referee called it.`,
  },
  domination: {
    short: 'held the board',
    long: (w, _d, at) =>
      w ? `${w} won by holding the board${at}, and the referee called it.` : `One colony held the board${at}, and the referee called it.`,
  },
  idle_food: {
    short: 'no food gathered',
    long: (w, d, at) =>
      w
        ? `${w} won on score after the food went ungathered${at}, when the referee called it.`
        : d
          ? `Drawn: nobody gathered food, and the referee called it${at}.`
          : `Nobody gathered food, and the referee called it${at}.`,
  },
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
