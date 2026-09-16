// `/models` — every model this competitor holds in the selected game.
//
// THIS PAGE EXISTS BECAUSE A COMPETITOR CAN NOW HOLD SEVERAL. Before the entry split there was
// one lineage per person per game and the Home panel could print it; a portfolio needs a list,
// somewhere to make the next one, and a way to put one down.
//
// A model is created empty. Creating one enters nothing and starts no clock — /submit is what
// puts a version under it — which is why the form here asks for a name and nothing else.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, startGitHubSignIn, type MyModel } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform } from '../providers/platform-context'
import { useSession } from '../providers/session-context'
import { bytes, date } from '../lib/format'
import { Shell } from '../components/Shell'
import { ModelLink, StatusPill } from '../components/Model'
import { modelPath, versionPath } from '../lib/paths'
import {
  Card, CardBody, CardFoot, CardHead, type Column, DataTable, Empty, Field, Icon, Loading, Note, PageHead, Pill,
} from '../components/ui'
import { InlineError } from '../components/ErrorStates'

/** The columns the signed-out page draws empty: the shape of the table sign-in fills. */
const PREVIEW: Column<never>[] = [
  { key: 'model', head: 'Model', wide: true, cell: () => null },
  { key: 'versions', head: 'Versions', cell: () => null },
  { key: 'status', head: 'Status', cell: () => null },
  { key: 'open', head: 'Open', align: 'right', cell: () => null },
  { key: 'class', head: 'Class', align: 'right', cell: () => null },
]

export default function Models() {
  const { slug, gameName } = usePlatform()
  const { me, session } = useSession()
  const models = useApi(`my-models:${slug}:${me?.id ?? ''}`, () => api.myModels(slug), Boolean(me))

  if (session.state === 'loading') {
    return (
      <Shell title="Your models">
        <section className="wrap sec tight">
          <Loading rows={3} label="Checking your session" />
        </section>
      </Shell>
    )
  }

  if (!me) {
    return (
      <Shell title="Your models">
        <section className="mid">
          <div className="code">401 · sign in</div>
          <h1>Your models are yours to see.</h1>
          <p>Sign in with GitHub to list the models you hold in {gameName}, and to make another.</p>
          <div className="acts">
            <button className="btn primary lg" type="button" onClick={startGitHubSignIn}>
              <Icon id="i-github" />
              Sign in with GitHub
            </button>
            <Link className="btn lg" to="/start">
              How to enter
            </Link>
          </div>
          {/* WHAT SIGNING IN PAYS: the page's own table, empty, so the door has something behind
              it. The ghost rows are the loading table, which is the shape of the real one. */}
          <div className="what">
            <Card>
              <CardHead title="What appears here" end="once you are signed in" />
              <div aria-hidden="true">
                <DataTable columns={PREVIEW} rows={[]} state="loading" loadingRows={3} rowKey={() => ''} />
              </div>
              <CardFoot>
                <span className="muted">
                  Every model you hold in {gameName} with each version’s status and rating, the versions still
                  in admission, and a Submit button on each. Making a model is a name.
                </span>
              </CardFoot>
            </Card>
          </div>
        </section>
      </Shell>
    )
  }

  const rows = models.data ?? []
  const live = rows.filter((m) => !m.retired)
  const retired = rows.filter((m) => m.retired)

  return (
    <Shell ctx="select" title="Your models">
      {/* PageHead is its own .wrap; inside another it would sit 24px in from everything else. */}
      <PageHead
        title={<h1>Your models</h1>}
        badges={<Pill tone="ok">{gameName}</Pill>}
        sub="A model is a lineage: a name, and every version you have entered under it. Its versions replace one another; your models do not."
      />

      <section className="wrap sec tight stack">
        {models.state === 'error' ? <InlineError error={models.error} what="Your models" /> : null}
        {models.state === 'loading' ? <Loading rows={3} label="Loading your models" /> : null}

        {models.state === 'ready' && rows.length === 0 ? (
          <Empty>
            You have no models in {gameName} yet. Make one below, then submit
            it.
          </Empty>
        ) : null}

        {live.map((m) => (
          <ModelCard key={m.id} game={slug} model={m} onChanged={models.reload} />
        ))}

        {retired.length > 0 ? (
          <>
            <div>
              <h2 className="sec-h">Retired</h2>
              <p className="muted">
                These take no new releases. Nothing they played was withdrawn — every version keeps
                its rating and its place in every match — and reviving one costs a click.
              </p>
            </div>
            {retired.map((m) => (
              <ModelCard key={m.id} game={slug} model={m} onChanged={models.reload} />
            ))}
          </>
        ) : null}

        <NewModel game={slug} onMade={() => models.reload()} />
      </section>
    </Shell>
  )
}

