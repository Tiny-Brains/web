// `/admin/seasons/new` — admin session only. Reached from the New season button on /admin/seasons,
// which is the page a created season is then run from: its maps and its baselines are uploaded
// there, not here, so this page is the form and nothing else.
//
// A SEASON IS NAMED WHEN IT IS CREATED, and its slug — derived from the name — is how every link
// addresses it. Neither can ever change, so the form says so beside the field rather than
// after the fact.
//
// THE CLASSES ARE DISPLAYED, NOT ASKED FOR: a new season inherits the previous one's, and the seat
// count is the cartridge's. Showing a field that cannot be saved is worse than showing none.
//
// THE RULES ARE ASKED FOR. Four of them are fields because they are what a season is usually about;
// the rest is a JSON box, validated server-side by season_rules_ok(), which refuses a key it does
// not know rather than storing a misspelling that then silently never applies. EVERY RULE IS
// OPTIONAL AND FALLS BACK to the deploy's value, so a season created with the block left blank
// behaves exactly as the platform does today.
//
// A NEW SEASON HAS NO MAPS AND NO BASELINES: nothing is paired in it until both are
// uploaded and switched on, which is why creating one lands on the season's own admin view.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { usePlatform } from '../providers/platform-context'
import { useSession } from '../providers/session-context'
import { seasonSlug } from '../lib/selection'
import { seasonSaid } from '../lib/season-refusals'
import { cap, dateInput, dateToIso } from '../lib/format'
import { Shell } from '../components/Shell'
import { Badge, Field, Loading, Notice, type Option, PageHeader, Panel, PanelBody, Select } from '../components/ui'
import { AdminGate } from '../components/ErrorStates'
import { kStyle } from '../lib/weight-classes'

const DAY = 86_400_000

const UNIQUE_WEIGHTS: Option[] = [
  { value: '', label: 'allowed — no rule' },
  { value: 'game', label: 'unique across the game' },
  { value: 'season', label: 'unique within this season' },
  { value: 'user', label: 'unique, and one competitor may not repeat their own' },
]

export default function SeasonNew() {
  const { me, session } = useSession()

  if (session.state === 'loading') {
    return (
      <Shell title="New season · admin">
        <section className="wrap page-body">
          <Loading rows={3} label="Checking your session" />
        </section>
      </Shell>
    )
  }

  // Gated here as a courtesy, not as the control: Soma answers 403 to a non-admin whatever this
  // page renders, and that is what actually protects the operation.
  if (!me || me.role !== 'admin') {
    return (
      <Shell title="New season · admin">
        <AdminGate signedIn={Boolean(me)} />
      </Shell>
    )
  }

  return (
    <Shell title="New season · admin">
      <PageHeader
        crumbs={[{ label: 'Admin', to: '/admin/seasons' }, { label: 'Seasons', to: '/admin/seasons' }, { label: 'New season' }]}
        title="New season"
        badges={<Badge tone="info">Admin</Badge>}
      />
      <div className="wrap page-body">
        <div className="form-page">
          <CreateForm />
        </div>
      </div>
    </Shell>
  )
}

