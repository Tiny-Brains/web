// `/matches` — every match played in the selected game and season, newest first.
//
// The four filters are the page's own and live in the query string, so a filtered
// list is a link somebody can send.
//
// LADDER AND CLASS ARE TWO DIFFERENT QUESTIONS, which is why both earn a control.
// A class ladder counts a match only when EVERY seat is that class, so `ladder`
// asks which ladder this match counted on; `class` asks which matches a version of
// that class took part in. Both are answered by Soma.

import { useState } from 'react'
import { api } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection, useQueryState } from '../lib/selection'
import { num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardFoot, CardHead, LabelledSelect, PageHead, type Option } from '../components/ui'
import { MatchList } from '../components/MatchRow'

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

  const classOptions = classes.map((c) => ({ value: c.class, label: c.class }))
  const shown = list.data?.matches.length ?? 0
  const total = list.data?.total

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
          <MatchList
            state={list.state}
            matches={list.data?.matches ?? []}
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
