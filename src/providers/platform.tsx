// The selected game and its seasons, resolved once.
//
// The shell needs the game list on every route and five pages need the season's
// weight classes; fetching that per page would make the strip flicker on every
// navigation and let two components disagree about which season is live. The guide
// also needs to know, on every route, whether a story exists yet.
//
// A SEASON HAS TO BE RESOLVED, not just read: the query string carries a slug
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
  const stories = useApi('stories', () => api.stories({ limit: 1 }))

  const { data: gamesData, error: gamesError } = games
  const { data: storiesData } = stories
  const { data: gameData, error: gameError, state: gameState, reload: gameReload } = game
  const { data: seasonData, state: seasonState, reload: seasonReload } = seasons

  const value = useMemo<PlatformValue>(() => {
    const list = seasonData ?? []
    // "No season" resolves to the game's FEATURED season (S4/N30): the admin sets it, and failing
    // that Soma's current_season() falls back to the newest live public season, then the newest
    // public one. GET /v1/games/{game} already answers that resolution as `season`, so the browser
    // takes it rather than re-deriving it (a live-first guess would disagree the moment an admin
    // features an older season). The list is the switcher's menu; gameData.season is "current".
    const current = gameData?.season ?? list.find((s) => s.closed_at === null) ?? list[0] ?? null
    const resolved = wanted === null ? current : (list.find((s) => s.slug === wanted) ?? null)
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
      hasStories: (storiesData?.total ?? storiesData?.stories.length ?? 0) > 0,
      seasonName: (which) =>
        which ? (list.find((s) => s.slug === which)?.name ?? (gameData?.season?.slug === which ? gameData.season.name : which)) : '',
      slug,
      reload: () => {
        gameReload()
        seasonReload()
      },
    }
  }, [
    gamesData, gamesError, gameData, gameError, gameState, gameReload,
    seasonData, seasonState, seasonReload, storiesData, wanted, slug,
  ])

  return <PlatformContext value={value}>{children}</PlatformContext>
}
