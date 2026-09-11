// `/matches` — every match played in the selected game and season, newest first.
//
// The four filters are the page's own and live in the query string, so a filtered
// list is a link somebody can send.
//
// LADDER AND CLASS ARE TWO DIFFERENT QUESTIONS, which is why both earn a control.
// A class ladder counts a match only when EVERY seat is that class, so `ladder`
// asks which ladder this match counted on; `class` asks which matches a version of
// that class took part in. Both are answered by Soma.

import { Fragment, useState } from 'react'
import { api, type MatchSummary } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection, useQueryState } from '../lib/selection'
import { date, num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardBody, CardFoot, CardHead, Facts, LabelledSelect, PageHead, SectionHead, type Option } from '../components/ui'
import { MatchList, MatchRow } from '../components/MatchRow'

const COUNTED = ['decided', 'drawn', 'dq'] as const
/** How many of the newest matches the picks are chosen from. */
const POOL = 100

const PAGE = 25
const FILTERS = ['ladder', 'class', 'preset', 'outcome'] as const

const OUTCOMES: Option[] = [
  { value: '', label: 'Any outcome' },
  { value: 'decided', label: 'Decided' },
  { value: 'drawn', label: 'Drawn' },
  { value: 'dq', label: 'A seat disqualified' },
]

export default function Matches() {
  const { season, live, slug, game, gameName } = usePlatform()
  const { season: wanted } = useSelection()
  const [param, setParam] = useQueryState()
  const classes = useWeightClasses()
  const [cursor, setCursor] = useState<string | null>(null)

  const setFilter = (values: Record<string, string>) => {
    setParam(values)
    setCursor(null)
  }
  const clear = () => setFilter(Object.fromEntries(FILTERS.map((k) => [k, ''])))

  const [ladder, klass, preset, outcome] = FILTERS.map(param)
  const filtered = FILTERS.some((k) => param(k))

  const list = useApi(`mx:${slug}:${wanted}:${ladder}:${klass}:${preset}:${outcome}:${cursor}`, () =>
    api.matches({
      game: slug,
      season: wanted,
      ladder: ladder || null,
      class: klass || null,
      preset: preset || null,
      outcome: (outcome || null) as 'decided' | 'drawn' | 'dq' | null,
      cursor,
      limit: PAGE,
    }),
  )

  // THE SEASON IN THREE COUNTS. A list's `total` is the one aggregate the API gives and it
  // answers a filter, so three reads of one row each count the decided, the drawn and the
  // disqualified across the season. The median length is this page's rows: the API carries no
  // such number, and the page says which rows it was read from.
  const counts = useApi(`mx-counts:${slug}:${wanted}`, () =>
    Promise.all(
      COUNTED.map(async (o) => {
        const b = await api.matches({ game: slug, season: wanted, outcome: o, limit: 1 })
        return [o, b.total] as const
      }),
    ),
  )
  const counted = new Map(counts.data ?? [])

  // WORTH WATCHING, picked by what happened rather than by hand: a gallery curated by a person
  // names match ids, and ids belong to one deployment. From the newest hundred: the quickest
  // decisive match, the longest, and the biggest score. The page says the pool.
  const pool = useApi(`mx-pool:${slug}:${wanted}`, () => api.matches({ game: slug, season: wanted, limit: POOL }))
  const picks = worthWatching(pool.data?.matches ?? [])

  const classOptions = classes.map((c) => ({ value: c.class, label: c.class }))
  const rows = list.data?.matches ?? []
  const shown = rows.length
  const total = list.data?.total
  const lengths = rows.map((m) => m.turns).filter((t): t is number => t !== null).sort((a, b) => a - b)
  const median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : null

  return (
    <Shell nav="matches" ctx="select" title="Matches">
      <PageHead
        title={<h1>{live ? 'Matches' : `Season ${season?.number ?? ''} matches`}</h1>}
        sub={
          season
            ? live
              ? `Every match played in ${gameName} season ${season.number}, newest first. ${num(season.matches_played)} so far.`
              : `Every match season ${season.number} played, newest first. ${num(season.matches_played)} in total, all of them final.`
            : undefined
        }
      />

      <section className="wrap sec-top">
        {live ? (
          <Card className="season-strip">
            <CardBody>
              <Facts
                cols={4}
                items={[
                  { label: 'decided', value: counts.state === 'ready' ? num(counted.get('decided') ?? 0) : '—' },
                  { label: 'drawn', value: counts.state === 'ready' ? num(counted.get('drawn') ?? 0) : '—' },
                  { label: 'a seat disqualified', value: counts.state === 'ready' ? num(counted.get('dq') ?? 0) : '—' },
                  {
                    label: 'median length, this page',
                    value: median === null ? '—' : <>{num(median)} <span className="muted">turns</span></>,
                  },
                ]}
              />
            </CardBody>
          </Card>
        ) : null}

        {live && picks.length > 0 ? (
          <>
            <SectionHead
              title="Worth watching"
              sub={`picked from the newest ${num(Math.min(POOL, pool.data?.matches.length ?? 0))} by what happened, not by hand`}
            />
            <div className="picks">
              {picks.map(([why, m]) => (
                <Card key={why}>
                  <CardHead title={why} />
                  <div className="matches">
                    <MatchRow match={m} />
                  </div>
                </Card>
              ))}
            </div>
          </>
        ) : null}

        <div className="filterbar">
          <LabelledSelect
            label="Ladder"
            id="f-ladder"
            value={ladder}
            options={[{ value: '', label: 'Any ladder' }, { value: 'open', label: 'Open' }, ...classOptions]}
            onChange={(v) => setFilter({ ladder: v })}
          />
          <LabelledSelect
            label="Class"
            id="f-class"
            value={klass}
            options={[{ value: '', label: 'Any class' }, ...classOptions]}
            onChange={(v) => setFilter({ class: v })}
          />
          {/* The presets are the cartridge's, so a second game brings its own. */}
          <LabelledSelect
            label="Preset"
            id="f-preset"
            value={preset}
            options={[
              { value: '', label: 'Any preset' },
              ...(game?.presets ?? []).map((p) => ({ value: p.name, label: p.name })),
            ]}
            onChange={(v) => setFilter({ preset: v })}
          />
          <LabelledSelect
            label="Outcome"
            id="f-outcome"
            value={outcome}
            options={OUTCOMES}
            onChange={(v) => setFilter({ outcome: v })}
          />
          <div className="end">
            <span className="count">
              {total !== null && total !== undefined ? `${num(total)} matched` : shown ? `${num(shown)} shown` : null}
            </span>
            <button className="btn sm" type="button" onClick={clear} disabled={!filtered}>
              Clear
            </button>
          </div>
        </div>

        <p className="filter-say">
          {ladder && ladder !== 'open'
            ? `The ${ladder} ladder counts a match only when every seat is ${ladder}. A mixed match counts on Open alone.`
            : 'Every match counts on Open. A match between versions of one class also counts on that class ladder.'}
        </p>

        <Card>
          <CardHead title="Matches played" end="newest first" />
          {/* GROUPED BY DAY once there are rows: a flat page of twenty-five had no shape. The
              loading, empty and error states are the one list, as before. */}
          {list.state === 'ready' && rows.length > 0 ? (
            byDay(rows).map(([day, ms]) => (
              <Fragment key={day}>
                <div className="day-head">{day}</div>
                <MatchList state="ready" matches={ms} wide empty="" />
              </Fragment>
            ))
          ) : (
          <MatchList
            state={list.state}
            matches={rows}
            wide
            empty={
              filtered ? (
                <>
                  No match in this season matches these filters. Widen one of them, or{' '}
                  <button className="btn sm" type="button" onClick={clear}>
                    clear them all
                  </button>
                  .
                </>
              ) : (
                'No match has been played in this season yet.'
              )
            }
          />
          )}
          <CardFoot>
            {list.data?.next_cursor ? (
              <button className="btn sm" type="button" onClick={() => setCursor(list.data.next_cursor)}>
                Older matches →
              </button>
            ) : cursor ? (
              <button className="btn sm" type="button" onClick={() => setCursor(null)}>
                ← Back to the newest
              </button>
            ) : (
              <span className="muted">That is every match this filter reaches.</span>
            )}
            <span className="foot-end">{shown ? `showing ${num(shown)}` : null}</span>
          </CardFoot>
        </Card>
      </section>
    </Shell>
  )
}