function ModelCard({ game, model, onChanged }: { game: string; model: MyModel; onChanged: () => void }) {
  const newest = model.versions[0] ?? null
  const active = model.versions.find((v) => v.status === 'active') ?? null

  return (
    <Card className={model.retired ? 'muted-card' : undefined}>
      <CardHead
        title={
          <ModelLink modelId={model.id} name={model.name} k={active?.class ?? newest?.class} />
        }
        end={
          <span className="muted note-mono">
            {model.versions.length} version{model.versions.length === 1 ? '' : 's'}
          </span>
        }
      />
      <CardBody>
        {model.versions.length === 0 ? (
          <Empty>
            No versions entered yet. Upload a model and a manifest — that is what starts the four
            steps.
          </Empty>
        ) : (
          <ul className="vlist">
            {model.versions.slice(0, 5).map((v) => (
              <li key={v.version_id}>
                <Link to={versionPath(model.id, v.version)}>v{v.version}</Link>
                <StatusPill status={v.status} />
                <span className="muted">
                  {/* bytes(), not cap(): a cap is rounded on purpose and a measured size must not be. */}
                  {v.class ?? '—'} · {bytes(v.size_bytes)} ·
                  season {v.season} · {date(v.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <CardFoot>
        <Link className="btn" to={`/submit?game=${game}&model=${encodeURIComponent(model.id)}`}>
          Submit a version
        </Link>
        <Link className="btn" to={modelPath(model.id)}>
          History
        </Link>
        <RetireButton modelId={model.id} retired={model.retired} onDone={onChanged} />
      </CardFoot>
    </Card>
  )
}

function RetireButton({
  modelId,
  retired,
  onDone,
}: {
  modelId: string
  retired: boolean
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function toggle() {
    setBusy(true)
    setErr(null)
    try {
      await api.updateModel(modelId, { retired: !retired })
      // The list again, not the browser: a full reload throws away the session check, every
      // context above this page and the reader's place on it, for one row that changed.
      onDone()
      setBusy(false)
    } catch (e) {
      setErr(e instanceof ApiError ? e.code : 'that did not work')
      setBusy(false)
    }
  }

  return (
    <>
      <button className="btn" disabled={busy} onClick={toggle} type="button">
        {retired ? 'Revive' : 'Retire'}
      </button>
      {err ? <span className="muted">{err}</span> : null}
    </>
  )
}

/** Name it. That is the whole form — an entry is a name, unique among your own for this game.
 *  It used to ask for a GitHub repository too, and verify ownership of it before creating
 *  anything, which meant a rate-limited GitHub stopped anyone making a model at all. */
function NewModel({ game, onMade }: { game: string; onMade: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setErr(null)
    try {
      await api.createModel(game, { name: name.trim() })
      setName('')
      onMade()
    } catch (e) {
      setErr(e instanceof ApiError ? said(e.code) : 'that did not work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHead title={<h2>New model</h2>} />
      <CardBody className="form">
        <Field label="Name" htmlFor="m-name" hint="What you call it. Yours to change later.">
          <input
            className="input"
            id="m-name"
            type="text"
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            placeholder="Nano probe"
            value={name}
          />
        </Field>
        {err ? <Note tone="bad" title="Not created">{err}</Note> : null}
      </CardBody>
      <CardFoot>
        <button
          className="btn primary"
          disabled={busy || !name.trim()}
          onClick={create}
          type="button"
        >
          Create model
        </button>
      </CardFoot>
    </Card>
  )
}

function said(code: string): string {
  switch (code) {
    case 'model_name_taken':
      return 'You already have a model with that name. Names are how you tell yours apart, so yours have to differ — another competitor may still use the same one.'
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
