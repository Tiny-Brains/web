// Game and season are selection, not routes.
//
// There is no /games/ants/… branch: the two dropdowns in the context strip put
// their choice in the query string, and the page under them re-renders. Both
// parameters are OMITTED WHEN THEY ARE THE DEFAULT -- the default game, and its
// live season -- so the address of the ordinary case stays clean and every other
// state is still linkable.
//
// The shell carries the current selection across every link, which is why these
// helpers build hrefs rather than pages doing it: picking season 1 on the home
// page and then clicking Leaderboard has to stay in season 1.

import { useSearchParams } from 'react-router-dom'

/** One game today. It is a fallback for the query string, not a hardcoded
 *  subject: every page reads the selection, and the strip lists whatever
 *  GET /v1/games returns. */
export const DEFAULT_GAME = 'ants'

export type Selection = {
  /** The slug in force, whether it was chosen or defaulted. */
  game: string
  /** The season number, or null for "whichever one is live". */
  season: number | null
  /** Whether the query string actually said so -- what decides if a link keeps it. */
  explicitGame: boolean
}

export function useSelection(): Selection & {
  setGame: (slug: string) => void
  setSeason: (n: number | null) => void
  /** A path with the current selection carried onto it. */
  href: (path: string, extra?: Record<string, string | number | null | undefined>) => string
} {
  const [params, setParams] = useSearchParams()

  const rawGame = params.get('game')
  const rawSeason = params.get('season')
  const parsedSeason = rawSeason === null ? null : Number(rawSeason)
  const season = parsedSeason !== null && Number.isInteger(parsedSeason) && parsedSeason > 0 ? parsedSeason : null

  const selection: Selection = {
    game: rawGame || DEFAULT_GAME,
    season,
    explicitGame: Boolean(rawGame),
  }

  return {
    ...selection,
    setGame(slug) {
      const next = new URLSearchParams(params)
      // Changing the game changes which seasons exist, so the season number
      // cannot survive the switch -- season 3 of one game is not season 3 of
      // another. Dropping it lands on the new game's live season.
      next.delete('season')
      if (slug === DEFAULT_GAME) next.delete('game')
      else next.set('game', slug)
      setParams(next, { replace: false })
    },
    setSeason(n) {
      const next = new URLSearchParams(params)
      if (n === null) next.delete('season')
      else next.set('season', String(n))
      setParams(next, { replace: false })
    },
    href(path, extra) {
      return buildHref(path, selection, extra)
    },
  }
}

export function buildHref(
  path: string,
  selection: Pick<Selection, 'game' | 'season' | 'explicitGame'>,
  extra?: Record<string, string | number | null | undefined>,
): string {
  const q = new URLSearchParams()
  if (selection.explicitGame && selection.game !== DEFAULT_GAME) q.set('game', selection.game)
  if (selection.season !== null) q.set('season', String(selection.season))
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v === null || v === undefined || v === '') q.delete(k)
    else q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `${path}?${s}` : path
}
