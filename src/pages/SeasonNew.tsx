// `/admin/seasons/new` — admin session only. Reached from the New season button on /admin/seasons,
// which is the page a created season is then run from: its maps and its baselines are uploaded
// there, not here, so this page is the form and nothing else.
//
// A SEASON IS NAMED WHEN IT IS CREATED, and its slug — derived from the name — is how every link
// addresses it. Neither can ever change, so the form says so beside the field rather than
// after the fact.
//
// THE CLASSES ARE DISPLAYED, NOT ASKED FOR: a new season inherits the previous one's, and the seat
// count is the cartridge's. Showing a field that cannot be saved is worse than showing none. Each
// class's MEMORY is asked for, as two numbers beside the inherited caps, and the table is sent only
// when one of them changed: otherwise Soma copies the previous season's, as it always has.
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
import { Badge, Field, Notice, PageHeader, PagePlaceholder, Panel, PanelBody, Rich, Select, Switch } from '../components/ui'
import { AdminGate } from '../components/ErrorStates'
import { ClassMemoryFields } from '../components/Model'
import { kStyle, memoryChanged, memoryDraft, withMemory } from '../lib/weight-classes'
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
        <PagePlaceholder label={common.site.checkingSession} />
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
  const inherited = seasons[0]?.weight_classes ?? []
  const [memory, setMemory] = useState(() => memoryDraft(inherited))

  // How the season is scoped, and who runs it. Visibility is fixed at creation; private forces
  // restricted (below). Fleet defaults to the platform fleet for both, which is today's season.
  const [visibility, setVisibility] = useState('public')
  const [entry, setEntry] = useState('open')
  const [matches, setMatches] = useState('platform')
  const [admissions, setAdmissions] = useState('platform')
  const [admins, setAdmins] = useState('')

  // The rules, as the four an admin sets by hand plus an escape hatch for the rest.
  const [maxPerUser, setMaxPerUser] = useState('')
  const [inFlightMax, setInFlightMax] = useState('')
  const [classes, setClasses] = useState('')
  const [uniqueWeights, setUniqueWeights] = useState('')
  const [turnMs, setTurnMs] = useState('')
  const [maxTurns, setMaxTurns] = useState('')
  // THE FAIR-SCORE RULES: how the season ends, and whether it is played in weekly rounds. Both are
  // on by default, because a ladder without them ranks a version by how long it has been playing.
  const [closure, setClosure] = useState('finals')
  const [rounds, setRounds] = useState(true)
  const [roundDays, setRoundDays] = useState('7')
  const [roundGames, setRoundGames] = useState('100')
  const [roundSigma, setRoundSigma] = useState('3')
  const [roundShrink, setRoundShrink] = useState('0')
  const [roundWarn, setRoundWarn] = useState('15')
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

    if (uniqueWeights) r.unique_weights = { enabled: true, scope: uniqueWeights }

    // The terms a model competes under, sent to a runner on the claim. Left blank, the season plays
    // by the cartridge's own published limits -- so an empty box is not "no limit", it is "the
    // game's", which is why neither field carries a placeholder number that looks like a default.
    const execution: Record<string, unknown> = {}
    if (turnMs.trim()) execution.turn_ms = Number(turnMs)
    if (maxTurns.trim()) execution.max_turns = Number(maxTurns)
    if (Object.keys(execution).length > 0) r.execution = { enabled: true, ...execution }

    if (closure !== 'settle') r.closure = { enabled: true, policy: closure }
    if (rounds) {
      const block: Record<string, unknown> = { enabled: true }
      if (roundDays.trim()) block.days = Number(roundDays)
      if (roundGames.trim()) block.games = Number(roundGames)
      if (roundSigma.trim()) block.sigma_floor = Number(roundSigma)
      if (roundShrink.trim()) block.mu_shrink = Number(roundShrink)
      if (roundWarn.trim()) block.warn_minutes = Number(roundWarn)
      r.rounds = block
    }

    if (extra.trim()) Object.assign(r, JSON.parse(extra))
    return Object.keys(r).length > 0 ? r : undefined
  }

  // Private forces restricted (the CHECK does too), so switching to private moves entry with it; the
  // entry select then shows restricted, and a public season keeps whatever entry was chosen.
  const onVisibility = (v: string) => {
    setVisibility(v)
    if (v === 'private') setEntry('restricted')
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    setExtraBad(null)
    let body
    try {
      // Handles as Soma holds them: a leading @ is how people write one, not part of it.
      const adminList = admins.split(/[\n,]/).map((h) => h.trim().replace(/^@/, '')).filter(Boolean)
      body = {
        name: name.trim(),
        submissions_open_at: dateToIso(opens),
        submissions_close_at: dateToIso(closes),
        // A private season is always restricted, whatever the entry select last showed. The Select
        // yields a bare string; the values are the ones the options offer, so the casts hold.
        visibility: visibility as 'public' | 'private',
        entry: (visibility === 'private' ? 'restricted' : entry) as 'open' | 'restricted',
        fleet: {
          matches: matches as 'own' | 'platform' | 'both',
          admissions: admissions as 'own' | 'platform' | 'both',
        },
        admins: adminList.length > 0 ? adminList : undefined,
        rules: rules(),
        weight_classes: memoryChanged(inherited, memory) ? withMemory(inherited, memory) : undefined,
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

          {inherited.length > 0 ? <ClassMemoryFields classes={inherited} draft={memory} onChange={setMemory} id="n-memory" /> : null}

          <Field
            label={F.engine.label}
            hint={F.engine.hint}
          >
            <input className="input mono" type="text" value={F.engine.value} readOnly disabled />
          </Field>

          {/* HOW THE SEASON IS SCOPED, and who runs it. Visibility is fixed at creation; a private
              season is always restricted. Fleet defaults to the platform fleet, which is today's
              season; a cohort usually sets its own runners to play and leaves admission on both. */}
          <h3 className="form-h">{F.scope}</h3>

          <div className="form-grid">
            <Field label={F.visibility.label} htmlFor="n-vis" hint={F.visibility.hint}>
              <Select id="n-vis" label={F.visibility.label} value={visibility} options={F.visibility.options} onChange={onVisibility} />
            </Field>
            <Field label={F.entry.label} htmlFor="n-entry" hint={F.entry.hint}>
              <Select
                id="n-entry"
                label={F.entry.label}
                value={visibility === 'private' ? 'restricted' : entry}
                options={F.entry.options}
                onChange={setEntry}
              />
            </Field>
          </div>

          <div className="form-grid">
            <Field label={F.fleetMatches.label} htmlFor="n-fm" hint={F.fleetMatches.hint}>
              <Select id="n-fm" label={F.fleetMatches.label} value={matches} options={F.fleetMatches.options} onChange={setMatches} />
            </Field>
            <Field label={F.fleetAdmissions.label} htmlFor="n-fa" hint={F.fleetAdmissions.hint}>
              <Select id="n-fa" label={F.fleetAdmissions.label} value={admissions} options={F.fleetAdmissions.options} onChange={setAdmissions} />
            </Field>
          </div>

          <Field label={F.admins.label} htmlFor="n-admins" hint={F.admins.hint}>
            <textarea className="input" id="n-admins" rows={2} placeholder={F.admins.placeholder} value={admins} onChange={(e) => setAdmins(e.target.value)} />
          </Field>

          {/* FAIR SCORES: how it ends, and the weekly resets. */}
          <h3 className="form-h">{F.fairness}</h3>

          <Field label={F.closure.label} htmlFor="n-closure" hint={F.closure.hint}>
            <Select id="n-closure" label={F.closure.label} value={closure} options={F.closure.options} onChange={setClosure} />
          </Field>

          <Field label={F.rounds.label} hint={F.rounds.hint}>
            <Switch checked={rounds} label={F.rounds.switch} onChange={setRounds} />
          </Field>
          {rounds ? (
            <div className="round-fields">
              <Field label={F.rounds.days} htmlFor="n-rdays">
                <input id="n-rdays" className="input mono" type="number" min={1} max={60} value={roundDays} onChange={(e) => setRoundDays(e.target.value)} />
              </Field>
              <Field label={F.rounds.games} htmlFor="n-rgames">
                <input id="n-rgames" className="input mono" type="number" min={1} max={100000} value={roundGames} onChange={(e) => setRoundGames(e.target.value)} />
              </Field>
              <Field label={F.rounds.sigma} htmlFor="n-rsigma">
                <input id="n-rsigma" className="input mono" type="number" min={0} max={1000} step="any" value={roundSigma} onChange={(e) => setRoundSigma(e.target.value)} />
              </Field>
              <Field label={F.rounds.shrink} htmlFor="n-rshrink">
                <input id="n-rshrink" className="input mono" type="number" min={0} max={1} step="any" value={roundShrink} onChange={(e) => setRoundShrink(e.target.value)} />
              </Field>
              <Field label={F.rounds.warn} htmlFor="n-rwarn">
                <input id="n-rwarn" className="input mono" type="number" min={0} max={1440} value={roundWarn} onChange={(e) => setRoundWarn(e.target.value)} />
              </Field>
            </div>
          ) : null}

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
            <button className="btn primary lg" type="submit" disabled={busy || !opens || !closes || !slug || clash}>
              {busy ? F.creating : name.trim() ? fill(F.create, { name: name.trim() }) : F.createUnnamed}
            </button>
            <span className="muted">{F.note}</span>
          </div>
        </form>
      </PanelBody>
    </Panel>
  )
}
