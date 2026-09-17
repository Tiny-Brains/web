// A model: a lineage of versions under one name. Its versions replace one another; its owner's
// other models are their own lineages. A model belongs to a person, not a season, so its
// breadcrumbs go through the owner.

import { Link, useParams } from 'react-router-dom'
import { api, type ModelDetail, type VersionSummary } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { bytes, date, num, rating as fmtRating } from '../lib/format'
import { versionPath } from '../lib/paths'
import { Shell } from '../components/Shell'
import { Badge, DataTable, PageHeader, Panel, PanelFoot, Section, StatGrid, type Column } from '../components/ui'
import { ClassBadge, ClassIcon, VersionBadge } from '../components/Model'
import { MatchList } from '../components/MatchRow'
import { Permalink } from '../components/Permalink'

export default function ModelPage() {
  const { id = '' } = useParams()
  const model = useApi(`model:${id}`, () => api.model(id))
  return (
    <Permalink result={model} kind="model" label="Loading the model">
      {(m) => <ModelDetailPage m={m} />}
    </Permalink>
  )
}

function ModelDetailPage({ m }: { m: ModelDetail }) {
  const { me } = useSession()
  const mine = me?.handle === m.owner_handle
  const playing = m.versions.find((v) => v.status === 'active') ?? null
  const matches = useApi(`model-mx:${m.model_id}`, () => api.matches({ model: m.model_id, limit: 6 }))
  const open = playing?.ratings.open
  const klass = playing?.class ? playing.ratings[playing.class] : undefined

  const columns: Column<VersionSummary>[] = [
    { key: 'v', head: 'Version', cell: (v) => <Link to={versionPath(m.model_id, v.version)}>v{v.version}</Link> },
    { key: 'status', head: 'Status', cell: (v) => <VersionBadge status={v.status} /> },
    { key: 'class', head: 'Class', wideOnly: true, cell: (v) => <ClassBadge k={v.class} /> },
    { key: 'size', head: 'Size', align: 'right', wideOnly: true, cell: (v) => bytes(v.size_bytes) },
    { key: 'open', head: 'Open', align: 'right', cell: (v) => (v.ratings?.open ? fmtRating(v.ratings.open.rating) : '—') },
    { key: 'season', head: 'Season', align: 'right', wideOnly: true, cell: (v) => v.season },
    { key: 'entered', head: 'Entered', wideOnly: true, className: 'muted', cell: (v) => date(v.created_at) },
  ]

  return (
    <Shell title={m.model}>
      <PageHeader
        crumbs={[
          m.baseline ? { label: 'Baselines', to: `/profile/${m.owner_handle}` } : { label: `@${m.owner_handle}`, to: `/profile/${m.owner_handle}` },
          { label: m.model },
        ]}
        title={
          <>
            <ClassIcon k={playing?.class} /> {m.model}
          </>
        }
        badges={
          <>
            {m.baseline ? <Badge tone="info">Baseline</Badge> : null}
            {m.retired ? <Badge tone="off">Retired</Badge> : null}
          </>
        }
        actions={
          mine && !m.retired ? (
            <Link className="btn primary sm" to={`/submit?game=${m.game}&model=${encodeURIComponent(m.model_id)}`}>
              Submit a version
            </Link>
          ) : null
        }
        sub={
          <>
            A model by <Link to={`/profile/${m.owner_handle}`}>@{m.owner_handle}</Link>. Its versions replace one another; one plays at a time.
          </>
        }
      />
      <div className="wrap page-body stack">
        <StatGrid
          boxed
          items={[
            {
              label: 'playing now',
              value: playing ? <Link to={versionPath(m.model_id, playing.version)}>v{playing.version}</Link> : <small>none</small>,
            },
            { label: 'Open rating', value: open ? <>{fmtRating(open.rating)} <small>#{open.rank} of {open.field}</small></> : <small>not rated</small> },
            {
              label: playing?.class ? `${playing.class} rating` : 'class rating',
              value: klass ? <>{fmtRating(klass.rating)} <small>#{klass.rank} of {klass.field}</small></> : <small>not rated</small>,
            },
            { label: 'matches', value: num(open?.matches ?? 0) },
            { label: 'versions', value: m.versions.length },
          ]}
        />
        <Section title="Versions" sub={mine ? 'including the ones only you can see' : 'newest first'}>
          <Panel>
            <DataTable
              columns={columns}
              rows={m.versions}
              rowKey={(v) => v.version_id}
              rowClass={(v) => (v.status === 'active' ? 'you' : undefined)}
              empty="No versions entered under this model yet."
            />
          </Panel>
        </Section>
        <Section title="Recent matches">
          <Panel>
            <MatchList state={matches.state} matches={matches.data?.matches ?? []} you={me?.handle} empty="None of its versions has played yet." />
            <PanelFoot>
              <Link to={`/matches?model=${m.model_id}`}>All matches →</Link>
            </PanelFoot>
          </Panel>
        </Section>
      </div>
    </Shell>
  )
}
