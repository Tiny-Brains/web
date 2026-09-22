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
import { count, fill, lookup } from '../lib/copy'
import { Shell } from '../components/Shell'
import { DataTable, Field, Loading, Notice, PageHeader, Panel, PanelBody, PanelFoot, PanelHead, Section, StepTracker, type Column } from '../components/ui'
import { ClassBadge, VersionBadge } from '../components/Model'
import { AskForHelp } from '../components/Help'
import { MatchList } from '../components/MatchRow'
import { AuthGate, InlineError } from '../components/ErrorStates'
import T from '../../copy/me.json'
import common from '../../copy/common.json'

const P = T.inProgress
const C = T.table
const F = T.newModelForm

export default function Me() {
  const { me, session } = useSession()
  const { slug, gameName, season } = usePlatform()
  const [search, setSearch] = useSearchParams()
  const making = search.get('new') === '1'
  const models = useApi(`my-models:${slug}:${me?.id ?? ''}`, () => api.myModels(slug), Boolean(me))
  const matches = useApi(`my-mx:${slug}:${me?.id ?? ''}`, () => api.myMatches({ game: slug, limit: 8 }), Boolean(me))

  if (session.state === 'loading') {
    return (
      <Shell title={T.title}>
        <section className="wrap page-head">
          <Loading rows={3} label={common.site.checkingSession} />
        </section>
      </Shell>
    )
  }
  if (!me) {
    return (
      <Shell title={T.title}>
        <AuthGate title={T.gate.title} preview={T.gate.preview} />
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
    <Shell title={T.title}>
      <PageHeader
        crumbs={[{ label: `@${me.handle}`, to: `/profile/${me.handle}` }, { label: T.title }]}
        title={T.title}
        sub={season ? fill(T.subSeason, { game: gameName, season: season.name }) : fill(T.sub, { game: gameName })}
        actions={
          <>
            <button className="btn" type="button" onClick={() => setMaking(true)}>
              {T.newModel}
            </button>
            <Link className="btn primary" to="/submit">
              {T.submit}
            </Link>
          </>
        }
      />
      <div className="wrap page-body stack">
        {making ? <NewModel game={slug} onDone={() => { setMaking(false); models.reload() }} onCancel={() => setMaking(false)} /> : null}

        {inFlight.length ? (
          <Section title={P.title} sub={P.sub}>
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
                          ? fill(v.size_bytes ? (v.class ? P.verifiedSizeClass : P.verifiedSize) : v.class ? P.verifiedClass : P.verified, {
                              size: bytes(v.size_bytes),
                              class: v.class ?? '',
                            })
                          : P.testing
                      }
                    />
                  </PanelBody>
                </Panel>
              ))}
            </div>
          </Section>
        ) : null}

        <Section title={T.models.title}>
          <Panel>
            {models.state === 'error' ? (
              <InlineError error={models.error} what={T.models.what} />
            ) : (
              <ModelsTable rows={active} state={models.state} onChanged={models.reload} empty={fill(T.models.empty, { game: gameName })} />
            )}
            {retired.length ? (
              <PanelFoot>
                <details style={{ width: '100%' }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>{fill(T.models.retired, { n: retired.length })}</summary>
                  <p className="hint" style={{ margin: '8px 0' }}>
                    {T.models.retiredHint}
                  </p>
                  <ModelsTable rows={retired} state="ready" onChanged={models.reload} empty="" />
                </details>
              </PanelFoot>
            ) : null}
          </Panel>
        </Section>

        <Section
          icon="i-matches"
          title={T.matches.title}
          sub={T.matches.sub}
          more={{ label: T.matches.all, icon: 'i-matches', to: '/matches?mine=1' }}
        >
          <Panel>
            <MatchList
              state={matches.state}
              matches={matches.data?.matches ?? []}
              grouped
              you={me.handle}
              empty={T.matches.empty}
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
      head: C.model,
      cell: (m) => (
        <span className="who">
          <Link className="model" to={modelPath(m.id)}>
            {m.name}
          </Link>
          <small>{count(C.versions, m.versions.length)}</small>
        </span>
      ),
    },
    {
      key: 'playing',
      head: C.playing,
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
    { key: 'class', head: C.class, wideOnly: true, cell: (m) => <ClassBadge k={m.versions.find((x) => x.status === 'active')?.class ?? m.versions[0]?.class} /> },
    {
      key: 'open',
      head: C.open,
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
    { key: 'last', head: C.lastPlayed, wideOnly: true, className: 'muted', cell: (m) => ago(m.versions.find((x) => x.status === 'active')?.last_played_at) },
    {
      key: 'act',
      head: '',
      align: 'right',
      cell: (m) => (
        <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
          {m.retired ? null : (
            <Link className="btn sm" to={`/submit?model=${encodeURIComponent(m.id)}`}>
              {C.submit}
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
      setErr(e instanceof ApiError ? e.code : C.failed)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button className="btn sm ghost" type="button" disabled={busy} onClick={() => void toggle()}>
        {retired ? C.revive : C.retire}
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
      setErr(e instanceof ApiError ? said(e.code) : F.failed)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel>
      <PanelHead
        title={F.title}
        end={
          <button className="btn sm ghost" type="button" onClick={onCancel}>
            {F.cancel}
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
          <Field label={F.name} htmlFor="m-name" hint={F.nameHint}>
            <input className="input" id="m-name" autoComplete="off" autoFocus value={name} placeholder={F.namePlaceholder} onChange={(e) => setName(e.target.value)} />
          </Field>
          {err ? (
            <Notice tone="bad" title={F.failedTitle}>
              <p>{err}</p>
              <AskForHelp />
            </Notice>
          ) : null}
          <div>
            <button className="btn primary" type="submit" disabled={busy || !name.trim()}>
              {F.create}
            </button>
          </div>
        </form>
      </PanelBody>
    </Panel>
  )
}

function said(code: string): string {
  return lookup(T.refusals, code) ?? code
}
