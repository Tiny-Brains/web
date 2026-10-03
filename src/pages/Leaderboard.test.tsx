// The table on /leaderboard, drawn from the columns its record lists.
//
// FORMAT 1 IS PINNED BYTE FOR BYTE. __snapshots__/leaderboard-format1.html was written by the table
// as it stood before it read `columns`, so a format-1 record -- and a body from an API that sends no
// `columns` at all -- must keep drawing exactly that markup. A deliberate change to the table is a
// `npx vitest -u` and a reviewed diff of that file, never a quiet one.

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { LeaderboardColumn, LeaderboardEntry, LeaderboardSeries } from '../api'
import { PlatformContext, type PlatformValue } from '../providers/platform-context'
import { FieldTable } from './Leaderboard'

/** standings_columns(1), as soma serves it beside the entries. */
const FORMAT_1: LeaderboardColumn[] = [
  { key: 'rank', type: 'rank' },
  { key: 'model', type: 'model', link: 'model_id' },
  { key: 'owner', type: 'handle' },
  { key: 'version', type: 'int' },
  { key: 'class', type: 'ladder' },
  { key: 'size_bytes', type: 'bytes' },
  { key: 'rating', type: 'rating', primary: true },
  { key: 'provisional', type: 'flag' },
  { key: 'matches', type: 'int' },
  { key: 'round_matches', type: 'int' },
  { key: 'baseline', type: 'flag' },
  { key: 'trend', type: 'delta' },
  { key: 'history', type: 'sparkline' },
]

const classes = [
  { class: 'nano', max_bytes: 8192 },
  { class: 'micro', max_bytes: 65536 },
]
const platform = { season: { weight_classes: classes }, game: null } as unknown as PlatformValue

const row = (n: number, over: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  rank: n,
  version_id: `0000000${n}-aaaa-bbbb-cccc-dddddddddddd`,
  model_id: `m${n}`,
  model: `model-${n}`,
  owner: `owner${n}`,
  version: n,
  class: 'nano',
  size_bytes: 4000 + n,
  rating: 30 - n * 1.25,
  provisional: false,
  matches: 40 + n,
  round_matches: n,
  baseline: false,
  trend: 0.5 * n,
  history: [20, 21.5, 22, 24 - n],
  ...over,
})

const rows: LeaderboardEntry[] = [
  row(1, { provisional: true, trend: 12.34 }),
  row(2, { owner: 'baseline.nano-bc', baseline: true, trend: null, round_matches: null }),
  row(3, { class: 'micro', size_bytes: null, trend: -3.21, history: [] }),
  row(4, { owner: 'alice', trend: 0 }),
  row(5, { class: 'micro', history: [18] }),
]

const series: LeaderboardSeries = {
  season: 's1',
  ladder: 'open',
  series: {
    edges: ['2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z', '2026-09-03T00:00:00Z'],
    versions: [
      { version_id: rows[0].version_id, model_id: 'm1', model: 'model-1', owner: 'owner1', baseline: false, version: 1, ratings: [25, 27.5, 28.75], ranks: [2, 1, 1] },
      { version_id: rows[3].version_id, model_id: 'm4', model: 'model-4', owner: 'alice', baseline: false, version: 4, ratings: [null, 24, 25], ranks: [null, 3, 4] },
    ],
  },
}

type Props = Parameters<typeof FieldTable>[0]

function html(over: Partial<Props> = {}): string {
  const props: Props = {
    rows,
    loading: false,
    you: 'alice',
    medals: true,
    compared: new Set([rows[0].version_id]),
    onCompare: () => undefined,
    season: { state: 'ready', data: series },
    ladderName: 'Open',
    hrefFor: (id) => `/matches?version=${id}`,
    mineEmpty: false,
    round: { n: 2, kind: 'round', games: 10 },
    ...over,
  }
  return renderToStaticMarkup(
    <MemoryRouter>
      <PlatformContext value={platform}>
        <FieldTable {...props} />
      </PlatformContext>
    </MemoryRouter>,
  )
}

/** Every state the table draws a format-1 row in, one document. */
function format1(over: Partial<Props> = {}): string {
  return [
    html(over),
    html({ ...over, medals: false, round: null, you: undefined, season: { state: 'loading', data: null } }),
    html({ ...over, loading: true }),
    html({ ...over, mineEmpty: true }),
  ].join('\n\n')
}

/** The number each row's headline cell shows, its marks (an icon, which names itself) left out. */
function leads(markup: string): string[] {
  return [...markup.matchAll(/<span class="lead">(.*?)<\/span><\/td>/g)].map((m) => m[1].replace(/<svg.*?<\/svg>/g, '').replace(/<[^>]*>/g, ''))
}

describe('the leaderboard table', () => {
  it('draws format 1 as it always has, with no columns', async () => {
    await expect(format1()).toMatchFileSnapshot('__snapshots__/leaderboard-format1.html')
  })

  it('draws format 1 as it always has, with its columns named', async () => {
    await expect(format1({ columns: FORMAT_1 })).toMatchFileSnapshot('__snapshots__/leaderboard-format1.html')
    expect(leads(html({ columns: FORMAT_1 }))).toEqual(['28.8', '27.5', '26.3', '25.0', '23.8'])
  })

  it('heads a row with the primary column, and draws a type it does not know as text', () => {
    // A later format: `points` is the headline and of a type this page has never seen, and the
    // rating it keeps is an ordinary column.
    const columns: LeaderboardColumn[] = [
      ...FORMAT_1.map((c) => (c.primary ? { key: c.key, type: c.type } : c)),
      { key: 'points', type: 'points', primary: true },
    ]
    const scored = rows.map((r, i) => ({ ...r, points: 1000 - i * 75 }))
    const markup = html({ rows: scored, columns })
    expect(leads(markup)).toEqual(['1,000', '925', '850', '775', '700'])
    // Headed by its key, and the rating drawn beside it rather than dropped.
    expect(markup).toContain('<th class="r">points</th>')
    expect(markup).toContain('<th class="r wide-only">Rating</th>')
    expect(markup).toContain('by points</caption>')
    // The placeholder rows and the opened row's span follow the same columns.
    expect(() => html({ rows: scored, columns, loading: true })).not.toThrow()
  })

  it('draws an unknown column that is not primary as text under its key', () => {
    const columns: LeaderboardColumn[] = [...FORMAT_1, { key: 'streak', type: 'streak' }]
    const markup = html({ rows: rows.map((r) => ({ ...r, streak: 'WWL' })), columns })
    expect(markup).toContain('<th class="wide-only">streak</th>')
    expect(markup).toContain('<td class="wide-only">WWL</td>')
    expect(leads(markup)[0]).toBe('28.8')
  })
})
