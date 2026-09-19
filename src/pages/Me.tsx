// Your models: everything a competitor acts on. What is still in progress, each model with the
// version that plays for it, retired models folded away, and your own matches — trials and
// queued pairings included, which only you can see.

import { Link, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { ApiError, api, type MyModel } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { usePlatform } from '../providers/platform-context'
import { ago, bytes, rating as fmtRating } from '../lib/format'
import { modelPath, versionPath } from '../lib/paths'
import { versionSteps } from '../lib/steps'
import { Shell } from '../components/Shell'
import { DataTable, Field, Loading, Notice, PageHeader, Panel, PanelBody, PanelFoot, PanelHead, Section, StepTracker, type Column } from '../components/ui'
import { ClassBadge, VersionBadge } from '../components/Model'
import { MatchList } from '../components/MatchRow'
import { AuthGate, InlineError } from '../components/ErrorStates'

export default function Me() {
  const { me, session } = useSession()
  const { slug, gameName, season } = usePlatform()
  const [search, setSearch] = useSearchParams()
  const making = search.get('new') === '1'
  const models = useApi(`my-models:${slug}:${me?.id ?? ''}`, () => api.myModels(slug), Boolean(me))
  const matches = useApi(`my-mx:${slug}:${me?.id ?? ''}`, () => api.myMatches({ game: slug, limit: 8 }), Boolean(me))

  if (session.state === 'loading') {
    return (
      <Shell title="Your models">
        <section className="wrap page-head">
          <Loading rows={3} label="Checking your session" />
        </section>
      </Shell>
    )
  }
  if (!me) {
    return (
      <Shell title="Your models">
        <AuthGate title="Your models are yours to see." preview="Every model you hold, what is still in admission, and a Submit button on each." />
      </Shell>
    )
  }

  const rows = models.data ?? []
  const active = rows.filter((m) => !m.retired)
  const retired = rows.filter((m) => m.retired)
  const inFlight = rows.flatMap((m) => m.versions.filter((v) => v.status === 'testing' || v.status === 'verified').map((v) => ({ m, v })))
  const setMaking = (on: boolean) => {
    const q = new URLSearchParams(search)
    if (on) q.set('new', '1')
    else q.delete('new')
    setSearch(q)
  }

  return (
    <Shell title="Your models">
      <PageHeader
        crumbs={[{ label: `@${me.handle}`, to: `/profile/${me.handle}` }, { label: 'Your models' }]}
        title="Your models"
        sub={`${gameName}${season ? ` · ${season.name}` : ''}. Versions still in admission and rejections are listed here and nowhere public.`}
        actions={
          <>
            <button className="btn" type="button" onClick={() => setMaking(true)}>
              New model
            </button>
            <Link className="btn primary" to="/submit">
              Submit a version
            </Link>
          </>
        }
      />
      <div className="wrap page-body stack">
        {making ? <NewModel game={slug} onDone={() => { setMaking(false); models.reload() }} onCancel={() => setMaking(false)} /> : null}

        {inFlight.length ? (
          <Section title="In progress" sub="one version per model goes through admission at a time">
            <div className="two">
              {inFlight.map(({ m, v }) => (
                <Panel key={v.version_id}>
                  <PanelHead
                    title={
                      <h3>
                        <Link to={versionPath(m.id, v.version)}>
                          {m.name} v{v.version}
                        </Link>
                      </h3>
                    }
                    end={<VersionBadge status={v.status} />}
                  />
                  <PanelBody>
                    <StepTracker
                      steps={versionSteps(v.status)}
                      say={
                        v.status === 'verified'
                          ? `Admitted and measured${v.size_bytes ? ` at ${bytes(v.size_bytes)}` : ''}${v.class ? ` into ${v.class}` : ''}. Its trial against a baseline is queued; losing it is fine.`
                          : 'Fetching the files, checking the hashes and measuring it into a class.'
                      }
                    />
                  </PanelBody>
                </Panel>
              ))}
            </div>
          </Section>
        ) : null}

        <Section title="Models">
          <Panel>
            {models.state === 'error' ? (
              <InlineError error={models.error} what="Your models" />
            ) : (
              <ModelsTable rows={active} state={models.state} onChanged={models.reload} empty={`You have no models in ${gameName} yet. A model is a name — make one, then submit its first version.`} />
            )}
            {retired.length ? (
              <PanelFoot>
                <details style={{ width: '100%' }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>Retired ({retired.length})</summary>
                  <p className="hint" style={{ margin: '8px 0' }}>
                    These take no new versions. Everything they played keeps its rating, and reviving one costs a click.
                  </p>
                  <ModelsTable rows={retired} state="ready" onChanged={models.reload} empty="" />
                </details>
              </PanelFoot>
            ) : null}
          </Panel>
        </Section>

        <Section
          icon="i-matches"
          title="Your recent matches"
          sub="including trials and queued pairings, which only you can see"
          more={{ label: 'All your matches', icon: 'i-matches', to: '/matches?mine=1' }}
        >
          <Panel>
            <MatchList
              state={matches.state}
              matches={matches.data?.matches ?? []}
              grouped
              you={me.handle}
              empty="None of your models has played yet. A version starts playing once it passes its trial."
            />
          </Panel>
        </Section>
      </div>
    </Shell>
  )
}

function ModelsTable({ rows, state, onChanged, empty }: { rows: MyModel[]; state: 'loading' | 'ready' | 'error'; onChanged: () => void; empty: string }) {
  const columns: Column<MyModel>[] = [
    {
      key: 'model',
      head: 'Model',
      cell: (m) => (
        <span className="who">
          <Link className="model" to={modelPath(m.id)}>
            {m.name}
          </Link>
          <small>
            {m.versions.length} version{m.versions.length === 1 ? '' : 's'}
          </small>
        </span>
      ),
    },
    {
      key: 'playing',
      head: 'Playing',
      cell: (m) => {
        const v = m.versions.find((x) => x.status === 'active')
        const flight = m.versions.find((x) => x.status === 'testing' || x.status === 'verified')
        return (
          <span className="row" style={{ gap: 8 }}>
            {v ? <Link to={versionPath(m.id, v.version)}>v{v.version}</Link> : <span className="muted">—</span>}
            {flight ? <VersionBadge status={flight.status} /> : null}
          </span>
        )
      },
    },
    { key: 'class', head: 'Class', wideOnly: true, cell: (m) => <ClassBadge k={m.versions.find((x) => x.status === 'active')?.class ?? m.versions[0]?.class} /> },
    {
      key: 'open',
      head: 'Open',
      align: 'right',
      cell: (m) => {
        const r = m.versions.find((x) => x.status === 'active')?.ratings.open
        return r ? (
          <>
            <span className="lead">{fmtRating(r.rating)}</span> <span className="muted">#{r.rank}</span>
          </>
        ) : (
          <span className="muted">—</span>
        )
      },
    },
    { key: 'last', head: 'Last played', wideOnly: true, className: 'muted', cell: (m) => ago(m.versions.find((x) => x.status === 'active')?.last_played_at) },
    {
      key: 'act',
      head: '',
      align: 'right',
      cell: (m) => (
        <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
          {m.retired ? null : (
            <Link className="btn sm" to={`/submit?model=${encodeURIComponent(m.id)}`}>
              Submit
            </Link>
          )}
          <RetireButton modelId={m.id} retired={m.retired} onDone={onChanged} />
        </span>
      ),
    },
  ]
  return <DataTable columns={columns} rows={rows} state={state} loadingRows={3} rowKey={(m) => m.id} rowClass={(m) => (m.retired ? 'retired' : undefined)} empty={empty} />
}

function RetireButton({ modelId, retired, onDone }: { modelId: string; retired: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const toggle = async () => {
    setBusy(true)
    setErr(null)
    try {
      await api.updateModel(modelId, { retired: !retired })
      onDone()
    } catch (e) {
      setErr(e instanceof ApiError ? e.code : 'that did not work')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button className="btn sm ghost" type="button" disabled={busy} onClick={() => void toggle()}>
        {retired ? 'Revive' : 'Retire'}
      </button>
      {err ? <span className="form-error">{err}</span> : null}
    </>
  )
}

function NewModel({ game, onDone, onCancel }: { game: string; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const create = async () => {
    setBusy(true)
    setErr(null)
    try {
      await api.createModel(game, { name: name.trim() })
      setName('')
      onDone()
    } catch (e) {
      setErr(e instanceof ApiError ? said(e.code) : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel>
      <PanelHead
        title="New model"
        end={
          <button className="btn sm ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        }
      />
      <PanelBody>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <Field label="Name" htmlFor="m-name" hint="What you call it. Yours to change later; another competitor may use the same name.">
            <input className="input" id="m-name" autoComplete="off" autoFocus value={name} placeholder="Nano probe" onChange={(e) => setName(e.target.value)} />
          </Field>
          {err ? <Notice tone="bad" title="Not created.">{<p>{err}</p>}</Notice> : null}
          <div>
            <button className="btn primary" type="submit" disabled={busy || !name.trim()}>
              Create model
            </button>
          </div>
        </form>
      </PanelBody>
    </Panel>
  )
}

function said(code: string): string {
  switch (code) {
    case 'model_name_taken':
      return 'You already have a model with that name. Another competitor may use the same one; yours have to differ.'
    case 'entries_max':
      return 'You are at this season’s limit for how many models one competitor may hold. Retire one to free a slot.'
    case 'not_a_participant':
      return 'This season is open to a named list of accounts, and yours is not on it.'
    case 'name_required':
      return 'A name is required.'
    default:
      return code
  }
}
