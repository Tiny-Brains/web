// `/{game}/models/{owner}/{repo}` — one model, and every version of it.
//
// THE PERMALINK IS THE REPOSITORY, because the repository is the entry's key. Anyone with a
// GitHub link can construct this URL, and it survives every rename — which a uuid path could
// claim too, but not readably.
//
// Public, like the version permalink under it: a ladder nobody can audit is not a ladder.
// The version list IS the page — a model's history is the one thing that could not be shown at
// all while an entry and a version were the same row.

import { Link, useParams } from 'react-router-dom'
import { api, type VersionSummary } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { cap, date, rating as fmtRating } from '../lib/format'
import { Shell } from '../components/Shell'
import { ClassBox, OwnerLink, StatusPill } from '../components/Model'
import {
  Card, CardBody, CardHead, type Column, DataTable, Empty, PageHead, Pill,
} from '../components/ui'
import { Permalink } from '../components/Permalink'

export default function ModelPage() {
  const { game = '', owner = '', repo = '' } = useParams()
  const { me } = useSession()
  const model = useApi(`model:${game}:${owner}/${repo}`, () => api.model(game, owner, repo))

  return (
    <Permalink result={model} kind="model" label="This model">
      {(m) => {
        const mine = me?.handle === m.owner_handle
        const active = m.versions.find((v) => v.status === 'active') ?? null
        const columns: Column<VersionSummary>[] = [
          {
            key: 'version',
            head: '#',
            cell: (v) => (
              <Link to={`/${game}/models/${m.repo}/v${v.version}`}>v{v.version}</Link>
            ),
          },
          { key: 'status', head: 'Status', cell: (v) => <StatusPill status={v.status} /> },
          { key: 'tag', head: 'Release', cell: (v) => v.release_tag ?? '—' },
          {
            key: 'class',
            head: 'Class',
            cell: (v) => (
              <>
                <ClassBox k={v.class} /> {v.class ?? '—'}
              </>
            ),
          },
          { key: 'size', head: 'Size', cell: (v) => (v.size_bytes == null ? '—' : cap(v.size_bytes)) },
          {
            key: 'open',
            head: 'Open',
            cell: (v) => (v.ratings?.open ? fmtRating(v.ratings.open.rating) : '—'),
          },
          { key: 'season', head: 'Season', cell: (v) => v.season },
          { key: 'entered', head: 'Entered', cell: (v) => date(v.created_at) },
        ]

        return (
          <Shell ctx="select">
            <div className="wrap sec">
              <PageHead
                title={
                  <h1>
                    <ClassBox k={active?.class} /> {m.model}
                  </h1>
                }
                badges={
                  <>
                    {m.baseline ? <Pill tone="ok">baseline</Pill> : null}
                    {m.retired ? <Pill tone="closed">retired</Pill> : null}
                  </>
                }
                sub={
                  <>
                    A model of <OwnerLink handle={m.owner_handle} />, published from{' '}
                    <a
                      href={`https://github.com/${m.repo}`}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      {m.repo}
                    </a>
                    . Its versions replace one another; a competitor’s other models are their own
                    lineages and are not affected by what happens here.
                  </>
                }
                end={
                  mine ? (
                    <Link
                      className="btn"
                      to={`/submit?game=${game}&model=${encodeURIComponent(m.repo)}`}
                    >
                      Submit a version
                    </Link>
                  ) : null
                }
              />

              <Card>
                <CardHead
                  title={<h2>Versions</h2>}
                  end={<span className="muted note-mono">{m.versions.length} entered</span>}
                />
                <CardBody>
                  {m.versions.length === 0 ? (
                    <Empty>
                      No releases entered from this repository yet.
                    </Empty>
                  ) : (
                    <DataTable columns={columns} rows={m.versions} rowKey={(v) => v.version_id} />
                  )}
                </CardBody>
              </Card>
            </div>
          </Shell>
        )
      }}
    </Permalink>
  )
}
