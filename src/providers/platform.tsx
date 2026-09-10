// The selected game and its seasons, resolved once.
//
// The shell needs the game list on every route and five pages need the season's
// weight classes; fetching that per page would make the strip flicker on every
// navigation and let two components disagree about which season is live.
//
// A SEASON HAS TO BE RESOLVED, not just read: the query string carries a number
// only when it is not the default, so "no season parameter" means "whichever one
// is live" — and in a game between seasons, the most recent one.

import { useMemo, type ReactNode } from 'react'
import { api } from '../api'
import { useApi } from '../lib/useApi'
import { useSelection } from '../lib/selection'
import { PlatformContext, type PlatformValue } from './platform-context'

export function PlatformProvider({ children }: { children: ReactNode }) {
  const { game: slug, season: wanted } = useSelection()

  const games = useApi('games', () => api.games())
  const game = useApi(`game:${slug}`, () => api.game(slug))
  const seasons = useApi(`seasons:${slug}`, () => api.seasons(slug))

  const { data: gamesData, error: gamesError } = games
  const { data: gameData, error: gameError, state: gameState, reload: gameReload } = game
  const { data: seasonData, state: seasonState, reload: seasonReload } = seasons

  const value = useMemo<PlatformValue>(() => {
    const list = seasonData ?? []
    // The live season first, then the highest number — the same order Soma's own
    // `ORDER BY (closed_at IS NULL) DESC, number DESC` picks with.
    const current =
      list.find((s) => s.closed_at === null) ??
      [...list].sort((a, b) => b.number - a.number)[0] ??
      gameData?.season ??
      null
    const resolved = wanted === null ? current : (list.find((s) => s.number === wanted) ?? null)
    const all = gamesData ?? []

    return {
      games: all,
      gamesError,
      game: gameData,
      gameLoading: gameState === 'loading',
      gameError,
      gameName: all.find((g) => g.id === slug)?.name ?? slug,
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
  }, [
    gamesData, gamesError, gameData, gameError, gameState, gameReload,
    seasonData, seasonState, seasonReload, wanted, slug,
  ])

  return <PlatformContext value={value}>{children}</PlatformContext>
}
