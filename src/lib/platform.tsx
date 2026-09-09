// The selected game and its seasons, resolved once.
//
// The shell needs the game list on every route, the three selector pages need the
// season list, and five pages need the season's weight classes. Fetching that per
// page would make the strip flicker on every navigation and would let two
// components on one page disagree about which season is live, so it is held here
// and read with usePlatform().
//
// A SEASON HAS TO BE RESOLVED, not just read: the query string carries a number
// only when it is not the default, so "no season parameter" means "whichever one
// is live" -- and in a game between seasons, the most recent one.

import { useMemo, type ReactNode } from 'react'
import { api } from '../api'
import { useApi } from './useApi'
import { useSelection } from './selection'
import { PlatformContext, type PlatformValue } from './platform-context'

export function PlatformProvider({ children }: { children: ReactNode }) {
  const { game: slug, season: wanted } = useSelection()

  const games = useApi('games', () => api.games())
  const game = useApi(`game:${slug}`, () => api.game(slug))
  const seasons = useApi(`seasons:${slug}`, () => api.seasons(slug))

  const gameData = game.data
  const gameError = game.error
  const gameState = game.state
  const gameReload = game.reload
  const seasonData = seasons.data
  const seasonState = seasons.state
  const seasonReload = seasons.reload

  const value = useMemo<PlatformValue>(() => {
    const list = seasonData ?? []
    // The live season first, then the highest number -- the same order Soma's own
    // `ORDER BY (closed_at IS NULL) DESC, number DESC` picks with, so the strip
    // and the routes that default a season agree about which one it is.
    const current =
      list.find((s) => s.closed_at === null) ??
      [...list].sort((a, b) => b.number - a.number)[0] ??
      gameData?.season ??
      null
    const resolved = wanted === null ? current : (list.find((s) => s.number === wanted) ?? null)

    return {
      games: games.data ?? [],
      gamesError: games.error,
      game: gameData,
      gameLoading: gameState === 'loading',
      gameError,
      seasons: list,
      seasonsLoading: seasonState === 'loading',
      season: resolved,
      live: resolved?.state === 'open',
      slug,
      reload: () => {
        gameReload()
        seasonReload()
      },
    }
  }, [games.data, games.error, gameData, gameError, gameState, gameReload, seasonData, seasonState, seasonReload, wanted, slug])

  return <PlatformContext value={value}>{children}</PlatformContext>
}