/** Three picks from a pool of played matches, each named by why: the quickest decisive one, the
 *  longest, and the one with the biggest score. A match is picked once; with a pool too thin to
 *  fill three distinct picks there are fewer, and with no decided match there is no first. */
function worthWatching(pool: MatchSummary[]): [string, MatchSummary][] {
  const played = pool.filter((m) => (m.status === 'rated' || m.status === 'finished') && m.turns !== null)
  const decided = played.filter((m) => m.seats.some((s) => s.outcome === 'win'))
  const out: [string, MatchSummary][] = []
  const taken = new Set<string>()
  const take = (why: string, m: MatchSummary | undefined) => {
    if (!m || taken.has(m.id)) return
    taken.add(m.id)
    out.push([why, m])
  }
  take('Quickest decisive', [...decided].sort((a, b) => (a.turns ?? 0) - (b.turns ?? 0))[0])
  take('Longest', [...played].sort((a, b) => (b.turns ?? 0) - (a.turns ?? 0))[0])
  const best = (m: MatchSummary) => Math.max(...m.seats.map((s) => s.score ?? 0))
  take('Biggest score', [...played].sort((a, b) => best(b) - best(a))[0])
  return out
}

/** The page's rows under the day each was played, in the order they arrive (newest first), with
 *  today and yesterday named. A match that has not been played sits under the day it was made. */
function byDay(rows: MatchSummary[]): [string, MatchSummary[]][] {
  const today = date(new Date().toISOString())
  const yesterday = date(new Date(Date.now() - 86_400_000).toISOString())
  const groups = new Map<string, MatchSummary[]>()
  for (const m of rows) {
    const d = date(m.played_at ?? m.created_at)
    const label = d === today ? `Today · ${d}` : d === yesterday ? `Yesterday · ${d}` : d
    groups.set(label, [...(groups.get(label) ?? []), m])
  }
  return [...groups.entries()]
}
