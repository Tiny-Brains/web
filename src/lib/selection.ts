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

/** A season's slug, as Soma's season_slug() makes them and its CHECK holds them to. Anything else
 *  in `?season=` is not a season and reads as "the live one" rather than as a season that is not. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** What Soma will make of a season's name, for a preview before it is created: lower-cased, every
 *  run of anything but a-z and 0-9 one hyphen, the ends trimmed. The server's is the one that
 *  counts; this only shows it. */
export function seasonSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type Selection = {
  /** The slug in force, whether it was chosen or defaulted. */
  game: string
  /** The season's slug, or null for "whichever one is live". */
  season: string | null
  /** Whether the query string actually said so — what decides if a link keeps it. */
  explicitGame: boolean
}

type Extra = Record<string, string | number | null | undefined>

function buildHref(path: string, selection: Selection, extra?: Extra): string {
  const q = new URLSearchParams()
  if (selection.explicitGame && selection.game !== DEFAULT_GAME) q.set('game', selection.game)
  if (selection.season !== null) q.set('season', selection.season)
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v === null || v === undefined || v === '') q.delete(k)
    else q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `${path}?${s}` : path
}

export function useSelection(): Selection & {
  setGame: (slug: string) => void
  setSeason: (slug: string | null) => void
  /** A path with the current selection carried onto it. */
  href: (path: string, extra?: Extra) => string
} {
  const [params, setParams] = useSearchParams()

  const rawGame = params.get('game')
  const rawSeason = params.get('season') ?? ''
  const selection: Selection = {
    game: rawGame || DEFAULT_GAME,
    season: SLUG.test(rawSeason) ? rawSeason : null,
    explicitGame: Boolean(rawGame),
  }

  return {
    ...selection,
    setGame(slug) {
      const next = new URLSearchParams(params)
      // A season belongs to one game, so its slug cannot survive the switch.
      // Dropping it lands on the new game's live season.
      next.delete('season')
      if (slug === DEFAULT_GAME) next.delete('game')
      else next.set('game', slug)
      setParams(next)
    },
    setSeason(slug) {
      const next = new URLSearchParams(params)
      if (slug === null) next.delete('season')
      else next.set('season', slug)
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
