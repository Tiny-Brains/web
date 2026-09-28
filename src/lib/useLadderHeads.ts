// The head of every ladder in a season: its size and its first row, one small read each.
//
// The ladder tabs print each ladder's size and /leaderboard's podium counts each ladder it crowns,
// so both read this rather than each asking for the same thing.

import type { LeaderboardEntry, SeasonWeightClass } from '../api'
import { api } from '../api'
import { useApi } from './useApi'

export type LadderHead = { total: number; top: LeaderboardEntry | null }

export function useLadderHeads(game: string, season: string | null, classes: SeasonWeightClass[], priv: boolean, enabled = true) {
  const ladders = ['open', ...classes.map((c) => c.class)]
  const heads = useApi(
    `ladder-heads:${game}:${season ?? ''}:${priv}:${ladders.join(',')}`,
    () =>
      Promise.all(
        ladders.map(async (ladder) => {
          const b = await api.leaderboard(game, { ladder, season, limit: 1, priv })
          return [ladder, { total: b.total, top: b.entries[0] ?? null }] as const
        }),
      ),
    enabled && classes.length > 0,
  )
  return { state: heads.state, byLadder: new Map<string, LadderHead>(heads.data ?? []) }
}
