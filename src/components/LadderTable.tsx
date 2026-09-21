// The ladder's columns, one definition for the home page's short table and /leaderboard's full
// one, and what an empty ladder says.

import type { ReactNode } from 'react'
import type { LeaderboardEntry, SeasonWeightClass } from '../api'
import { bytes, cap, num } from '../lib/format'
import { fill } from '../lib/copy'
import { Icon, type Column } from './ui'
import { ClassBadge, ModelLink, Owner, RatingSparkline, RatingValue, Trend } from './Model'
import { Rich } from './ui'
import common from '../../copy/common.json'

const L = common.ladder

export function ladderColumns({ you, compact = false }: { you?: string; compact?: boolean }): Column<LeaderboardEntry>[] {
  const rank: Column<LeaderboardEntry> = {
    key: 'rank',
    head: L.rank,
    className: 'rank',
    cell: (r) => <span className={r.rank <= 3 ? 'rank top' : undefined}>{r.rank}</span>,
  }
  const model: Column<LeaderboardEntry> = {
    key: 'model',
    head: L.model,
    cell: (r) => (
      <span className="who">
        <span>
          <ModelLink modelId={r.model_id} name={r.model} version={r.version} k={compact ? r.class : undefined} />
          {you && r.owner === you ? <span className="you-tag">{common.marks.you}</span> : null}
        </span>
        <small>
          <Owner handle={r.owner} baseline={r.baseline} />
        </small>
      </span>
    ),
  }
  const rating: Column<LeaderboardEntry> = {
    key: 'rating',
    head: L.rating,
    align: 'right',
    cell: (r) => (
      <>
        {compact ? null : <RatingSparkline history={r.history} k={r.class} />}
        <span className={compact ? undefined : 'lead'}>
          <RatingValue value={r.rating} provisional={r.provisional} />
        </span>
        {compact ? null : <Trend value={r.trend} />}
      </>
    ),
  }
  if (compact) return [rank, model, rating]
  return [
    rank,
    model,
    { key: 'class', head: L.class, wideOnly: true, cell: (r) => <ClassBadge k={r.class} /> },
    { key: 'size', head: L.size, align: 'right', wideOnly: true, cell: (r) => bytes(r.size_bytes) },
    { key: 'matches', head: <Icon id="i-matches" label={L.matches} />, align: 'right', wideOnly: true, className: 'muted', cell: (r) => num(r.matches) },
    rating,
  ]
}

export function ladderEmpty(ladder: string, classes: SeasonWeightClass[], live: boolean): ReactNode {
  const c = classes.find((x) => x.class === ladder)
  if (!live) return ladder === 'open' ? L.emptyClosedOpen : fill(L.emptyClosedClass, { class: ladder })
  if (!c) return <Rich text={L.emptyLive} />
  return <Rich text={L.emptyLiveClass} vars={{ class: ladder, cap: cap(c.max_bytes) }} />
}
