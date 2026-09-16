// A DEV-LOOP TRIPWIRE. Not validation, and deliberately not a schema library.
//
// types.ts opens by saying that these declarations were read off the `json_build_object` in each
// Soma workflow's one query and that TypeScript cannot notice when one changes. Nothing else
// notices either: there is no test suite here, and a renamed field arrives as a page of em dashes
// or a thrown render rather than as an error naming it. `adapter_hash` becoming `manifest_hash` is
// exactly that, and it cost a release.
//
// So: the three bodies everything else is built on are checked against the fields the pages
// actually read, and only when `import.meta.env.DEV` — the check is compiled out of the bundle a
// competitor loads, and a production page NEVER behaves differently for it. A drift is a console
// error naming the route and the field, which is the cheapest place there is to find one.
//
// A shape lists only the fields whose absence would break a page. It is not a mirror of the type.

type Kind = 'string' | 'number' | 'boolean' | 'object' | 'array'
/** `field: kind` requires it; `field: [kind]` allows it to be null as well. */
export type Shape = Record<string, Kind | [Kind]>

function kindOf(v: unknown): Kind | 'null' | 'undefined' {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (Array.isArray(v)) return 'array'
  return typeof v as Kind
}

function checkOne(where: string, row: unknown, shape: Shape, report: (s: string) => void) {
  if (kindOf(row) !== 'object') {
    report(`${where}: expected an object, got ${kindOf(row)}`)
    return
  }
  const o = row as Record<string, unknown>
  for (const [field, spec] of Object.entries(shape)) {
    const nullable = Array.isArray(spec)
    const want = nullable ? spec[0] : spec
    const got = kindOf(o[field])
    if (got === 'undefined') {
      report(`${where}: no \`${field}\` — soma/workflows is the authority; compare its query`)
    } else if (got === 'null' && !nullable) {
      report(`${where}: \`${field}\` is null, and no page here expects it to be`)
    } else if (got !== 'null' && got !== want) {
      report(`${where}: \`${field}\` is a ${got}, not a ${want}`)
    }
  }
}

/**
 * Check a body against a shape, in the dev loop only. `body` may be the object itself, an array of
 * them, or a `{ entries: [...] }` page — whichever the route answers with; the first row stands for
 * the rest, because a body built in one SQL statement cannot disagree with itself row to row.
 */
export function assertShape(where: string, body: unknown, shape: Shape, listKey?: string): void {
  if (!import.meta.env.DEV) return
  const say = (s: string) => console.error(`TinyBrains: the API's shape moved. ${s}`)

  let row: unknown = body
  if (listKey && body && typeof body === 'object' && !Array.isArray(body)) {
    row = (body as Record<string, unknown>)[listKey]
  }
  if (Array.isArray(row)) {
    // An empty list is no evidence either way, which is not the same as evidence of a problem.
    if (row.length === 0) return
    row = row[0]
  }
  if (row === null || row === undefined) return

  checkOne(where, row, shape, say)
}

/** Who you are. Every signed-in page reads these, and `candidates` drives the bar's chip. */
export const ME: Shape = {
  id: 'string',
  handle: 'string',
  display_name: ['string'],
  role: 'string',
  candidates: 'array',
}

/** season_json(), returned by six routes. `weight_classes` is what every cap on the site is read
 *  from, so it is the one field here whose absence would be silent and wrong rather than empty. */
export const SEASON: Shape = {
  number: 'number',
  state: 'string',
  submissions_open_at: 'string',
  submissions_close_at: 'string',
  closed_at: ['string'],
  weight_classes: 'array',
  active_versions: 'number',
  entered_versions: 'number',
  matches_played: 'number',
}

/** One ladder row: the model link, the size/rating plot and the ladder table are all built off it. */
export const LEADERBOARD_ENTRY: Shape = {
  rank: 'number',
  version_id: 'string',
  model: 'string',
  model_id: 'string',
  owner: 'string',
  version: 'number',
  size_bytes: ['number'],
  rating: 'number',
  matches: 'number',
  baseline: 'boolean',
}
