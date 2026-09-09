// `/matches` — every match played in the selected game and season, newest first.
//
// The four filters are the page's own; game and season come from the strip. They
// live in the query string so a filtered list is a link somebody can send.
//
// LADDER AND CLASS ARE TWO DIFFERENT QUESTIONS, which is why both earn a control.
// A class ladder counts a match only when EVERY seat is that class, so `ladder`
// asks which ladder this match counted on; `class` asks which matches a version
// of that class took part in. Both are answered by Soma -- the ladders on a match
// row are Jodi's decision, not a rule re-derived here.

import { Link, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform } from '../lib/platform-context'
import { useSelection } from '../lib/selection'
import { num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardFoot, CardHead, LabelledSelect, PageHead, type Option } from '../components/ui'
import { MatchList } from '../components/MatchRow'

const PAGE = 25

const OUTCOMES: Option[] = [
  { value: '', label: 'Any outcome' },
  { value: 'decided', label: 'Decided' },
  { value: 'drawn', label: 'Drawn' },
  { value: 'dq', label: 'A seat disqualified' },
]

export default function Matches() {
  const { season, live, slug, game } = usePlatform()
  const { href, season: wanted } = useSelection()
  const [params, setParams] = useSearchParams()
  const [cursor, setCursor] = useState<string | null>(null)

  const filter = (k: string) => params.get(k) ?? ''
  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next)
    setCursor(null)
  }
  const clear = () => {
    const next = new URLSearchParams(params)
    for (const k of ['ladder', 'class', 'preset', 'outcome']) next.delete(k)
    setParams(next)
    setCursor(null)
  }

  const ladder = filter('ladder')
  const klass = filter('class')
  const preset = filter('preset')
  const outcome = filter('outcome')
  const filtered = Boolean(ladder || klass || preset || outcome)

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

  const classes = season?.weight_classes ?? []
  const ladderOptions: Option[] = [
    { value: '', label: 'Any ladder' },
    { value: 'open', label: 'Open' },
    ...classes.map((c) => ({ value: c.class, label: c.class })),
  ]
  const classOptions: Option[] = [
    { value: '', label: 'Any class' },
    ...classes.map((c) => ({ value: c.class, label: c.class })),
  ]
  // The presets are the cartridge's, so a second game brings its own and this
  // control does not need editing.
  const presetOptions: Option[] = [
    { value: '', label: 'Any preset' },
    ...(game?.presets ?? []).map((p) => ({ value: p.name, label: p.name })),
  ]

  const shown = list.data?.matches.length ?? 0
  const total = list.data?.total

  return (
    <Shell nav="matches" ctx="select">
      <PageHead
        title={<h1>{live ? 'Matches' : `Season ${season?.number ?? ''} matches`}</h1>}
        end={
          <Link className="btn sm" to={href('/leaderboard')}>
            Leaderboard →
          </Link>
        }
        sub={
          season
            ? live
              ? `Every match played in ${game?.name ?? slug} season ${season.number}, newest first. ${num(season.matches_played)} so far.`
              : `Every match season ${season.number} played, newest first. ${num(season.matches_played)} in total, all of them final.`
            : undefined
        }
      />

      <section className="wrap" style={{ paddingTop: 28 }}>
        <div className="filterbar">
          <LabelledSelect label="Ladder" id="f-ladder" value={ladder} options={ladderOptions} onChange={(v) => setFilter('ladder', v)} />
          <LabelledSelect label="Class" id="f-class" value={klass} options={classOptions} onChange={(v) => setFilter('class', v)} />
          <LabelledSelect label="Preset" id="f-preset" value={preset} options={presetOptions} onChange={(v) => setFilter('preset', v)} />
          <LabelledSelect label="Outcome" id="f-outcome" value={outcome} options={OUTCOMES} onChange={(v) => setFilter('outcome', v)} />
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
            <span className="muted" style={{ marginLeft: 'auto', font: '12px var(--font-mono)' }}>
              {shown ? `showing ${num(shown)}` : null}
            </span>
          </CardFoot>
        </Card>
      </section>
    </Shell>
  )
}
