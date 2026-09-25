// A MATCH AS A CARD: the unit a match is picked by, in the /matches grid, the watch page's rail,
// a model's and a person's matches and a ladder row opened inline. A match has two layouts, this
// card and MatchRow's row (the list view and dense tables).
//
// The picture is the viewer's Tile, resting on the match's last frame, and its overlay (names,
// scores, the turn) is the viewer's too. The card adds what the Tile does not say: how many seats,
// the comment count or the upset, then the title, the owners, the board, the time and a state.

import { Link } from 'react-router-dom'
import type { MatchSummary } from '../api'
import { labelsOf } from '../lib/viz'
import { byPlace, matchWhen } from '../lib/match'
import { cx } from '../lib/cx'
import { count, fill } from '../lib/copy'
import { Icon } from './ui'
import { MatchBadge } from './Model'
import { MatchTile } from './Viewer'
import common from '../../copy/common.json'

const T = common.card

export function MatchCard({
  m,
  chip = 'comments',
  layout = 'card',
  className,
  onOpen,
}: {
  m: MatchSummary
  /** What the picture's corner says beside the seat count: the thread's size, or the upset. */
  chip?: 'comments' | 'upset' | null
  /** `row`: the Tile beside the words, as the watch page's rail draws it. */
  layout?: 'card' | 'row'
  className?: string
  /** Called as the card is followed, for the watch counter's `via`. */
  onOpen?: () => void
}) {
  const placed = byPlace(m.seats)
  const queued = m.status === 'pending' || m.status === 'claimed' || m.status === 'running'
  const when = matchWhen(m)
  const owners = [...new Set(placed.slice(0, 2).map((s) => s.owner))]
  const upset = chip === 'upset' && m.upset !== null && m.upset > 0 ? m.upset : null
  return (
    <Link className={cx('mcard', layout === 'row' && 'row', className)} to={`/matches/${m.id}`} onClick={onOpen}>
      <div className="mcard-pic">
        <MatchTile
          id={m.id}
          game={m.game}
          season={m.season}
          map={m.map}
          hasFrame={m.frame}
          labels={labelsOf(m.seats)}
          preview={!queued}
        />
        <span className="mcard-chip seats" title={count(T.seats, m.seats.length)}>
          <Icon id="i-seats" />
          {m.seats.length}
          {upset !== null ? (
            <span className="mcard-swing" title={T.upset}>
              <Icon id="i-swing" />
              {fill(T.upsetValue, { n: upset.toFixed(2) })}
            </span>
          ) : chip === 'comments' && m.comments > 0 ? (
            <span title={count(T.comments, m.comments)}>
              <Icon id="i-comment" />
              {m.comments}
            </span>
          ) : null}
        </span>
      </div>
      <div className="mcard-words">
        <div className="mcard-title">
          {placed.length === 2 ? (
            <>
              {placed[0].model} <span className="v">{fill(T.version, { v: placed[0].version })}</span>
              <span className="vs">{T.vs}</span>
              {placed[1].model} <span className="v">{fill(T.version, { v: placed[1].version })}</span>
            </>
          ) : placed.length ? (
            <>
              {placed[0].model} <span className="v">{fill(T.version, { v: placed[0].version })}</span>
              <span className="vs">{count(T.andMore, placed.length - 1)}</span>
            </>
          ) : null}
        </div>
        <div className="mcard-meta">
          <span>{owners.map((o) => fill(T.owner, { handle: o })).join(' · ')}</span>
          <span aria-hidden="true">·</span>
          <span>{m.map}</span>
          <span aria-hidden="true">·</span>
          <span>{when.text}</span>
          {m.is_trial ? <span className="badge">{T.trial}</span> : null}
          <MatchBadge status={m.status} />
        </div>
      </div>
    </Link>
  )
}

/** A grid of cards: five across at 1800px, two on a phone. A placeholder is the same grid. */
export function CardGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx('cards', className)}>{children}</div>
}

export function CardSkeletons({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div className="mcard" aria-hidden="true" key={i}>
          <div className="tile-box skel" />
          <div className="skel mcard-skel-line" />
          <div className="skel mcard-skel-line short" />
        </div>
      ))}
    </>
  )
}
