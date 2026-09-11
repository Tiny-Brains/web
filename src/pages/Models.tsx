// `/models` — every model this competitor holds in the selected game.
//
// THIS PAGE EXISTS BECAUSE A COMPETITOR CAN NOW HOLD SEVERAL. Before the entry split there was
// one lineage per person per game and the Home panel could print it; a portfolio needs a list,
// somewhere to make the next one, and a way to put one down.
//
// A model is created empty. Creating one enters nothing and starts no clock — /submit is what
// puts a release under it — which is why the form here asks only for a name and a repository.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type MyModel } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform } from '../providers/platform-context'
import { useSession } from '../providers/session-context'
import { cap, date } from '../lib/format'
import { Shell } from '../components/Shell'
import { ModelLink, StatusPill } from '../components/Model'
import { modelPath, versionPath } from '../lib/paths'
import {
  Card, CardBody, CardFoot, CardHead, Empty, Field, Loading, Note, PageHead, Pill,
} from '../components/ui'
import { InlineError } from '../components/ErrorStates'

export default function Models() {
  const { slug, gameName } = usePlatform()
  const { me, session } = useSession()
  const models = useApi(`my-models:${slug}:${me?.id ?? ''}`, () => api.myModels(slug), Boolean(me))

  if (session.state === 'loading') {
    return (
      <Shell>
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
            <Link className="btn primary lg" to="/start">
              How to enter
            </Link>
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
        sub="A model is a lineage: one GitHub repository, and every release you have entered from it. Its versions replace one another; your models do not."
      />

      <section className="wrap sec tight">
        {models.state === 'error' ? <InlineError error={models.error} what="Your models" /> : null}
        {models.state === 'loading' ? <Loading rows={3} label="Loading your models" /> : null}

        {models.state === 'ready' && rows.length === 0 ? (
          <Empty>
            You have no models in {gameName} yet. Make one below, then publish a release and submit
            it.
          </Empty>
        ) : null}

        {live.map((m) => (
          <ModelCard key={m.id} game={slug} model={m} />
        ))}

        {retired.length > 0 ? (
          <>
            <h2 className="sec-h">Retired</h2>
            <p className="muted">
              These take no new releases. Nothing they played was withdrawn — every version keeps
              its rating and its place in every match — and reviving one costs a click.
            </p>
            {retired.map((m) => (
              <ModelCard key={m.id} game={slug} model={m} />
            ))}
          </>
        ) : null}

        <NewModel game={slug} onMade={() => models.reload()} />
      </section>
    </Shell>
  )
}

function ModelCard({ game, model }: { game: string; model: MyModel }) {
  const owner = model.repo.split('/')[0]
  const name = model.repo.split('/')[1]
  const newest = model.versions[0] ?? null
  const active = model.versions.find((v) => v.status === 'active') ?? null

  return (
    <Card className={model.retired ? 'muted-card' : undefined}>
      <CardHead
        title={
          <ModelLink game={game} repo={model.repo} name={model.name} k={active?.class ?? newest?.class} />
        }
        end={
          <span className="muted note-mono">
            <a href={`https://github.com/${model.repo}`} rel="noreferrer noopener" target="_blank">
              {model.repo}
            </a>
          </span>
        }
      />
      <CardBody>
        {model.versions.length === 0 ? (
          <Empty>
            No releases entered yet. Publish one on GitHub and submit it — that is what starts the
            four steps.
          </Empty>
        ) : (
          <ul className="vlist">
            {model.versions.slice(0, 5).map((v) => (
              <li key={v.version_id}>
                <Link to={versionPath(game, model.repo, v.version)}>v{v.version}</Link>
                <StatusPill status={v.status} />
                <span className="muted">
                  {v.release_tag} · {v.class ?? '—'} · {v.size_bytes == null ? '—' : cap(v.size_bytes)} ·
                  season {v.season} · {date(v.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <CardFoot>
        <Link className="btn" to={`/submit?game=${game}&model=${encodeURIComponent(model.repo)}`}>
          Submit a version
        </Link>
        <Link className="btn" to={modelPath(game, model.repo)}>
          History
        </Link>
        <RetireButton game={game} owner={owner} repo={name} retired={model.retired} />
      </CardFoot>
    </Card>
  )
}

function RetireButton({
  game,
  owner,
  repo,
  retired,
}: {
  game: string
  owner: string
  repo: string
  retired: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function toggle() {
    setBusy(true)
    setErr(null)
    try {
      await api.updateModel(game, owner, repo, { retired: !retired })
      window.location.reload()
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

/** Name it, and give the repository it is published from. The path's first segment must be your
 *  own GitHub login — a competitor may not enter someone else's repository — unless the season
 *  allows the organisation it belongs to. */
function NewModel({ game, onMade }: { game: string; onMade: () => void }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setErr(null)
    try {
      await api.createModel(game, { name: name.trim(), url: url.trim() })
      setName('')
      setUrl('')
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
        <Field
          label="Repository"
          htmlFor="m-repo"
          hint="The GitHub repository you publish releases from. It has to be one you own, and it cannot be moved afterwards — it is what identifies this model."
        >
          <input
            className="input mono"
            id="m-repo"
            type="text"
            autoComplete="off"
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/you/your-model"
            value={url}
          />
        </Field>
        {err ? <Note tone="bad" title="Not created">{err}</Note> : null}
      </CardBody>
      <CardFoot>
        <button
          className="btn primary"
          disabled={busy || !name.trim() || !url.trim()}
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
    case 'repo_invalid':
      return 'That is not one repository. Paste https://github.com/you/your-model, or you/your-model — a releases or tree URL names a page inside a repository rather than the repository.'
    case 'repo_unverified':
      return 'GitHub did not confirm who owns that repository. Either it does not exist under that name, or it is private, or we are briefly over our rate limit with GitHub — check the name, and if it is right, try again in a minute.'
    case 'repo_private':
      return 'That repository is private. Your release assets are fetched without a token, so the repository has to be public.'
    case 'repo_not_owned':
      return 'GitHub says that repository belongs to a different account. It has to be owned by the account you signed in with, unless this season allows the organisation it belongs to.'
    case 'repo_taken':
      return 'That repository already has a model on it. One repository is one model — if it is yours, submit a new release to it instead.'
    case 'model_name_taken':
      return 'You already have a model with that name. Names are how you tell yours apart, so they have to differ.'
    case 'entries_max':
      return 'You are at this season’s limit for how many models one competitor may hold. Retire one to free a slot.'
    case 'not_a_participant':
      return 'This season is open to a named list of accounts, and yours is not on it.'
    case 'name_and_url_required':
      return 'A name and a repository are both required.'
    default:
      return code
  }
}
