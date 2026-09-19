// What Soma's season admin routes refuse with, said rather than coded. Two pages ask: /admin/seasons
// (moving a season's dates, its maps, its baselines) and /admin/seasons/new (creating one), and a
// refusal read two ways is a refusal one of them explains wrongly.

import { ApiError } from '../api'
import { num } from './format'

/** Creating a season, or moving a scheduled one's dates. */
export function seasonSaid(err: unknown): string {
  if (!(err instanceof ApiError)) return 'The season could not be saved.'
  switch (err.code) {
    case 'season_not_scheduled':
      return 'That season has opened since this page was loaded, so its window is no longer something to move: competitors are submitting to it.'
    case 'unknown_season':
      return 'That season is not there any more.'
    case 'name_required':
      return 'A season is named when it is created.'
    case 'season_name_unusable':
      return 'That name leaves no slug: use letters or digits, and not current, live, latest or new.'
    case 'season_slug_taken':
      return 'Another season of this game already has that slug. Pick another name.'
    case 'season_name_fixed':
      return 'A season’s name and slug cannot be changed.'
    case 'season_live':
      return 'A season is still live for this game. A game has at most one season taking submissions, so this one has to be closed first.'
    case 'no_engine':
      return 'This game has no active engine digest, so there is nothing to pin the season to. The cartridge has to be registered before a season can be created.'
    case 'inside_gap':
      return 'The opening date is inside the minimum gap after the previous season closed. Move it later.'
    case 'dates_required':
      return 'Both dates are required.'
    case 'admin_only':
      return 'This account does not administer seasons.'
    default:
      return err.message
  }
}

/** Why one map file was not taken, in a line. The server's code is kept beside it for a search. */
export function mapSaid(err: unknown): { code: string; said: string } {
  if (!(err instanceof ApiError)) return { code: 'unsent', said: 'It could not be sent.' }
  const d = (err.detail ?? {}) as Record<string, unknown>
  const existing = d.map_id ? String(d.map_id) : null
  const off = d.enabled === false ? ' It is off — switch it on instead.' : ''
  switch (err.code) {
    case 'map_bad_header':
      return { code: err.code, said: 'Not a map file: it needs an id and whole-number players, rows and cols.' }
    case 'map_outside_limits': {
      const h = (d.header ?? {}) as Record<string, number>
      const l = (d.limits ?? null) as { players?: number[]; sides?: number[]; cells_max?: number } | null
      const board = h.players ? `${h.players} seats, ${h.rows}×${h.cols}` : 'This board'
      return {
        code: err.code,
        said: l?.players
          ? `${board} is outside what this game allows: ${l.players[0]}–${l.players[1]} seats, sides ${l.sides?.[0]}–${l.sides?.[1]}, at most ${num(l.cells_max ?? 0)} cells.`
          : `${board} is outside what this game allows.`,
      }
    }
    case 'map_id_taken':
      return { code: err.code, said: `The season already has a map called ${existing ?? 'that'}.${off}` }
    case 'map_duplicate':
      return { code: err.code, said: `The season already has this board, as ${existing ?? 'another map'}.${off}` }
    case 'map_invalid':
      return { code: err.code, said: 'The engine refused it. `tinybrains maps check <file>` prints why.' }
    case 'engine_mismatch':
      return { code: err.code, said: 'This node runs a different engine from the season’s, so it cannot judge the board.' }
    case 'season_closed':
      return { code: err.code, said: 'The season has closed.' }
    case 'map_conflict':
      return { code: err.code, said: 'Something else got there first. Reload the list.' }
    case 'unknown_season':
      return { code: err.code, said: 'The season is gone.' }
    default:
      return { code: err.code, said: err.message }
  }
}

/** Why a baseline upload, or its switch, was refused (N29). */
export function baselineSaid(err: unknown): { code: string; said: string } {
  if (!(err instanceof ApiError)) return { code: 'unsent', said: 'It could not be sent.' }
  const d = (err.detail ?? {}) as Record<string, unknown>
  switch (err.code) {
    case 'baseline_name_unusable':
      return { code: err.code, said: 'That name leaves no slug: use 1 to 48 characters with letters or digits.' }
    case 'hashes_required':
      return { code: err.code, said: 'Both files are needed: model.onnx and manifest.json.' }
    case 'baseline_name_taken':
      return {
        code: err.code,
        said:
          d.status === 'testing'
            ? `${String(d.name ?? 'That baseline')} is already being admitted with other files. Wait for its verdict, or use another name.`
            : `This season already has ${String(d.name ?? 'a baseline by that name')}, and its model never changes within a season. Use another name.`,
      }
    case 'baseline_conflict':
      return { code: err.code, said: 'Another upload of that name got there first. Reload the list.' }
    case 'baseline_admitting':
      return { code: err.code, said: 'It is still being admitted; it can be switched on once admission passes it.' }
    case 'baseline_rejected':
      return { code: err.code, said: `Admission refused it (${String(err.detail ?? 'no reason')}). Upload it again under the same name.` }
    case 'unknown_baseline':
      return { code: err.code, said: 'There is no such baseline in this season.' }
    case 'season_closed':
      return { code: err.code, said: 'The season has closed.' }
    case 'unknown_season':
      return { code: err.code, said: 'The season is gone.' }
    default:
      return { code: err.code, said: err.message }
  }
}
