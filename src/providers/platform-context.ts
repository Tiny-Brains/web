import { createContext, use } from 'react'
import type { ApiError, Game, GameSummary, Season, SeasonWeightClass } from '../api'

export type PlatformValue = {
  /** Every registered game, for the dropdown. */
  games: GameSummary[]
  gamesError: ApiError | null
  /** The selected game in full: its own copy, presets, limits and class caps. */
  game: Game | null
  gameLoading: boolean
  gameError: ApiError | null
  /** The selected game's display name, falling back to its slug. */
  gameName: string
  /** Every season of the selected game. */
  seasons: Season[]
  seasonsLoading: boolean
  /** The season the page is about: the one selected, else the live or latest one. */
  season: Season | null
  /** True when that season is the one taking submissions. */
  live: boolean
  /** The slug in force. */
  slug: string
  reload: () => void
}

export const PlatformContext = createContext<PlatformValue | null>(null)

export function usePlatform(): PlatformValue {
  const v = use(PlatformContext)
  if (!v) throw new Error('usePlatform outside PlatformProvider')
  return v
}

/** The classes this season is played under. THE SEASON OWNS THEM: a class result
 *  is comparable within its season and not across seasons, so a page that draws a
 *  cap takes it from here and never from a table of its own. */
export function useWeightClasses(): SeasonWeightClass[] {
  const { season, game } = usePlatform()
  return season?.weight_classes ?? game?.season?.weight_classes ?? []
}
