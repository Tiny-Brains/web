// Where things live, as functions rather than template literals scattered through the pages.
//
// A MODEL'S PATH IS ITS ID. It used to be its repository, on the argument that the permalink was
// then constructible from a GitHub link and readable in a way a uuid is not — true, and it cost a
// repository per entry that limited nothing. An entry is a name now, and a name is a competitor's
// own words: free text, theirs to edit, and never in a URL. A version is a segment under the
// model, and `/versions/{id}` is the uuid form every API response can be turned into without a
// lookup.
//
// The game is NOT in these paths. It never needed to be — a model id names its game — and
// selection lives in the query string (see lib/selection.ts), not in the route.

import { DEFAULT_GAME } from './selection'

export function modelPath(modelId: string) {
  return `/models/${modelId}`
}

export function versionPath(modelId: string, version: number) {
  return `${modelPath(modelId)}/v${version}`
}

/** The desk of one season, for whoever runs it. The season is selection, so it rides the query
 *  string like everywhere else; the game joins it only when it is not the default. */
export function seasonDeskPath(a: { game: string; season: string }): string {
  const q = new URLSearchParams()
  if (a.game !== DEFAULT_GAME) q.set('game', a.game)
  q.set('season', a.season)
  return `/season-admin?${q.toString()}`
}
