import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform } from '../providers/platform-context'
import { useSelection } from '../lib/selection'
import { useCopy } from '../lib/lang'
import { fill } from '../lib/copy'
import { num } from '../lib/format'
import { Shell } from '../components/Shell'
import { EmptyState, PageHeader, Panel, PanelBody, PanelHead, Skeleton } from '../components/ui'
import { ModelLink, SeasonBadge } from '../components/Model'
import { InlineError } from '../components/ErrorStates'
import { useSeasonWall } from '../components/SeasonWall'
import en from '../../copy/en-GB/evaluations.json'

/** A point from the API's ten-thousand-unit integers, or a dash for a run that did not score. */
function points(units: number | null | undefined): string {
  return units == null ? '—' : (units / 10000).toFixed(3)
}

/** A calibrated component in its own ppm, which is the contract's unit and not a percentage. */
function ppm(value: number | null | undefined): string {
  return value == null ? '—' : num(Math.round(value))
}

/**
 * `/evaluations` — a season's open evaluation suites and their published standings.
 *
 * One-seat games are not ranked by a ladder, so this page reads Soma's evaluation aggregate instead:
 * every version's total and mean over the prescribed visits, its calibrated components, and the run
 * behind each visit. The suite is query state (`?suite=<slug>`), because a comparable set is a suite
 * and a season may hold more than one; without one the first open suite is shown.
 */
export default function Evaluations() {
  const T = useCopy('evaluations', en)
  const { season, slug, gameName, live, scope } = usePlatform()
  const { href } = useSelection()
  const [params, setParams] = useSearchParams()
  const wall = useSeasonWall()

  const list = useApi(
    `evaluations:${scope.key}:${season?.slug ?? ''}`,
    () => api.evaluations(slug, season!.slug),
    Boolean(season),
  )
  const suites = list.data?.suites ?? []
  const wanted = params.get('suite') ?? ''
  const active = suites.some((s) => s.slug === wanted) ? wanted : (suites[0]?.slug ?? '')
  const suite = suites.find((s) => s.slug === active) ?? null

  const board = useApi(
    `evaluation:${scope.key}:${season?.slug ?? ''}:${active}`,
    () => api.evaluation(slug, season!.slug, active),
    Boolean(season && active),
  )

  if (wall) return wall

  const choose = (next: string) => {
    const q = new URLSearchParams(params)
    if (next) q.set('suite', next)
    else q.delete('suite')
    setParams(q, { replace: true })
  }

  return (
    <Shell scoped title={T.title}>
      <PageHeader
        crumbs={[
          { label: season ? `${gameName} · ${season.name}` : gameName, to: href('/') },
          { label: T.title }, 
        ]}
        title={T.title}
        icon="i-table"
        sub={T.lede}
        badges={season && !live ? <SeasonBadge state={season.state} /> : null}
      />
      <div className="wrap page-body">
        <div className="stack">
          {list.state === 'error' ? (
            <InlineError error={list.error} what={T.failed} />
          ) : list.state === 'loading' || !season ? (
            <Skeleton h={140} />
          ) : suites.length === 0 ? (
            <EmptyState boxed>{T.noSuites}</EmptyState>
          ) : (
            <Panel className="eval-panel">
              <PanelHead
                title={
                  <div className="eval-head">
                    <label htmlFor="eval-suite">{T.suite}</label>
                    <select
                      id="eval-suite"
                      className="input"
                      value={active}
                      onChange={(e) => choose(e.target.value)}
                    >
                      {suites.map((s) => (
                        <option key={s.slug} value={s.slug}>
                          {s.slug}
                        </option>
                      ))}
                    </select>
                  </div>
                }
                end={
                  suite
                    ? `${fill(T.visits, { n: suite.visits })} · ${suite.scoring}`
                    : null
                }
              />
              <PanelBody>
                {board.state === 'error' ? (
                  <InlineError error={board.error} what={T.failed} />
                ) : board.state === 'loading' || !board.data ? (
                  <Skeleton h={160} />
                ) : board.data.models.length === 0 ? (
                  <EmptyState>{T.empty}</EmptyState>
                ) : (
                  <div className="eval-scroll">
                    <table className="table eval-table">
                      <thead>
                        <tr>
                          <th>{T.columns.rank}</th>
                          <th>{T.columns.model}</th>
                          <th className="num">{T.columns.visits}</th>
                          <th className="num">{T.columns.total}</th>
                          <th className="num">{T.columns.mean}</th>
                          <th className="num">{T.columns.coverage}</th>
                          <th className="num">{T.columns.mapping}</th>
                          <th className="num">{T.columns.energy}</th>
                          <th className="num">{T.columns.time}</th>
                          <th>{T.columns.runs}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {board.data.models.map((m) => (
                          <tr key={m.version_id}>
                            <td className="eval-rank">{m.rank}</td>
                            <td>
                              <ModelLink modelId={m.model_id} name={m.model} />
                              {m.complete ? null : <span className="eval-partial">{T.partial}</span>}
                            </td>
                            <td className="num">
                              {fill(T.visitsValue, {
                                committed: m.committed,
                                expected: board.data.expected_visits,
                              })}
                            </td>
                            <td className="num eval-total">{points(m.total)}</td>
                            <td className="num">{points(m.mean)}</td>
                            <td className="num">{ppm(m.components.coverage_ppm)}</td>
                            <td className="num">{ppm(m.components.mapping_ppm)}</td>
                            <td className="num">{ppm(m.components.energy_ppm)}</td>
                            <td className="num">{ppm(m.components.time_ppm)}</td>
                            <td>
                              <span className="eval-runs">
                                {m.runs.map((r) =>
                                  r.committed ? (
                                    <Link
                                      key={r.visit}
                                      className="eval-run"
                                      to={href(`/matches/${r.match_id}`)}
                                      title={fill(T.run, { n: r.visit, score: points(r.score) })}
                                    >
                                      {r.visit}
                                    </Link>
                                  ) : (
                                    <span
                                      key={r.visit}
                                      className="eval-run off"
                                      title={fill(T.uncommitted, { n: r.visit })}
                                    >
                                      {r.visit}
                                    </span>
                                  ),
                                )}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </PanelBody>
            </Panel>
          )}
        </div>
      </div>
    </Shell>
  )
}
