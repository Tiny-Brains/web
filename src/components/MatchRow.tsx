// Match rows: one layout for every match, whatever its seat count.
//
// Read left to right. The side column is a row header — when, where, how many played and any
// state worth reading — told apart by a tint and a divider. Then up to four players in finishing
// order, each with the same four things: place, score, model and owner. Then "+N more". A
// two-player match fills two of the four columns, so every row lines up. A narrow list keeps the
// order, shows two players, and puts the row header on top as a strip.
//
// A match is its scores: no sentence explaining an end reason, no turn, no ladder tag.

import { Link } from 'react-router-dom'
import { Fragment, type ReactNode } from 'react'
import type { MatchSeat, MatchSummary } from '../api'
import { ago, clock, dayLabel } from '../lib/format'
import { byPlace, isLive, placeWord } from '../lib/match'
import { cx } from '../lib/cx'
import { EmptyState, Icon, Skel } from './ui'
import { MatchBadge } from './Model'
import { fill } from '../lib/copy'
import common from '../../copy/common.json'

const R = common.matchRows

const SHOWN = 4

function Player({ seat, seats, live, you, index }: { seat: MatchSeat | undefined; seats: MatchSeat[]; live: boolean; you?: string; index: number }) {
  const c34 = index >= 2 ? 'c34' : undefined
  if (!seat) return <div className={cx('pl', c34)} />
  const mine = Boolean(seat.mine || (you && seat.owner === you))
  return (
    <div className={cx('pl', c34, !live && seat.rank === 1 && 'first')}>
      <span className="pl-top">
        <i>{live ? fill(R.seat, { n: seat.seat + 1 }) : placeWord(seat, seats)}</i>
        <b>{live || seat.score === null ? '—' : seat.score}</b>
      </span>
      <span className="pl-who">
        {seat.model} <span className="v">v{seat.version}</span> · {seat.baseline ? common.marks.baselineWord : `@${seat.owner}`}
        {mine ? <em> {R.you}</em> : null}
      </span>
    </div>
  )
}

function More({ count, size }: { count: number; size: 'full' | 'compact' }) {
  return (
    <div className={cx('pl more', size)}>
      {count > 0 ? (
        <>
          <span className="pl-top">
            <b>+{count}</b>
          </span>
          <span className="pl-who">{R.more}</span>
        </>
      ) : null}
    </div>
  )
}

/** When the row says it happened: the time in a list grouped by day, how long ago otherwise. */
function when(m: MatchSummary, grouped: boolean): string {
  if (isLive(m.status)) return R.now
  const at = m.status === 'pending' || m.status === 'cancelled' ? (m.created_at ?? m.played_at) : (m.played_at ?? m.created_at)
  return grouped ? clock(at) : ago(at)
}

export function MatchRow({ match: m, grouped = false, you }: { match: MatchSummary; grouped?: boolean; you?: string }) {
  const live = isLive(m.status)
  const seats = live ? [...m.seats].sort((a, b) => a.seat - b.seat) : byPlace(m.seats)
  const n = seats.length
  const said = live
    ? fill(R.labelLive, { n, map: m.map })
    : fill(R.label, {
        n,
        map: m.map,
        players: seats
          .slice(0, SHOWN)
          .map((p) => fill(R.labelPlayer, { place: placeWord(p, seats), model: p.model, score: p.score ?? R.noScore }))
          .join(', '),
      })
  return (
    <Link className="mrow" to={`/matches/${m.id}`} aria-label={said}>
      <div className="mwhen">
        <span className="mwhen-top">
          <time>{when(m, grouped)}</time>
          <MatchBadge status={m.status} />
          {m.is_trial ? (
            <span className="mark">
              <Icon id="i-flask" label={R.trialTip} />
              {R.trial}
            </span>
          ) : null}
        </span>
        <span className="mwhen-sub">
          <Icon id="i-seats" />
          {fill(R.sub, { n, map: m.map })}
        </span>
      </div>
      {Array.from({ length: SHOWN }, (_, i) => (
        <Player seat={seats[i]} seats={seats} live={live} you={you} index={i} key={i} />
      ))}
      <More count={n - Math.min(n, SHOWN)} size="full" />
      <More count={n - Math.min(n, 2)} size="compact" />
    </Link>
  )
}

function group(m: MatchSummary): string {
  if (isLive(m.status)) return R.groupLive
  if (m.status === 'pending') return R.groupQueued
  return dayLabel(m.played_at ?? m.created_at)
}

function RowSkeleton() {
  return (
    <div className="mrow" aria-hidden="true">
      <div className="mwhen">
        <Skel w={44} />
        <Skel w={96} />
      </div>
      {[0, 1].map((i) => (
        <div className="pl" style={{ paddingBlock: 12 }} key={i}>
          <span className="pl-top">
            <Skel w={70} />
          </span>
          <span className="pl-who">
            <Skel w={120} />
          </span>
        </div>
      ))}
    </div>
  )
}

/** The rows, their column labels and their day headings, in one component every list uses. */
export function MatchList({
  state,
  matches,
  empty,
  grouped = false,
  narrow = false,
  you,
  loadingRows = 3,
}: {
  state: 'loading' | 'ready' | 'error'
  matches: MatchSummary[]
  empty: ReactNode
  /** Headings for Live now, Queued and each day, with times in the rows. */
  grouped?: boolean
  /** Two players a row and the row header on top: a list in a half-width panel. */
  narrow?: boolean
  you?: string
  loadingRows?: number
}) {
  if (state === 'error') return <EmptyState>{R.error}</EmptyState>
  if (state === 'ready' && matches.length === 0) return <EmptyState>{empty}</EmptyState>
  const groups = matches.map(group)
  return (
    <div className={cx('mlist', narrow && 'narrow')} role={state === 'loading' ? 'status' : undefined} aria-label={state === 'loading' ? R.loading : undefined}>
      <div className="mhead" aria-hidden="true">
        <span>{R.headPlayed}</span>
        <span>{R.headPlayers}</span>
      </div>
      {state === 'loading'
        ? Array.from({ length: loadingRows }, (_, i) => <RowSkeleton key={i} />)
        : matches.map((m, i) => (
            <Fragment key={m.id}>
              {grouped && (i === 0 || groups[i] !== groups[i - 1]) ? <div className="mday">{groups[i]}</div> : null}
              <MatchRow match={m} grouped={grouped} you={you} />
            </Fragment>
          ))}
    </div>
  )
}
