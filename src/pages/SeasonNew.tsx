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
import { Badge, Field, Loading, Notice, PageHeader, Panel, PanelBody, Rich, Select } from '../components/ui'
import { AdminGate } from '../components/ErrorStates'
import { kStyle } from '../lib/weight-classes'
import { fill } from '../lib/copy'
import T from '../../copy/admin-season-new.json'
import common from '../../copy/common.json'

const F = T.form

const DAY = 86_400_000

export default function SeasonNew() {
  const { me, session } = useSession()

  if (session.state === 'loading') {
    return (
      <Shell title={T.tab}>
        <section className="wrap page-body">
          <Loading rows={3} label={common.site.checkingSession} />
        </section>
      </Shell>
    )
  }

  // Gated here as a courtesy, not as the control: Soma answers 403 to a non-admin whatever this
  // page renders, and that is what actually protects the operation.
  if (!me || me.role !== 'admin') {
    return (
      <Shell title={T.tab}>
        <AdminGate signedIn={Boolean(me)} />
      </Shell>
    )
  }

  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[{ label: common.admin.crumb, to: '/admin/seasons' }, { label: T.header.crumbSeasons, to: '/admin/seasons' }, { label: T.header.crumb }]}
        title={T.header.title}
        badges={<Badge tone="info">{common.admin.badge}</Badge>}
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
      setExtraBad(F.extra.invalid)
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
          <Notice tone="warn" title={fill(T.live.title, { season: live.name })}>
            <p>
              {fill(T.live.body, { season: live.name })}
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
          <Field label={F.game} htmlFor="n-game">
            <input className="input" id="n-game" type="text" value={gameName} readOnly disabled />
          </Field>

          <Field
            label={F.name.label}
            htmlFor="n-name"
            hint={
              slug ? (
                <Rich text={clash ? F.name.hintClash : F.name.hint} vars={{ slug: <span className="mono">{fill(F.name.slug, { slug })}</span> }} />
              ) : (
                F.name.hintEmpty
              )
            }
          >
            <input
              className="input"
              id="n-name"
              type="text"
              maxLength={48}
              placeholder={F.name.placeholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <div className="form-grid">
            <Field label={F.opens} htmlFor="n-open">
              <input className="input mono" id="n-open" type="date" value={opens} onChange={(e) => setOpens(e.target.value)} />
            </Field>
            <Field label={F.closes} htmlFor="n-close">
              <input className="input mono" id="n-close" type="date" value={closes} onChange={(e) => setCloses(e.target.value)} />
            </Field>
          </div>
          <span className="hint">{F.datesHint}</span>

          <Field
            label={F.classes.label}
            hint={F.classes.hint}
          >
            <div className="row">
              {inherited.length === 0 ? (
                <span>{F.classes.defaults}</span>
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
            label={F.engine.label}
            hint={F.engine.hint}
          >
            <input className="input mono" type="text" value={F.engine.value} readOnly disabled />
          </Field>

          {/* THE RULES. Every one is optional and every one falls back to the deploy's value, so a
              season left blank here behaves exactly as the platform does today. These four are the
              ones a season is usually about; the rest of the document is below. */}
          <h3 className="form-h">{F.rules}</h3>

          <Field
            label={F.maxPerUser.label}
            hint={F.maxPerUser.hint}
          >
            <input className="input" type="number" min={1} placeholder={F.maxPerUser.placeholder} value={maxPerUser} onChange={(e) => setMaxPerUser(e.target.value)} />
          </Field>

          <Field
            label={F.inFlightMax.label}
            hint={F.inFlightMax.hint}
          >
            <input className="input" type="number" min={1} placeholder={F.inFlightMax.placeholder} value={inFlightMax} onChange={(e) => setInFlightMax(e.target.value)} />
          </Field>

          <Field
            label={F.allow.label}
            hint={F.allow.hint}
          >
            <input className="input" type="text" placeholder={F.allow.placeholder} value={classes} onChange={(e) => setClasses(e.target.value)} />
          </Field>

          <Field
            label={F.participants.label}
            hint={F.participants.hint}
          >
            <textarea className="input" rows={3} placeholder={F.participants.placeholder} value={handles} onChange={(e) => setHandles(e.target.value)} />
          </Field>

          {/* The hint is plain text: its backticks are drawn as typed, not as code. */}
          <Field
            label={F.uniqueWeights.label}
            htmlFor="n-unique"
            hint={F.uniqueWeights.hint}
          >
            <Select id="n-unique" label={F.uniqueWeights.label} value={uniqueWeights} options={F.uniqueWeights.options} onChange={setUniqueWeights} />
          </Field>

          <Field
            label={F.turnMs.label}
            htmlFor="n-turnms"
            hint={F.turnMs.hint}
          >
            <input id="n-turnms" className="input" type="number" min={1} max={60000} placeholder={F.turnMs.placeholder} value={turnMs} onChange={(e) => setTurnMs(e.target.value)} />
          </Field>

          <Field
            label={F.maxTurns.label}
            htmlFor="n-maxturns"
            hint={F.maxTurns.hint}
          >
            <input id="n-maxturns" className="input" type="number" min={1} max={1000} placeholder={F.maxTurns.placeholder} value={maxTurns} onChange={(e) => setMaxTurns(e.target.value)} />
          </Field>

          <Field
            label={F.extra.label}
            hint={F.extra.hint}
          >
            <textarea
              className="input mono"
              rows={4}
              placeholder={F.extra.placeholder}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </Field>
          {extraBad ? (
            <Notice tone="bad" title={F.extra.invalidTitle}>
              <p>{extraBad}</p>
            </Notice>
          ) : null}

          {error ? (
            <Notice tone="bad" title={F.failed}>
              <p>{error}</p>
            </Notice>
          ) : null}

          <div className="row">
            <button className="btn primary lg" type="submit" disabled={busy || Boolean(live) || !opens || !closes || !slug || clash}>
              {busy ? F.creating : name.trim() ? fill(F.create, { name: name.trim() }) : F.createUnnamed}
            </button>
            <span className="muted">{F.note}</span>
          </div>
        </form>
      </PanelBody>
    </Panel>
  )
}