function CreateForm() {
  const { slug: game, gameName, seasons, reload } = usePlatform()
  const navigate = useNavigate()
  // Lazy: the default dates are computed once, when the form first mounts, and must not move under
  // the editor on every re-render.
  const [opens, setOpens] = useState(() => dateInput(new Date(Date.now() + 7 * DAY).toISOString()))
  const [closes, setCloses] = useState(() => dateInput(new Date(Date.now() + 90 * DAY).toISOString()))
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slug = seasonSlug(name)
  const clash = slug !== '' && seasons.some((s) => s.slug === slug)
  const live = seasons.find((s) => s.closed_at === null) ?? null
  const inherited = seasons[0]?.weight_classes ?? []

  // The rules, as the four an admin sets by hand plus an escape hatch for the rest.
  const [maxPerUser, setMaxPerUser] = useState('')
  const [inFlightMax, setInFlightMax] = useState('')
  const [classes, setClasses] = useState('')
  const [handles, setHandles] = useState('')
  const [uniqueWeights, setUniqueWeights] = useState('')
  const [turnMs, setTurnMs] = useState('')
  const [maxTurns, setMaxTurns] = useState('')
  const [extra, setExtra] = useState('')
  const [extraBad, setExtraBad] = useState<string | null>(null)

  const rules = (): Record<string, unknown> | undefined => {
    const r: Record<string, unknown> = {}
    const entries: Record<string, unknown> = {}
    if (maxPerUser.trim()) entries.max_per_user = Number(maxPerUser)
    if (inFlightMax.trim()) entries.in_flight_max = Number(inFlightMax)
    if (Object.keys(entries).length > 0) r.entries = { enabled: true, ...entries }

    const allow = classes.split(',').map((c) => c.trim()).filter(Boolean)
    if (allow.length > 0) r.classes = { enabled: true, allow }

    // Stored AS TYPED and resolved at each submission, so a cohort member who signs up next week is
    // admitted without an edit. The response reports which handles have no account yet.
    if (handles.trim()) r.participants = { enabled: true, handles: handles.trim() }

    if (uniqueWeights) r.unique_weights = { enabled: true, scope: uniqueWeights }

    // The terms a model competes under, sent to a runner on the claim. Left blank, the season plays
    // by the cartridge's own published limits -- so an empty box is not "no limit", it is "the
    // game's", which is why neither field carries a placeholder number that looks like a default.
    const execution: Record<string, unknown> = {}
    if (turnMs.trim()) execution.turn_ms = Number(turnMs)
    if (maxTurns.trim()) execution.max_turns = Number(maxTurns)
    if (Object.keys(execution).length > 0) r.execution = { enabled: true, ...execution }

    if (extra.trim()) Object.assign(r, JSON.parse(extra))
    return Object.keys(r).length > 0 ? r : undefined
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    setExtraBad(null)
    let body
    try {
      body = {
        name: name.trim(),
        submissions_open_at: dateToIso(opens),
        submissions_close_at: dateToIso(closes),
        rules: rules(),
      }
    } catch {
      setExtraBad('That is not valid JSON, so nothing was sent.')
      setBusy(false)
      return
    }
    try {
      const s = await api.createSeason(game, body)
      reload()
      // To the season's own view, where its maps and baselines are uploaded: until both are
      // switched on, nothing is paired in it.
      navigate(`/admin/seasons?season=${encodeURIComponent(s.slug)}`)
    } catch (err) {
      setError(seasonSaid(err))
      setBusy(false)
    }
  }

  return (
    <Panel>
      <PanelBody className="stack">
        {live ? (
          <Notice tone="warn" title={`${live.name} is still live.`}>
            <p>
              A game has at most one season taking submissions, so a new one is refused until {live.name}{' '}
              has closed. Request its close from the season view.
            </p>
          </Notice>
        ) : null}
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <Field label="Game" htmlFor="n-game">
            <input className="input" id="n-game" type="text" value={gameName} readOnly disabled />
          </Field>

          <Field
            label="Name"
            htmlFor="n-name"
            hint={
              slug ? (
                <>
                  <span className="mono">?season={slug}</span>
                  {clash ? ' — another season has it' : ''} · the name and slug never change
                </>
              ) : (
                'Summer 2026, FireAnts 2026 — the name and its slug never change'
              )
            }
          >
            <input
              className="input"
              id="n-name"
              type="text"
              maxLength={48}
              placeholder="Summer 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <div className="form-grid">
            <Field label="Opens" htmlFor="n-open">
              <input className="input mono" id="n-open" type="date" value={opens} onChange={(e) => setOpens(e.target.value)} />
            </Field>
            <Field label="Closes" htmlFor="n-close">
              <input className="input mono" id="n-close" type="date" value={closes} onChange={(e) => setCloses(e.target.value)} />
            </Field>
          </div>
          <span className="hint">Both dates are read as midnight UTC.</span>

          <Field
            label="Weight classes"
            hint="Inherited from the previous season. A season owns its classes, so a result in one class is comparable within its season and not across seasons."
          >
            <div className="row">
              {inherited.length === 0 ? (
                <span>the platform defaults</span>
              ) : (
                inherited.map((c) => (
                  <span key={c.class}>
                    <i style={kStyle(c.class)} />
                    {c.class} · {cap(c.max_bytes)}
                  </span>
                ))
              )}
            </div>
          </Field>

          <Field
            label="Engine"
            hint="Pinned at creation from the game's active engine. A season plays one engine from beginning to end, or its standings mean nothing."
          >
            <input className="input mono" type="text" value="the game's active engine digest" readOnly disabled />
          </Field>

          {/* THE RULES. Every one is optional and every one falls back to the deploy's value, so a
              season left blank here behaves exactly as the platform does today. These four are the
              ones a season is usually about; the rest of the document is below. */}
          <h3 className="form-h">Rules</h3>

          <Field
            label="Models per competitor"
            hint="How many models one person may hold in this season. Blank means no limit. A retired model frees its slot."
          >
            <input className="input" type="number" min={1} placeholder="no limit" value={maxPerUser} onChange={(e) => setMaxPerUser(e.target.value)} />
          </Field>

          <Field
            label="Versions in admission at once"
            hint="Across all of one competitor's models. One version per model is always the rule; this is the ceiling on top of it."
          >
            <input className="input" type="number" min={1} placeholder="no limit" value={inFlightMax} onChange={(e) => setInFlightMax(e.target.value)} />
          </Field>

          <Field
            label="Weight classes offered"
            hint="Comma-separated, from the table above — nano, micro, mini, small, large. Blank offers all of them. A model measuring into a class this season does not run is refused CLASS_NOT_OFFERED, which is not the same as being too large for every class there is. A baseline is measured the same way."
          >
            <input className="input" type="text" placeholder="all of them" value={classes} onChange={(e) => setClasses(e.target.value)} />
          </Field>

          <Field
            label="Participants"
            hint="Comma-separated GitHub usernames — a university cohort, say. They are stored as typed and matched at each submission, so someone who signs in for the first time next week is admitted without an edit. Blank leaves the season open to everyone."
          >
            <textarea className="input" rows={3} placeholder="open to everyone" value={handles} onChange={(e) => setHandles(e.target.value)} />
          </Field>

          <Field
            label="Duplicate weights"
            htmlFor="n-unique"
            hint="Whether two entries may stand on the same weights. `user` is the strictest and is the one the entry split made necessary: without it a competitor can put one set of weights behind five models and take five ladder slots."
          >
            <Select id="n-unique" label="Duplicate weights" value={uniqueWeights} options={UNIQUE_WEIGHTS} onChange={setUniqueWeights} />
          </Field>

          <Field
            label="Turn budget (ms)"
            htmlFor="n-turnms"
            hint="How long a model has to answer one turn. This is the constraint that decides how large a model can be and still play, so it is the one number that changes what the contest rewards. Blank plays by the game's own limit."
          >
            <input id="n-turnms" className="input" type="number" min={1} max={60000} placeholder="the game's limit" value={turnMs} onChange={(e) => setTurnMs(e.target.value)} />
          </Field>

          <Field
            label="Match length (turns)"
            htmlFor="n-maxturns"
            hint="How long a match runs before it is scored as it stands. Shorter rewards opening play and costs less to run; longer rewards the endgame. Blank plays by the game's own limit."
          >
            <input id="n-maxturns" className="input" type="number" min={1} max={100000} placeholder="the game's limit" value={maxTurns} onChange={(e) => setMaxTurns(e.target.value)} />
          </Field>

          <Field
            label="Everything else"
            hint="The rest of the rules document as JSON — graph, pairing, rating, standings, closure. The server validates every key and refuses one it does not know, so a misspelt rule fails here rather than silently never applying."
          >
            <textarea
              className="input mono"
              rows={4}
              placeholder={'{ "pairing": { "enabled": true, "self_pairing": false } }'}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </Field>
          {extraBad ? (
            <Notice tone="bad" title="Not valid JSON.">
              <p>{extraBad}</p>
            </Notice>
          ) : null}

          {error ? (
            <Notice tone="bad" title="It was not created.">
              <p>{error}</p>
            </Notice>
          ) : null}

          <div className="row">
            <button className="btn primary lg" type="submit" disabled={busy || Boolean(live) || !opens || !closes || !slug || clash}>
              {busy ? 'Creating…' : name.trim() ? `Create ${name.trim()}` : 'Create the season'}
            </button>
            <span className="muted">It opens with no maps and no baselines. Both are uploaded next.</span>
          </div>
        </form>
      </PanelBody>
    </Panel>
  )
}
