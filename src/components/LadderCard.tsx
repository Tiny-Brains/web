// The ladder as a card: the switch in its head, the table under it, and a foot the
// page fills in. The home page and /leaderboard both draw THIS, so the two can never
// offer different ladders, put the switch in different places, or say a row
// differently. The page owns the request and the foot, because the two ask for
// different amounts.

import type { ReactNode } from 'react'
import type { Leaderboard, LeaderboardEntry, SeasonWeightClass } from '../api'
import type { Async } from '../lib/useApi'
import { cx } from '../lib/cx'
import { Card, CardFoot, CardHead, DataTable, type Column } from './ui'
import { LadderSwitch } from './LadderSwitch'
import { InlineError } from './ErrorStates'

export function LadderCard({
  title,
  classes,
  ladder,
  onLadder,
  board,
  columns,
  you,
  hideBaselines = false,
  loadingRows,
  empty,
  children,
}: {
  title: ReactNode
  classes: SeasonWeightClass[]
  ladder: string
  onLadder: (ladder: string) => void
  board: Async<Leaderboard>
  columns: Column<LeaderboardEntry>[]
  /** The reader's handle, so their own rows are marked. */
  you?: string
  /** Leave the platform's baselines out of the page. Ranks are the API's and are not renumbered:
   *  a competitor at #4 is at #4 whether or not the three above are shown. */
  hideBaselines?: boolean
  /** Pass the page size, so the loading table is the height of the loaded one. */
  loadingRows?: number
  empty: ReactNode
  /** The foot. */
  children: ReactNode
}) {
  const entries = board.data?.entries ?? []
  const rows = hideBaselines ? entries.filter((r) => !r.baseline) : entries
  const onlyBaselines = hideBaselines && entries.length > 0 && rows.length === 0

  return (
    <Card className="ladder-card">
      <CardHead title={title}>
        <LadderSwitch classes={classes} value={ladder} onChange={onLadder} />
      </CardHead>
      {board.state === 'error' ? (
        <InlineError error={board.error} what="The standings" />
      ) : (
        <DataTable
          state={board.state}
          columns={columns}
          loadingRows={loadingRows}
          rows={rows}
          rowKey={(r) => r.version_id}
          // A baseline row is stepped back so a competitor's #1 reads as #1; the tag beside the
          // owner says it in words, so the colour is never the only carrier.
          rowClass={(r) => cx(you && r.owner === you && 'you', r.baseline && 'baseline') || undefined}
          empty={onlyBaselines ? 'Every row on this page is a platform baseline, and they are hidden.' : empty}
        />
      )}
      <CardFoot>{children}</CardFoot>
    </Card>
  )
}
