// Every match of the selected season, newest first, grouped by day, filterable. A match seats
// 2 to 8 models — the map decides — and every row has one layout whatever the count.

import { api, type MatchFilters } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection, useQueryState } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Icon, PageHeader, Pagination, Panel, PanelFoot, PanelHead, Rich, Segmented, Select, type Option } from '../components/ui'
import { MatchList } from '../components/MatchRow'
import { fill } from '../lib/copy'
import T from '../../copy/matches.json'

const PAGE = 25
const FILTERS = ['players', 'ladder', 'class', 'map', 'outcome'] as const
const PLAYERS: Record<string, [number, number]> = { '2': [2, 2], '3-4': [3, 4], '5-8': [5, 8] }
const F = T.filters
const OUTCOMES: Option[] = [
  { value: '', label: F.any },
  { value: 'decided', label: F.outcome.decided },
  { value: 'drawn', label: F.outcome.drawn },
  { value: 'dq', label: F.outcome.dq },
]

export default function Matches() {
  const { season, live, slug, gameName } = usePlatform()
  const { href, season: wanted } = useSelection()
  const { me } = useSession()
  const [param, setParam] = useQueryState()
  const classes = useWeightClasses()
  const cursor = param('cursor') || null
  const mine = Boolean(me) && param('mine') === '1'
  const [players, ladder, klass, map, outcome] = FILTERS.map(param)
  const filtered = FILTERS.some((k) => param(k))
  const setFilter = (values: Record<string, string>) => setParam({ ...values, cursor: '' })
  const clear = () => setFilter(Object.fromEntries(FILTERS.map((k) => [k, ''])))

  const [pmin, pmax] = PLAYERS[players] ?? [null, null]
  // Narrowed from another page: one model's, one version's or one person's matches.
  const scope = (['model', 'version', 'owner'] as const).find((k) => param(k))
  const filters: MatchFilters = {
    model: param('model') || null,
    version: param('version') || null,
    owner: param('owner') || null,
    game: slug,
    season: wanted,
    ladder: ladder || null,
    class: klass || null,
    map: map || null,
    outcome: (outcome || null) as MatchFilters['outcome'],
    players_min: pmin,
    players_max: pmax,
    cursor,
    limit: PAGE,
  }
  // Your own matches are their own route, never a flag on the public one.
  const list = useApi(`mx:${mine}:${JSON.stringify(filters)}`, () =>
    mine ? api.myMatches({ game: slug, cursor, limit: PAGE }) : api.matches(filters),
  )
  const classOptions = classes.map((c) => ({ value: c.class, label: c.class }))
  // Every board the season has, disabled ones included: matches were played on them, and a board
  // taken out of play is still one somebody wants to find their matches on.
  const boards = useApi(`mx-maps:${slug}:${season?.slug ?? ''}`, () => api.seasonMaps(slug, season!.slug), Boolean(season))
  const pick = (key: string, label: string, options: Option[]) => (
    <Select look="pick" prefix={label} label={label} value={param(key)} options={options} onChange={(v) => setFilter({ [key]: v })} />
  )

  return (
    <Shell nav="matches" scoped title={T.title}>
      <PageHeader
        crumbs={[{ label: season ? `${gameName} · ${season.name}` : gameName, to: href('/') }, { label: T.title, icon: 'i-matches' }]}
        title={live || !season ? T.title : fill(T.titleSeason, { season: season.name })}
        icon="i-matches"
        sub={T.sub}
      />
      <div className="wrap page-body">
        <Panel>
          <PanelHead
            title={
              <div className="filters">
                {mine ? null : (
                  <>
                    {pick('players', F.players.label, [
                      { value: '', label: F.any },
                      { value: '2', label: F.players.two },
                      { value: '3-4', label: F.players.threeToFour },
                      { value: '5-8', label: F.players.fiveToEight },
                    ])}
                    {pick('ladder', F.ladder.label, [{ value: '', label: F.any }, { value: 'open', label: F.ladder.open }, ...classOptions])}
                    {pick('class', F.class.label, [{ value: '', label: F.any }, ...classOptions])}
                    {pick('map', F.map.label, [
                      { value: '', label: F.any },
                      ...(boards.data?.maps ?? []).map((b) => ({
                        value: b.map_id,
                        label: b.map_id,
                        hint: fill(b.enabled ? F.map.hint : F.map.hintDisabled, { n: b.players }),
                      })),
                    ])}
                    {pick('outcome', F.outcome.label, OUTCOMES)}
                  </>
                )}
                {me ? (
                  <Segmented
                    label={T.whose.label}
                    value={mine ? 'mine' : 'all'}
                    onChange={(v) => setParam({ mine: v === 'mine' ? '1' : '', cursor: '' })}
                    items={[
                      { key: 'all', label: T.whose.all },
                      { key: 'mine', label: T.whose.mine },
                    ]}
                  />
                ) : null}
                {scope && !mine ? (
                  <button className="btn sm" type="button" onClick={() => setParam({ [scope]: '', cursor: '' })} aria-label={T.scope.stop[scope]}>
                    {scope === 'owner' ? `@${param('owner')}` : T.scope.label[scope]}
                    <Icon id="i-x" />
                  </button>
                ) : null}
                {filtered && !mine ? (
                  <button className="btn sm ghost" type="button" onClick={clear}>
                    <Icon id="i-x" />
                    {T.clear}
                  </button>
                ) : null}
              </div>
            }
            end={list.data?.total != null ? <span className="num">{fill(T.total, { n: num(list.data.total) })}</span> : null}
          />
          <MatchList
            state={list.state}
            matches={list.data?.matches ?? []}
            grouped
            you={me?.handle}
            loadingRows={8}
            empty={
              filtered && !mine ? (
                <Rich
                  text={T.empty.filtered}
                  vars={{
                    clear: (
                      <button className="btn sm" type="button" onClick={clear}>
                        {T.empty.clear}
                      </button>
                    ),
                  }}
                />
              ) : mine ? (
                T.empty.mine
              ) : (
                T.empty.none
              )
            }
          />
          {list.data?.next_cursor || cursor ? (
            <PanelFoot>
              <Pagination
                onNext={list.data?.next_cursor ? () => setParam({ cursor: list.data?.next_cursor ?? '' }) : null}
                onStart={cursor ? () => setParam({ cursor: '' }) : null}
                nextLabel={T.pager.next}
                startLabel={T.pager.start}
              />
            </PanelFoot>
          ) : null}
        </Panel>
      </div>
    </Shell>
  )
}
