// One played match, in the two lengths the site draws it: the compact row a card
// holds, and the full-width row /matches lays out with its record beside the seats.
//
// THE WHOLE ROW OPENS THE MATCH, and the link is an overlay stretched across it
// rather than a wrapper: the model and owner links inside are real links too, and
// HTML will not nest one inside another.

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { MatchSummary } from '../api'
import { seatsLabel, whenSaid } from '../lib/match'
import { cx } from '../lib/cx'
import { Empty, Skel } from './ui'
import { Seats } from './Seats'

/** The same elements as a real row, so it is exactly as tall. Two seats, because
 *  that is what nearly every match has — a four-seat match is denser, not taller. */
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

function RowLink({ match }: { match: MatchSummary }) {
  return (
    <Link
      className="row-link"
      to={`/matches/${match.id}`}
      aria-label={`Open match: ${seatsLabel(match.seats)}`}
    />
  )
}

export function MatchRow({ match, extra }: { match: MatchSummary; extra?: string }) {
  const when = whenSaid(match)
  return (
    <div className="match-row">
      <RowLink match={match} />
      <div className="game-meta">
        <span>{match.preset}</span>
        {extra ? <span>{extra}</span> : null}
        <span className={cx('when', when.tone)}>{when.text}</span>
      </div>
      <Seats seats={match.seats} />
    </div>
  )
}

export function MatchRowWide({ match }: { match: MatchSummary }) {
  const when = whenSaid(match)
  return (
    <div className="match-row-wide">
      <RowLink match={match} />
      <div>
        <div className={cx('m-when', when.tone === 'counting' && 'counting')}>{when.text}</div>
        <div className="m-meta">
          <span className="r-tag">{match.preset}</span>
          {/* The ladders a match counted on are the server's answer, not a rule
              re-derived here: Jodi is what decides them. */}
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
      <Seats seats={match.seats} />
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
  loadingRows?: number
}) {
  if (state === 'error') return <Empty>Matches could not be loaded. The list is not empty — it is unread.</Empty>
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
