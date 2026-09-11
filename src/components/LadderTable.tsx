// The leaderboard's columns, shared by the home card and /leaderboard so the two
// can never disagree about what a row says.

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { LeaderboardEntry, SeasonWeightClass } from '../api'
import { cap, num } from '../lib/format'
import type { Column } from './ui'
import { ByOwner, ClassChip, ModelLink, RatingSparkline, RatingValue, SizeCell } from './Model'

export function ladderColumns({
  game,
  you,
  trend,
  compact = false,
  showClass = false,
  classes = [],
}: {
  /** The game the ladder belongs to: a model's permalink is built from it. */
  game: string
  you?: string
  /** Whether the last rating move is drawn. A closed season has nothing moving. */
  trend?: boolean
  /** The home card is narrow: the class travels as the model's square and the
   *  version number is left to the full leaderboard. */
  compact?: boolean
  showClass?: boolean
  /** The season's classes, for the cap each row's size is measured against. */
  classes?: SeasonWeightClass[]
}): Column<LeaderboardEntry>[] {
  const caps = new Map(classes.map((c) => [c.class, c.max_bytes]))
  return [
    {
      key: 'rank',
      head: '#',
      cellClass: 'r-rank',
      cell: (r) => <span className={r.rank <= 3 ? 'r-rank top' : undefined}>{r.rank}</span>,
    },
    {
      key: 'model',
      head: 'Model',
      wide: true,
      cell: (r) => (
        <div className="r-model">
          <ModelLink game={game} repo={r.repo} name={r.model} k={r.class} version={r.version} />
          <ByOwner handle={r.owner} baseline={r.baseline} you={you === r.owner} />
        </div>
      ),
    },
    ...(compact
      ? []
      : [{ key: 'version', head: 'Version', cellClass: 'r-v', cell: (r: LeaderboardEntry) => `v${r.version}` }]),
    ...(showClass ? [{ key: 'class', head: 'Class', cell: (r: LeaderboardEntry) => <ClassChip k={r.class} /> }] : []),
    ...(compact
      ? [{ key: 'played', head: 'Played', align: 'right' as const, cellClass: 'r-num muted', cell: (r: LeaderboardEntry) => num(r.matches) }]
      : []),
    {
      key: 'size',
      head: 'Size',
      align: 'right',
      cellClass: 'r-num',
      cell: (r) => <SizeCell size={r.size_bytes} k={r.class} limit={caps.get(r.class)} />,
    },
    ...(compact
      ? []
      : [{ key: 'matches', head: 'Matches', align: 'right' as const, cellClass: 'r-num muted', cell: (r: LeaderboardEntry) => num(r.matches) }]),
    {
      key: 'rating',
      head: 'Rating',
      align: 'right',
      cellClass: 'r-rating',
      cell: (r) => (
        <span className="r-rating-cell">
          {/* Not on the compact card: its rating column has no room, and the full ladder has. */}
          {trend && !compact ? <RatingSparkline history={r.history} k={r.class} /> : null}
          <RatingValue value={r.rating} provisional={r.provisional} trend={trend ? r.trend : null} />
        </span>
      ),
    },
  ]
}

/** An empty ladder as an invitation rather than a shrug: a class nobody has entered names its
 *  cap, which is the whole condition for entering it. A closed season's is a fact. */
export function ladderEmpty(ladder: string, classes: SeasonWeightClass[], live: boolean): ReactNode {
  const c = classes.find((x) => x.class === ladder)
  if (!live) return ladder === 'open' ? 'Nothing was rated in this season.' : `Nothing entered the ${ladder} class in this season.`
  if (!c)
    return (
      <>
        No version has been rated in this season yet. <Link to="/start">Be the first →</Link>
      </>
    )
  return (
    <>
      Nothing has been rated on {ladder} yet. Be the first: anything that measures {cap(c.max_bytes)} or
      less, model and adapter compressed, qualifies. <Link to="/start">Get started →</Link>
    </>
  )
}
