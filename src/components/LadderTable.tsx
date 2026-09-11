// The leaderboard's columns, shared by the home card and /leaderboard so the two
// can never disagree about what a row says.

import type { LeaderboardEntry } from '../api'
import { bytes, num } from '../lib/format'
import type { Column } from './ui'
import { ByOwner, ClassChip, ModelLink, RatingValue } from './Model'

export function ladderColumns({
  game,
  you,
  trend,
  compact = false,
  showClass = false,
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
}): Column<LeaderboardEntry>[] {
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
    // A baseline is not versioned by anyone; it changes only when the engine does.
    ...(compact
      ? []
      : [{ key: 'version', head: 'Version', cellClass: 'r-v', cell: (r: LeaderboardEntry) => (r.baseline ? '—' : `v${r.version}`) }]),
    ...(showClass ? [{ key: 'class', head: 'Class', cell: (r: LeaderboardEntry) => <ClassChip k={r.class} /> }] : []),
    ...(compact
      ? [{ key: 'played', head: 'Played', align: 'right' as const, cellClass: 'r-num muted', cell: (r: LeaderboardEntry) => num(r.matches) }]
      : []),
    { key: 'size', head: 'Size', align: 'right', cellClass: 'r-num', cell: (r) => bytes(r.size_bytes) },
    ...(compact
      ? []
      : [{ key: 'matches', head: 'Matches', align: 'right' as const, cellClass: 'r-num muted', cell: (r: LeaderboardEntry) => num(r.matches) }]),
    {
      key: 'rating',
      head: 'Rating',
      align: 'right',
      cellClass: 'r-rating',
      cell: (r) => <RatingValue value={r.rating} provisional={r.provisional} trend={trend ? r.trend : null} />,
    },
  ]
}
