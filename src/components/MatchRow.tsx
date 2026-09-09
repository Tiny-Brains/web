// One played match, in the two lengths the site draws it.
//
// MatchRow is the compact row a card holds -- the home page's recent matches, a
// version's history, a profile's matches. MatchRowWide is /matches, the one place
// a match is laid out at full width with its record beside the seats.
//
// THE WHOLE ROW OPENS THE MATCH, and the link is an overlay stretched across it
// rather than a wrapper: the model and owner links inside are real links too, and
// HTML will not nest one inside another.

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { MatchSummary } from '../api'
import { seatsLabel, toSeats, whenSaid } from '../lib/match'
import { Empty, Skel } from './ui'
import { Seats } from './Seats'

/**
 * A match row with nothing in it yet.
 *
 * The same elements as a real row, so it is exactly as tall: `.p-score` is
 * 40px/1.05 type, and a one-em skeleton inside it makes the same line box the
 * digit would. Two seats, because that is what nearly every match has -- a
 * four-seat match is denser, not taller.
 */
function MatchRowSkeleton({ wide }: { wide?: boolean }) {
  const seats = (
    <div className="players" style={{ '--n': 2 } as React.CSSProperties}>
      {[0, 1].map((i) => (
        <div className="player" key={i}>
          <span className="p-score">
            <Skel w={28} />
          </span>
          <span className="p-name">
            <Skel w={78} />
          </span>
          <span className="p-by">
            <Skel w={96} />
          </span>
        </div>
      ))}
    </div>
  )

  if (wide) {
    return (
      <div className="match-row-wide" aria-hidden="true">
        <div>
          <div className="m-when">
            <Skel w={64} />
          </div>
          <div className="m-meta">
            <Skel w={52} />
            <Skel w={40} />
          </div>
          <div className="m-id">
            <Skel w={128} />
          </div>
        </div>
        {seats}
      </div>
    )
  }

  return (
    <div className="match-row" aria-hidden="true">
      <div className="game-meta">
        <Skel w={46} />
        <span className="when">
          <Skel w={58} />
        </span>
      </div>
      {seats}
    </div>
  )
}

export function MatchRow({ match, extra }: { match: MatchSummary; extra?: string }) {
  const when = whenSaid(match)
  const seats = toSeats(match)
  return (
    <div className="match-row">
      <Link className="row-link" to={`/matches/${match.id}`} aria-label={`Open match: ${seatsLabel(seats)}`} />
      <div className="game-meta">
        <span>{match.preset}</span>
        {extra ? <span>{extra}</span> : null}
        <span className={when.tone ? `when ${when.tone}` : 'when'}>{when.text}</span>
      </div>
      <Seats seats={seats} />
    </div>
  )
}

export function MatchRowWide({ match }: { match: MatchSummary }) {
  const when = whenSaid(match)
  const seats = toSeats(match)
  return (
    <div className="match-row-wide">
      <Link className="row-link" to={`/matches/${match.id}`} aria-label={`Open match: ${seatsLabel(seats)}`} />
      <div>
        <div className={when.tone === 'counting' ? 'm-when counting' : 'm-when'}>{when.text}</div>
        <div className="m-meta">
          <span className="r-tag">{match.preset}</span>
          {/* The ladders a match counted on are the server's answer, not a rule
              re-derived here: a class ladder counts a match only when every seat is
              that class, and Jodi is what decides it. */}
          {match.ladders.map((l) => (
            <span className="r-tag" key={l}>
              {l}
            </span>
          ))}
          {match.is_trial ? <span className="r-tag">trial</span> : null}
        </div>
        <div className="m-id">
          {match.id.slice(0, 8)} · seed {match.seed}
        </div>
      </div>
      <Seats seats={seats} />
    </div>
  )
}

/** A list of matches with its three states, so no page writes them again. */
export function MatchList({
  state,
  matches,
  empty,
  wide,
  extraOf,
  loadingRows = 3,
}: {
  state: 'loading' | 'ready' | 'error'
  matches: MatchSummary[]
  empty: ReactNode
  wide?: boolean
  extraOf?: (m: MatchSummary) => string | undefined
  /** How many rows to hold space for while the list loads. */
  loadingRows?: number
}) {
  if (state === 'error') return <Empty>Matches could not be loaded. The list is not empty — it is unread.</Empty>
  // Placeholders shaped like rows, so the card is the height it will be.
  if (state === 'loading')
    return (
      <div role="status" aria-label="Loading matches">
        {Array.from({ length: loadingRows }, (_, i) => (
          <MatchRowSkeleton wide={wide} key={i} />
        ))}
      </div>
    )
  if (matches.length === 0) return <Empty>{empty}</Empty>
  return (
    <>
      {matches.map((m) =>
        wide ? <MatchRowWide match={m} key={m.id} /> : <MatchRow match={m} extra={extraOf?.(m)} key={m.id} />,
      )}
    </>
  )
}
