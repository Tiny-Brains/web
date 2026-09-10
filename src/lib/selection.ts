// Game and season are selection, not routes.
//
// There is no /games/ants/… branch: the two dropdowns in the context strip put
// their choice in the query string. Both parameters are OMITTED WHEN THEY ARE THE
// DEFAULT, so the address of the ordinary case stays clean and every other state
// is still linkable. The shell carries the selection across every link, which is
// why these helpers build hrefs rather than pages doing it.

import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/** One game today. A fallback for the query string, not a hardcoded subject. */
export const DEFAULT_GAME = 'ants'

export type Selection = {
  /** The slug in force, whether it was chosen or defaulted. */
  game: string
  /** The season number, or null for "whichever one is live". */
  season: number | null
  /** Whether the query string actually said so — what decides if a link keeps it. */
  explicitGame: boolean
}

type Extra = Record<string, string | number | null | undefined>

function buildHref(path: string, selection: Selection, extra?: Extra): string {
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

export function useSelection(): Selection & {
  setGame: (slug: string) => void
  setSeason: (n: number | null) => void
  /** A path with the current selection carried onto it. */
  href: (path: string, extra?: Extra) => string
} {
  const [params, setParams] = useSearchParams()

  const rawGame = params.get('game')
  const rawSeason = Number(params.get('season'))
  const selection: Selection = {
    game: rawGame || DEFAULT_GAME,
    season: Number.isInteger(rawSeason) && rawSeason > 0 ? rawSeason : null,
    explicitGame: Boolean(rawGame),
  }

  return {
    ...selection,
    setGame(slug) {
      const next = new URLSearchParams(params)
      // Season 3 of one game is not season 3 of another, so the number cannot
      // survive the switch. Dropping it lands on the new game's live season.
      next.delete('season')
      if (slug === DEFAULT_GAME) next.delete('game')
      else next.set('game', slug)
      setParams(next)
    },
    setSeason(n) {
      const next = new URLSearchParams(params)
      if (n === null) next.delete('season')
      else next.set('season', String(n))
      setParams(next)
    },
    href: (path, extra) => buildHref(path, selection, extra),
  }
}

/**
 * A page's own state, held in the address so a filtered view is a link somebody
 * can send. Setting a key to '' removes it, which is what keeps the default case
 * out of the query string.
 */
export function useQueryState(): [(key: string) => string, (values: Record<string, string>) => void] {
  const [params, setParams] = useSearchParams()
  const set = useCallback(
    (values: Record<string, string>) => {
      const next = new URLSearchParams(params)
      for (const [k, v] of Object.entries(values)) {
        if (v) next.set(k, v)
        else next.delete(k)
      }
      setParams(next)
    },
    [params, setParams],
  )
  return [(key) => params.get(key) ?? '', set]
}
