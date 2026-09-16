// `/models/{id}` — one model, and every version of it.
//
// THE PERMALINK IS THE ID. It used to be the repository, on the argument that anyone with a GitHub
// link could construct the URL and that it read better than a uuid. Both were true, and both cost
// a repository per entry that limited nothing — so an entry is a name now, and a name is a
// competitor's own words: theirs to edit, and not something a permalink can be built on.
//
// Public, like the version permalink under it: a ladder nobody can audit is not a ladder.
// The version list IS the page — a model's history is the one thing that could not be shown at
// all while an entry and a version were the same row.

import { Link, useParams } from 'react-router-dom'
import { api, type VersionSummary } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { bytes, date, rating as fmtRating } from '../lib/format'
import { Shell } from '../components/Shell'
import { ClassBox, OwnerLink, StatusPill } from '../components/Model'
import {
  Card, CardBody, CardHead, type Column, DataTable, Empty, PageHead, Pill,
} from '../components/ui'
import { Permalink } from '../components/Permalink'
import { versionPath } from '../lib/paths'

export default function ModelPage() {
  const { id = '' } = useParams()
  const { me } = useSession()
  const model = useApi(`model:${id}`, () => api.model(id))

  return (
    <Permalink result={model} kind="model" label="This model">
      {(m) => {
        const mine = me?.handle === m.owner_handle
        const active = m.versions.find((v) => v.status === 'active') ?? null
        const columns: Column<VersionSummary>[] = [
          {
            key: 'version',
            head: '#',
            cell: (v) => <Link to={versionPath(m.model_id, v.version)}>v{v.version}</Link>,
          },
          { key: 'status', head: 'Status', cell: (v) => <StatusPill status={v.status} /> },
          {
            key: 'class',
            head: 'Class',
            cell: (v) => (
              <>
                <ClassBox k={v.class} /> {v.class ?? '—'}
              </>
            ),
          },
          // bytes(), not cap(): cap() rounds, because a cap is a round number. A MEASURED size is
          // not, and 5.9 KiB reading as 6 KiB here and as 5.9 KiB on every other page is two pages
          // disagreeing about the one number the contest is about.
          { key: 'size', head: 'Size', cell: (v) => bytes(v.size_bytes) },
          {
            key: 'open',
            head: 'Open',
            cell: (v) => (v.ratings?.open ? fmtRating(v.ratings.open.rating) : '—'),
          },
          { key: 'season', head: 'Season', cell: (v) => v.season },
          { key: 'entered', head: 'Entered', cell: (v) => date(v.created_at) },
        ]

        // A PERMALINK'S STRIP IS READ-ONLY, as the version and match pages draw it: this page is
        // about one entry and reads no season, so a live season dropdown here changed nothing but
        // the tab's title.
        return (
          <Shell ctx="read" title={m.model}>
            {/* PageHead is its own .wrap; inside another it would sit 24px in from everything else. */}
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
                  A model of <OwnerLink handle={m.owner_handle} />. Its versions replace one
                  another; a competitor’s other models are their own lineages and are not affected
                  by what happens here.
                </>
              }
              end={
                mine ? (
                  <Link
                    className="btn"
                    to={`/submit?game=${m.game}&model=${encodeURIComponent(m.model_id)}`}
                  >
                    Submit a version
                  </Link>
                ) : null
              }
            />

            <section className="wrap sec tight">
              <Card>
                <CardHead
                  title={<h2>Versions</h2>}
                  end={<span className="muted note-mono">{m.versions.length} entered</span>}
                />
                <CardBody>
                  {m.versions.length === 0 ? (
                    <Empty>No versions entered under this model yet.</Empty>
                  ) : (
                    <DataTable columns={columns} rows={m.versions} rowKey={(v) => v.version_id} />
                  )}
                </CardBody>
              </Card>
            </section>
          </Shell>
        )
      }}
    </Permalink>
  )
}
