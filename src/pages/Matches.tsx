// Every match of the selected season, newest first, grouped by day, filterable. A match seats
// 2 to 8 models — the map decides — and every row has one layout whatever the count.

import { api, type MatchFilters } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection, useQueryState } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Icon, PageHeader, Pagination, Panel, PanelFoot, PanelHead, Segmented, Select, type Option } from '../components/ui'
import { MatchList } from '../components/MatchRow'

const PAGE = 25
const FILTERS = ['players', 'ladder', 'class', 'map', 'outcome'] as const
const PLAYERS: Record<string, [number, number]> = { '2': [2, 2], '3-4': [3, 4], '5-8': [5, 8] }
const OUTCOMES: Option[] = [
  { value: '', label: 'Any' },
  { value: 'decided', label: 'Decided' },
  { value: 'drawn', label: 'A shared place' },
  { value: 'dq', label: 'A seat disqualified' },
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
    <Shell nav="matches" scoped title="Matches">
      <PageHeader
        crumbs={[{ label: season ? `${gameName} · ${season.name}` : gameName, to: href('/') }, { label: 'Matches', icon: 'i-matches' }]}
        title={live || !season ? 'Matches' : `${season.name} matches`}
        icon="i-matches"
        sub="Every match of the season, newest first. A match seats 2 to 8 models — the map decides — and every row shows up to four players in finishing order."
      />
      <div className="wrap page-body">
        <Panel>
          <PanelHead
            title={
              <div className="filters">
                {mine ? null : (
                  <>
                    {pick('players', 'Players', [
                      { value: '', label: 'Any' },
                      { value: '2', label: 'Head to head (2)' },
                      { value: '3-4', label: '3–4 players' },
                      { value: '5-8', label: '5–8 players' },
                    ])}
                    {pick('ladder', 'Ladder', [{ value: '', label: 'Any' }, { value: 'open', label: 'Open' }, ...classOptions])}
                    {pick('class', 'Class', [{ value: '', label: 'Any' }, ...classOptions])}
                    {pick('map', 'Map', [
                      { value: '', label: 'Any' },
                      ...(boards.data?.maps ?? []).map((b) => ({
                        value: b.map_id,
                        label: b.map_id,
                        hint: `${b.players} players${b.enabled ? '' : ' · disabled'}`,
                      })),
                    ])}
                    {pick('outcome', 'Outcome', OUTCOMES)}
                  </>
                )}
                {me ? (
                  <Segmented
                    label="Whose matches"
                    value={mine ? 'mine' : 'all'}
                    onChange={(v) => setParam({ mine: v === 'mine' ? '1' : '', cursor: '' })}
                    items={[
                      { key: 'all', label: 'All' },
                      { key: 'mine', label: 'Mine' },
                    ]}
                  />
                ) : null}
                {scope && !mine ? (
                  <button className="btn sm" type="button" onClick={() => setParam({ [scope]: '', cursor: '' })} aria-label={`Stop showing only this ${scope}'s matches`}>
                    {scope === 'owner' ? `@${param('owner')}` : `One ${scope}`}
                    <Icon id="i-x" />
                  </button>
                ) : null}
                {filtered && !mine ? (
                  <button className="btn sm ghost" type="button" onClick={clear}>
                    <Icon id="i-x" />
                    Clear
                  </button>
                ) : null}
              </div>
            }
            end={list.data?.total != null ? <span className="num">{num(list.data.total)} matches</span> : null}
          />
          <MatchList
            state={list.state}
            matches={list.data?.matches ?? []}
            grouped
            you={me?.handle}
            loadingRows={8}
            empty={
              filtered && !mine ? (
                <>
                  No match in this season fits these filters.{' '}
                  <button className="btn sm" type="button" onClick={clear}>
                    Clear them
                  </button>
                </>
              ) : mine ? (
                'None of your models has played yet. A version starts playing once it passes its trial.'
              ) : (
                'No match has been played in this season yet.'
              )
            }
          />
          {list.data?.next_cursor || cursor ? (
            <PanelFoot>
              <Pagination
                onNext={list.data?.next_cursor ? () => setParam({ cursor: list.data?.next_cursor ?? '' }) : null}
                onStart={cursor ? () => setParam({ cursor: '' }) : null}
                nextLabel="Older matches"
                startLabel="Newest"
              />
            </PanelFoot>
          ) : null}
        </Panel>
      </div>
    </Shell>
  )
}
