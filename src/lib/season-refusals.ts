// What Soma's season admin routes refuse with, said rather than coded. Two pages ask: /admin/seasons
// (moving a season's dates, its maps, its baselines) and /admin/seasons/new (creating one), and a
// refusal read two ways is a refusal one of them explains wrongly.

import { ApiError } from '../api'
import { num } from './format'
import { fill, lookup } from './copy'
import T from '../../copy/admin-seasons.json'

const R = T.refusals

/** Creating a season, or moving a scheduled one's dates. */
export function seasonSaid(err: unknown): string {
  if (!(err instanceof ApiError)) return R.season.fallback
  return lookup(R.season.said, err.code) ?? err.message
}

/** Why one map file was not taken, in a line. The server's code is kept beside it for a search. */
export function mapSaid(err: unknown): { code: string; said: string } {
  if (!(err instanceof ApiError)) return { code: 'unsent', said: R.unsent }
  const d = (err.detail ?? {}) as Record<string, unknown>
  const existing = d.map_id ? String(d.map_id) : null
  const off = d.enabled === false ? R.map.off : ''
  switch (err.code) {
    case 'map_outside_limits': {
      const h = (d.header ?? {}) as Record<string, number>
      const l = (d.limits ?? null) as { players?: number[]; sides?: number[]; cells_max?: number } | null
      const board = h.players ? fill(R.map.board, { players: h.players, rows: String(h.rows), cols: String(h.cols) }) : R.map.thisBoard
      return {
        code: err.code,
        said: l?.players
          ? fill(R.map.outsideLimits, {
              board,
              minPlayers: String(l.players[0]),
              maxPlayers: String(l.players[1]),
              minSide: String(l.sides?.[0]),
              maxSide: String(l.sides?.[1]),
              cells: num(l.cells_max ?? 0),
            })
          : fill(R.map.outside, { board }),
      }
    }
    case 'map_id_taken':
      return { code: err.code, said: existing !== null ? fill(R.map.idTaken, { map: existing, off }) : fill(R.map.idTakenUnnamed, { off }) }
    case 'map_duplicate':
      return { code: err.code, said: existing !== null ? fill(R.map.duplicate, { map: existing, off }) : fill(R.map.duplicateUnnamed, { off }) }
    default:
      return { code: err.code, said: lookup(R.map.said, err.code) ?? err.message }
  }
}

/** Why a baseline upload, or its switch, was refused. */
export function baselineSaid(err: unknown): { code: string; said: string } {
  if (!(err instanceof ApiError)) return { code: 'unsent', said: R.unsent }
  const d = (err.detail ?? {}) as Record<string, unknown>
  switch (err.code) {
    case 'baseline_name_taken':
      return {
        code: err.code,
        said:
          d.status === 'testing'
            ? d.name != null
              ? fill(R.baseline.nameTesting, { name: String(d.name) })
              : R.baseline.nameTestingUnnamed
            : d.name != null
              ? fill(R.baseline.nameTaken, { name: String(d.name) })
              : R.baseline.nameTakenUnnamed,
      }
    case 'baseline_rejected':
      return {
        code: err.code,
        said: err.detail != null ? fill(R.baseline.rejected, { reason: String(err.detail) }) : R.baseline.rejectedNoReason,
      }
    default:
      return { code: err.code, said: lookup(R.baseline.said, err.code) ?? err.message }
  }
}
