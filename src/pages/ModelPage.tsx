// A model: a lineage of versions under one name. Its versions replace one another; its owner's
// other models are their own lineages. A model belongs to a person, not a season, so its
// breadcrumbs go through the owner.

import { Link, useParams } from 'react-router-dom'
import { api, type ModelDetail, type VersionSummary } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { usePlatform } from '../providers/platform-context'
import { bytes, date, num, rating as fmtRating } from '../lib/format'
import { versionPath } from '../lib/paths'
import { fill } from '../lib/copy'
import { Shell } from '../components/Shell'
import { Badge, DataTable, IconLabel, PageHeader, Panel, PanelFoot, Rich, Section, StatGrid, type Column } from '../components/ui'
import { ClassBadge, ClassIcon, VersionBadge } from '../components/Model'
import { MatchList } from '../components/MatchRow'
import { Permalink } from '../components/Permalink'
import T from '../../copy/model.json'

const H = T.versions.head

export default function ModelPage() {
  const { id = '' } = useParams()
  const model = useApi(`model:${id}`, () => api.model(id))
  return (
    <Permalink result={model} kind="model" label={T.loading}>
      {(m) => <ModelDetailPage m={m} />}
    </Permalink>
  )
}

function ModelDetailPage({ m }: { m: ModelDetail }) {
  const { me } = useSession()
  const { seasonName } = usePlatform()
  const mine = me?.handle === m.owner_handle
  const playing = m.versions.find((v) => v.status === 'active') ?? null
  const matches = useApi(`model-mx:${m.model_id}`, () => api.matches({ model: m.model_id, limit: 6 }))
  const open = playing?.ratings.open
  const klass = playing?.class ? playing.ratings[playing.class] : undefined

  const columns: Column<VersionSummary>[] = [
    { key: 'v', head: H.version, cell: (v) => <Link to={versionPath(m.model_id, v.version)}>v{v.version}</Link> },
    { key: 'status', head: H.status, cell: (v) => <VersionBadge status={v.status} /> },
    { key: 'class', head: H.class, wideOnly: true, cell: (v) => <ClassBadge k={v.class} /> },
    { key: 'size', head: H.size, align: 'right', wideOnly: true, cell: (v) => bytes(v.size_bytes) },
    { key: 'open', head: H.open, align: 'right', cell: (v) => (v.ratings?.open ? fmtRating(v.ratings.open.rating) : '—') },
    { key: 'season', head: H.season, align: 'right', wideOnly: true, cell: (v) => seasonName(v.season) },
    { key: 'entered', head: H.entered, wideOnly: true, className: 'muted', cell: (v) => date(v.created_at) },
  ]

  return (
    <Shell title={m.model}>
      <PageHeader
        crumbs={[
          m.baseline ? { label: T.crumbBaselines, to: `/profile/${m.owner_handle}` } : { label: `@${m.owner_handle}`, to: `/profile/${m.owner_handle}` },
          { label: m.model },
        ]}
        title={
          <>
            <ClassIcon k={playing?.class} /> {m.model}
          </>
        }
        badges={
          <>
            {m.baseline ? <Badge tone="info">{T.badges.baseline}</Badge> : null}
            {m.retired ? <Badge tone="off">{T.badges.retired}</Badge> : null}
          </>
        }
        actions={
          mine && !m.retired ? (
            <Link className="btn primary sm" to={`/submit?game=${m.game}&model=${encodeURIComponent(m.model_id)}`}>
              {T.submit}
            </Link>
          ) : null
        }
        sub={<Rich text={T.sub} vars={{ owner: <Link to={`/profile/${m.owner_handle}`}>@{m.owner_handle}</Link> }} />}
      />
      <div className="wrap page-body stack">
        <StatGrid
          boxed
          items={[
            {
              label: T.stats.playing,
              value: playing ? <Link to={versionPath(m.model_id, playing.version)}>v{playing.version}</Link> : <small>{T.stats.none}</small>,
            },
            {
              label: T.stats.open,
              value: open ? <>{fmtRating(open.rating)} <small>{fill(T.stats.rankOf, { rank: open.rank, field: open.field })}</small></> : <small>{T.stats.notRated}</small>,
            },
            {
              label: playing?.class ? fill(T.stats.class, { class: playing.class }) : T.stats.classNone,
              value: klass ? <>{fmtRating(klass.rating)} <small>{fill(T.stats.rankOf, { rank: klass.rank, field: klass.field })}</small></> : <small>{T.stats.notRated}</small>,
            },
            { label: T.stats.matches, icon: 'i-matches', value: num(open?.matches ?? 0) },
            { label: T.stats.versions, value: m.versions.length },
          ]}
        />
        <Section title={T.versions.title} sub={mine ? T.versions.subMine : T.versions.sub}>
          <Panel>
            <DataTable
              columns={columns}
              rows={m.versions}
              rowKey={(v) => v.version_id}
              rowClass={(v) => (v.status === 'active' ? 'you' : undefined)}
              empty={T.versions.empty}
            />
          </Panel>
        </Section>
        <Section icon="i-matches" title={T.matches.title}>
          <Panel>
            <MatchList state={matches.state} matches={matches.data?.matches ?? []} you={me?.handle} empty={T.matches.empty} />
            <PanelFoot>
              <Link to={`/matches?model=${m.model_id}`}>
                <IconLabel icon="i-matches">{T.matches.all}</IconLabel>
              </Link>
            </PanelFoot>
          </Panel>
        </Section>
      </div>
    </Shell>
  )
}
