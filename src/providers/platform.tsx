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
//
// A PRIVATE SEASON IS NOT ON THE PUBLIC LIST. Signed in, the list is the member's copy
// (/v1/private/games/{game}/seasons), which adds the private seasons this viewer may see; it waits
// for the session to answer rather than reading the public list first and swapping, so a member's
// `?season=` never flashes Not found. The same list decides every other read's route: `priv()`.

import { useMemo, type ReactNode } from 'react'
import { api } from '../api'
import { useApi } from '../lib/useApi'
import { useSelection } from '../lib/selection'
import { useSession } from './session-context'
import { PlatformContext, type PlatformValue } from './platform-context'

export function PlatformProvider({ children }: { children: ReactNode }) {
  const { game: slug, season: wanted } = useSelection()
  const { session } = useSession()
  const member = session.state === 'signed-in'

  const games = useApi('games', () => api.games())
  const game = useApi(`game:${slug}`, () => api.game(slug))
  const seasons = useApi(`seasons:${slug}:${member ? 'member' : 'public'}`, () => api.seasons(slug, member), session.state !== 'loading')
  const stories = useApi('stories', () => api.stories({ limit: 1 }))

  const { data: gamesData, error: gamesError } = games
  const { data: storiesData } = stories
  const { data: gameData, error: gameError, state: gameState, reload: gameReload } = game
  const { data: seasonData, error: seasonsError, state: seasonState, reload: seasonReload } = seasons

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
    // Whether the viewer can see any private season of this game: then a read by id (a match, a
    // model, a version), whose season is not known before it answers, takes the member's route.
    const seesPrivate = member && list.some((s) => s.visibility === 'private')
    const scopePriv = member && resolved?.visibility === 'private'

    return {
      games: all,
      gamesError,
      game: gameData,
      gameLoading: gameState === 'loading',
      gameError,
      gameName: all.find((g) => g.id === slug)?.name ?? slug,
      seasons: list,
      seasonsLoading: seasonState === 'loading',
      seasonsError,
      seasonMissing: wanted !== null && seasonState === 'ready' && resolved === null,
      season: resolved,
      live: resolved?.state === 'open',
      hasStories: (storiesData?.total ?? storiesData?.stories.length ?? 0) > 0,
      seasonName: (which) =>
        which ? (list.find((s) => s.slug === which)?.name ?? (gameData?.season?.slug === which ? gameData.season.name : which)) : '',
      slug,
      priv: (which) => {
        if (!member) return false
        if (which === undefined) return seesPrivate
        const s = which === null ? resolved : list.find((x) => x.slug === which)
        return s?.visibility === 'private'
      },
      scope: {
        key: `${slug}:${wanted ?? ''}:${scopePriv ? 'member' : 'public'}`,
        ready: wanted === null || resolved !== null,
        priv: scopePriv,
      },
      reload: () => {
        gameReload()
        seasonReload()
      },
    }
  }, [
    gamesData, gamesError, gameData, gameError, gameState, gameReload,
    seasonData, seasonsError, seasonState, seasonReload, storiesData, wanted, slug, member,
  ])

  return <PlatformContext value={value}>{children}</PlatformContext>
}
