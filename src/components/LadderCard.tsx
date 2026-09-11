// The ladder as a card: the switch in its head, the table under it, and a foot the
// page fills in. The home page and /leaderboard both draw THIS, so the two can never
// offer different ladders, put the switch in different places, or say a row
// differently. The page owns the request and the foot, because the two ask for
// different amounts.

import type { ReactNode } from 'react'
import type { Leaderboard, LeaderboardEntry, SeasonWeightClass } from '../api'
import type { Async } from '../lib/useApi'
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
  /** Pass the page size, so the loading table is the height of the loaded one. */
  loadingRows?: number
  empty: ReactNode
  /** The foot. */
  children: ReactNode
}) {
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
          rows={board.data?.entries ?? []}
          rowKey={(r) => r.version_id}
          rowClass={(r) => (you && r.owner === you ? 'you' : undefined)}
          empty={empty}
        />
      )}
      <CardFoot>{children}</CardFoot>
    </Card>
  )
}
