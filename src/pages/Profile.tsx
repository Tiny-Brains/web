// A competitor's page: who they are, the medals they took, the models they entered, the matches
// those models played and what they said. When it is yours it is also your desk (/me opens it):
// the versions in admission, New model, Submit, Retire and Revive, and your queued pairings and
// trials. Those come from your own routes (me.candidates, /v1/models, /v1/me/matches), never from
// a flag on the public profile, and nobody else is sent them.
//
// The Models block is the selected season's; every other season folds below the matches. A model
// with no public version in that season reaches only its owner, from /v1/models, so a model just
// made, or one whose only version is still in admission, can still be given a version here.
//
// Soma's medal carries no rating, so a medal's final rating is read off that season's frozen
// podium, one request per closed season the person placed in.

import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import {
  ApiError, api,
  type Candidate, type MatchRef, type Medal, type ModelStatus, type MyMatchCard, type MyModel,
  type Profile, type ProfileComment, type ProfileGame, type ProfileVersion, type Rating, type WeightClass,
} from '../api'
import { useApi, type Async } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { usePlatform } from '../providers/platform-context'
import { DEFAULT_GAME, useQueryState, useSelection } from '../lib/selection'
import { ago, bytes, date, dateTime, initials, num, rating as fmtRating } from '../lib/format'
import { modelPath, versionPath } from '../lib/paths'
import { versionSteps } from '../lib/steps'
import { kStyle } from '../lib/weight-classes'
import { isLive } from '../lib/match'
import { cx } from '../lib/cx'
import { count, fill, lookup } from '../lib/copy'
import { Shell } from '../components/Shell'
import {
  Badge, DataTable, EmptyState, Field, Icon, Loading, Notice, Panel, PanelBody, PanelFoot, PanelHead, Rich, Section,
  Segmented, Skel, StepTracker, type Column,
} from '../components/ui'
import { ClassBadge, ClassIcon, Owner, RatingSparkline, RatingValue, SeasonBadge, VersionBadge } from '../components/Model'
import { CardGrid, CardSkeletons, MatchCard } from '../components/MatchCard'
import { FrameThumb } from '../components/Viewer'
import { Avatar } from '../components/Avatar'
import { AskForHelp } from '../components/Help'
import { FetchFailed, InlineError, NotFound } from '../components/ErrorStates'
import T from '../../copy/profile.json'

const B = T.banner
const N = T.banner.nums
const MD = T.medals
const F = T.flight
const MO = T.models
const NM = T.newModel
const X = T.matches
const E = T.earlier
const S = T.said

/** How many matches the grid shows, before the owner's private ones. */
const GRID = 12
/** A chip's word, cut so a long name cannot push the row off a phone. The whole name is its title. */
const CHIP = 14

export default function ProfilePage() {
  const { username = '' } = useParams()
  const { me } = useSession()
  const { slug, season, seasonsLoading } = usePlatform()
  const [param, setParams] = useQueryState()
  const mine = me !== null && me.handle.toLowerCase() === username.toLowerCase()

  const profile = useSteady(`profile:${username}`, () => api.profile(username))
  const owned = useSteady(`profile-owned:${slug}:${me?.id ?? ''}`, () => api.myModels(slug), mine)

  if (profile.error && !profile.data) {
    return (
      <Shell title={profile.error.status === 404 ? T.tabNotFound : T.tabNotLoaded}>
        <FetchFailed error={profile.error} kind="profile" />
      </Shell>
    )
  }
  if (profile.state === 'ready' && !profile.data) {
    return (
      <Shell title={T.tabNotFound}>
        <NotFound kind="profile" />
      </Shell>
    )
  }
  if (!profile.data) {
    return (
      <Shell title={`@${username}`}>
        <ProfileSkeleton />
      </Shell>
    )
  }

  const p = profile.data
  const current = season ? (p.games.find((g) => g.game === slug && g.season === season.slug) ?? null) : null
  const others = p.games.filter((g) => g !== current)
  const ownedRows = mine ? (owned.data ?? []) : []
  // The owner's models this season's public section does not hold: made and not yet submitted,
  // in admission, rejected, or entered in another season only.
  const unlisted = ownedRows.filter((m) => m.game === slug && !current?.models.some((x) => x.model_id === m.id))
  const entered = p.games.length > 0 || ownedRows.length > 0
  const making = mine && param('new') === '1'
  const changed = () => {
    profile.reload()
    owned.reload()
  }

  return (
    <Shell title={`@${p.handle}`}>
      <div className="wrap page-body stack prof">
        <Banner p={p} mine={mine} onNewModel={() => setParams({ new: '1' })} />

        {making ? (
          <NewModel
            game={slug}
            onDone={() => {
              setParams({ new: '' })
              changed()
            }}
            onCancel={() => setParams({ new: '' })}
          />
        ) : null}

        {p.medals.length && !p.baseline ? <Medals medals={p.medals} /> : null}

        {mine && me ? <InFlight candidates={me.candidates} owned={ownedRows} /> : null}

        {!entered && !making ? (
          mine ? (
            <Notice tone="info" title={T.nothing.titleMine}>
              <p>
                <Rich text={T.nothing.bodyMine} />
              </p>
            </Notice>
          ) : (
            <EmptyState boxed>{T.nothing.body}</EmptyState>
          )
        ) : null}

        {entered ? (
          <Models
            section={current}
            unlisted={unlisted}
            game={slug}
            season={season?.slug ?? null}
            seasonLabel={season ? fill(MO.sub, { game: current?.game_name ?? slug, season: season.name }) : undefined}
            loading={!season && seasonsLoading}
            mine={mine}
            baseline={p.baseline}
            ownedError={mine ? owned.error : null}
            onChanged={changed}
          />
        ) : null}

        {entered ? (
          <Matches
            handle={p.handle}
            mine={mine}
            game={slug}
            models={(current?.models ?? []).filter((m) => !m.retired).map((m) => ({ id: m.model_id, name: m.model }))}
          />
        ) : null}

        {others.length ? (
          <div className="stack tight">
            {others.map((g) => (
              <EarlierSeason g={g} key={`${g.game}/${g.season}`} />
            ))}
          </div>
        ) : null}

        <Said handle={p.handle} key={p.handle} />
      </div>
    </Shell>
  )
}

// ---- keeping what was drawn -------------------------------------------------------------------

/** useApi that keeps the last answer for the same key while it asks again, so a Retire or a new
 *  model re-reads the page without blanking it to its skeleton. */
type Steady<T> = { state: Async<T>['state']; data: T | null; error: ApiError | null; reload: () => void }

function useSteady<T>(key: string, run: () => Promise<T>, enabled = true): Steady<T> {
  const r = useApi(key, run, enabled)
  const [kept, setKept] = useState<{ key: string; data: T } | null>(null)
  // Derived state, set while rendering: React renders again at once, before anything is painted.
  if (r.state === 'ready' && (kept === null || kept.key !== key || kept.data !== r.data)) setKept({ key, data: r.data })
  const data = r.state === 'ready' ? r.data : kept !== null && kept.key === key ? kept.data : null
  return { state: r.state, data, error: r.error, reload: r.reload }
}

// ---- the placeholder --------------------------------------------------------------------------

/** The banner, three model cards and a row of match cards, at their final sizes. `/me` draws it
 *  too, while the session is being read. */
export function ProfileSkeleton() {
  return (
    <div className="wrap page-body stack prof">
      <span className="vis-hidden" role="status">
        {T.loading}
      </span>
      <section className="prof-banner" aria-hidden="true">
        <span className="avatar lg skel" />
        <div className="prof-ident">
          <Skel w={240} />
          <Skel w="45%" />
          <div className="prof-nums">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i}>
                <Skel w={72} />
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="prof-models" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div className="panel prof-model" key={i}>
            <Skel w="60%" />
            <Skel w="40%" />
            <Skel w="50%" />
            <div className="prof-model-thumb">
              <div className="thumb-box skel" />
            </div>
            <div className="prof-model-meta">
              <Skel w="45%" />
            </div>
          </div>
        ))}
      </div>
      <CardGrid>
        <CardSkeletons n={4} />
      </CardGrid>
    </div>
  )
}

// ---- 1. the banner ----------------------------------------------------------------------------

function Banner({ p, mine, onNewModel }: { p: Profile; mine: boolean; onNewModel: () => void }) {
  const since = fill(p.games.length ? B.competingSince : B.signedUp, { date: date(p.created_at) })
  return (
    <section className="prof-banner" aria-labelledby="prof-name">
      {p.baseline ? (
        // A baseline is no GitHub account: its handle's GitHub picture would be a stranger's face.
        <span className="avatar lg" aria-hidden="true">
          {initials(p.display_name, p.handle)}
        </span>
      ) : (
        <Avatar handle={p.handle} name={p.display_name} size="lg" alt={`@${p.handle}`} />
      )}
      <div className="prof-ident">
        <h1 id="prof-name">{p.display_name ?? `@${p.handle}`}</h1>
        <p className="prof-line">
          <span>@{p.handle}</span>
          {p.baseline ? (
            <>
              <span aria-hidden="true">·</span>
              <Owner baseline />
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span>{since}</span>
          {p.baseline ? null : (
            <>
              <span aria-hidden="true">·</span>
              <a href={`https://github.com/${p.handle}`} rel="noopener">
                {B.github}
                <Icon id="i-ext" label={B.external} />
              </a>
            </>
          )}
        </p>
        {p.bio && !p.baseline ? <p className="prof-bio">{p.bio}</p> : null}
        {p.games.length ? <Numbers p={p} /> : null}
      </div>
      {mine ? (
        <div className="prof-actions">
          <Link className="btn" to="/me/account">
            {B.editProfile}
          </Link>
          <button className="btn primary" type="button" onClick={onNewModel}>
            <Icon id="i-plus" />
            {B.newModel}
          </button>
        </div>
      ) : null}
    </section>
  )
}

/** Best on Open and the model holding it, best class rank, and the counts, over every season. */
function Numbers({ p }: { p: Profile }) {
  const versions = p.games.flatMap((g) => g.models.flatMap((m) => m.versions.map((v) => ({ m, v }))))
  const open = versions.filter((x) => x.v.ratings.open).sort((a, b) => a.v.ratings.open.rank - b.v.ratings.open.rank)[0]
  const klass = versions
    .filter((x) => x.v.class && x.v.ratings[x.v.class])
    .sort((a, b) => a.v.ratings[a.v.class!].rank - b.v.ratings[b.v.class!].rank)[0]
  // Pairing never seats two of one owner's versions together, so the sum counts each match once.
  const played = versions.reduce((n, x) => n + (x.v.ratings.open?.matches ?? 0), 0)
  const models = new Set(p.games.flatMap((g) => g.models.map((m) => m.model_id))).size
  return (
    <dl className="prof-nums">
      <div>
        <dt>{N.open}</dt>
        <dd>
          {open ? (
            <>
              #{open.v.ratings.open.rank}
              <small>{fill(N.openOf, { field: open.v.ratings.open.field, model: open.m.model })}</small>
            </>
          ) : (
            <small>{N.notRated}</small>
          )}
        </dd>
      </div>
      <div>
        <dt>{N.class}</dt>
        <dd>
          {klass ? (
            <>
              #{klass.v.ratings[klass.v.class!].rank}
              <small>{klass.v.class}</small>
            </>
          ) : (
            <small>{N.notRated}</small>
          )}
        </dd>
      </div>
      <div>
        <dt>{N.matches}</dt>
        <dd>{num(played)}</dd>
      </div>
      <div>
        <dt>{N.models}</dt>
        <dd>{num(models)}</dd>
      </div>
      <div>
        <dt>{N.seasons}</dt>
        <dd>{num(p.games.length)}</dd>
      </div>
    </dl>
  )
}

// ---- 2. medals --------------------------------------------------------------------------------

function Medals({ medals }: { medals: Medal[] }) {
  const seasons = [...new Map(medals.map((m) => [`${m.game}/${m.season}`, m] as const)).values()]
  const key = seasons.map((m) => `${m.game}/${m.season}`).join(',')
  // A podium that does not load leaves its medals without a rating, not the row without medals.
  const podia = useApi(`profile-podia:${key}`, () => Promise.all(seasons.map((m) => api.podium(m.game, m.season).catch(() => null))))
  const ratingOf = (m: Medal): number | null => {
    const i = seasons.findIndex((s) => s.game === m.game && s.season === m.season)
    const places = podia.data?.[i]?.ladders[m.ladder] ?? []
    return places.find((x) => x.place === m.place && x.model_id === m.model_id)?.rating ?? null
  }
  return (
    <ul className="prof-medals" aria-label={MD.label}>
      {medals.map((m) => {
        const word = lookup(MD.place, String(m.place)) ?? String(m.place)
        const r = ratingOf(m)
        return (
          <li key={`${m.game}/${m.season}/${m.ladder}/${m.place}`}>
            <Link to={podiumHref(m)}>
              <span className={`prof-medal p${m.place}`} role="img" aria-label={word} title={word}>
                {m.place}
              </span>
              <span>
                <b>{m.ladder === 'open' ? MD.open : m.ladder}</b> · {m.season_name}
                <br />
                <small>
                  {fill(MD.line, { model: m.model, version: m.version })}
                  {r !== null ? <> · {fmtRating(r)}</> : null}
                </small>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** The leaderboard of the medal's season, on its ladder, where the podium stands frozen. */
function podiumHref(m: Medal): string {
  const q = new URLSearchParams()
  if (m.game !== DEFAULT_GAME) q.set('game', m.game)
  q.set('season', m.season)
  if (m.ladder !== 'open') q.set('ladder', m.ladder)
  return `/leaderboard?${q.toString()}`
}

// ---- 3. in flight, the owner alone ------------------------------------------------------------

function InFlight({ candidates, owned }: { candidates: Candidate[]; owned: MyModel[] }) {
  if (!candidates.length) return null
  return (
    <Section title={F.title} sub={F.sub}>
      <div className="prof-flight">
        {candidates.map((c) => {
          const status: ModelStatus = c.phase === 'awaiting_trial' ? 'verified' : 'testing'
          // The candidate names no size or class; the owner's own list has them once measured.
          const v = owned.find((m) => m.id === c.model_id)?.versions.find((x) => x.version_id === c.version_id)
          return (
            <Panel key={c.version_id}>
              <PanelHead
                title={
                  <h3>
                    <Link to={modelPath(c.model_id)}>
                      {c.model} v{c.version}
                    </Link>
                  </h3>
                }
                end={<VersionBadge status={status} />}
              />
              <PanelBody>
                <StepTracker steps={versionSteps(status)} say={phaseSay(c, v?.size_bytes ?? null, v?.class ?? null)} />
              </PanelBody>
            </Panel>
          )
        })}
      </div>
    </Section>
  )
}

function phaseSay(c: Candidate, size: number | null, k: WeightClass | null): string {
  if (c.phase === 'queued') return F.queued
  if (c.phase === 'verifying') return F.verifying
  const text = size ? (k ? F.verifiedSizeClass : F.verifiedSize) : k ? F.verifiedClass : F.verified
  return fill(text, { size: bytes(size), class: k ?? '' })
}

// ---- 4. models --------------------------------------------------------------------------------

/** One model as its card draws it, from the public section or, for its owner, from /v1/models. */
type Card = {
  id: string
  name: string
  retired: boolean
  k: WeightClass | null
  /** The version that plays for it, else its newest public one; null for an owner-only card. */
  version: ProfileVersion | null
  open: Rating | null
  klass: Rating | null
  latest: MatchRef | null
  lastPlayed: string | null
  matches: number
}

function cardOf(m: ProfileGame['models'][number]): Card {
  const v = m.versions.find((x) => x.status === 'active') ?? m.versions[0] ?? null
  const k = v?.class ?? null
  return {
    id: m.model_id,
    name: m.model,
    retired: m.retired,
    k,
    version: v,
    open: v?.ratings.open ?? null,
    klass: v && k ? (v.ratings[k] ?? null) : null,
    latest: m.latest_match,
    lastPlayed: m.latest_match?.played_at ?? null,
    matches: m.versions.reduce((n, x) => n + (x.ratings.open?.matches ?? 0), 0),
  }
}

function cardOfOwned(m: MyModel): Card {
  const newest = [...m.versions].sort((a, b) => b.version - a.version)[0]
  const last = m.versions.map((v) => v.last_played_at).filter((t): t is string => Boolean(t)).sort().pop() ?? null
  return {
    id: m.id,
    name: m.name,
    retired: m.retired,
    k: newest?.class ?? null,
    version: null,
    open: null,
    klass: null,
    latest: null,
    lastPlayed: last,
    matches: 0,
  }
}

/** Best Open rank first; the unranked after them, most recently played first. */
function byRank(a: Card, b: Card): number {
  const ra = a.open?.rank
  const rb = b.open?.rank
  if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb
  if (ra !== undefined && rb === undefined) return -1
  if (ra === undefined && rb !== undefined) return 1
  return (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? '')
}

function Models({
  section,
  unlisted,
  game,
  season,
  seasonLabel,
  loading,
  mine,
  baseline,
  ownedError,
  onChanged,
}: {
  section: ProfileGame | null
  unlisted: MyModel[]
  game: string
  season: string | null
  seasonLabel?: string
  loading: boolean
  mine: boolean
  baseline: boolean
  ownedError: ApiError | null
  onChanged: () => void
}) {
  const cards = [...(section?.models.map(cardOf) ?? []), ...unlisted.map(cardOfOwned)].sort(byRank)
  const live = cards.filter((c) => !c.retired)
  const retired = cards.filter((c) => c.retired)
  const series = useApi(
    `profile-series:${game}:${season ?? ''}`,
    () => api.leaderboardSeries(game, { ladder: 'open', season, points: 30 }),
    Boolean(section && season),
  )
  const historyOf = (c: Card): number[] | undefined =>
    series.data?.series.versions
      .find((v) => v.version_id === c.version?.version_id)
      ?.ratings.filter((r): r is number => r !== null)

  const draw = (c: Card) => <ModelCard c={c} game={game} mine={mine} baseline={baseline} history={historyOf(c)} onChanged={onChanged} key={c.id} />

  return (
    <Section title={MO.title} sub={seasonLabel}>
      {loading ? (
        <div className="prof-models" aria-hidden="true">
          <div className="panel prof-model">
            <Skel w="60%" />
          </div>
        </div>
      ) : live.length ? (
        <div className="prof-models">{live.map(draw)}</div>
      ) : (
        <EmptyState boxed>{MO.none}</EmptyState>
      )}
      {ownedError ? <InlineError error={ownedError} what={MO.what} /> : null}
      {retired.length ? (
        <details className="prof-retired">
          <summary>{fill(MO.retiredFold, { n: retired.length })}</summary>
          {mine ? <p className="hint">{MO.retiredHint}</p> : null}
          <div className="prof-models">{retired.map(draw)}</div>
        </details>
      ) : null}
    </Section>
  )
}

function ModelCard({
  c,
  game,
  mine,
  baseline,
  history,
  onChanged,
}: {
  c: Card
  game: string
  mine: boolean
  baseline: boolean
  history?: number[]
  onChanged: () => void
}) {
  return (
    // A Panel's box, drawn here because the class hue down its edge is a style the Panel cannot take.
    <article className={cx('panel prof-model', c.retired && 'retired')} style={kStyle(c.k)}>
      <div className="prof-model-name">
        <ClassIcon k={c.k} />
        <Link to={modelPath(c.id)}>{c.name}</Link>
        <ModelState c={c} />
        {baseline ? <Owner baseline /> : null}
      </div>
      <div className="prof-model-rating">
        {c.open ? (
          <>
            <b>
              <RatingValue value={c.open.rating} provisional={c.open.provisional} />
            </b>
            <small>{fill(MO.rankOf, { rank: c.open.rank, field: c.open.field })}</small>
          </>
        ) : (
          <small>{c.version ? MO.notRated : MO.noVersion}</small>
        )}
      </div>
      <div className="prof-model-class">
        {c.klass && c.k ? <small>{fill(MO.classRank, { rank: c.klass.rank, class: c.k })}</small> : null}
        <RatingSparkline history={history} k={c.k} />
      </div>
      <div className="prof-model-thumb">
        {c.latest ? (
          <Link to={`/matches/${c.latest.id}`} aria-label={MO.latestMatch} title={MO.latestMatch}>
            <FrameThumb id={c.latest.id} game={game} hasFrame={c.latest.frame} />
          </Link>
        ) : (
          <div className="thumb-box" />
        )}
      </div>
      <div className="prof-model-meta">
        {count(MO.matches, c.matches, { n: num(c.matches) })} ·{' '}
        {c.lastPlayed ? fill(MO.lastPlayed, { when: ago(c.lastPlayed) }) : MO.neverPlayed}
      </div>
      {mine ? <ModelActions c={c} onChanged={onChanged} /> : null}
    </article>
  )
}

/** Playing vN, Retired, or the state of the newest public version when none plays. */
function ModelState({ c }: { c: Card }) {
  if (c.retired) return <Badge tone="off">{MO.retired}</Badge>
  if (!c.version) return null
  if (c.version.status === 'active') return <Badge tone="ok">{fill(MO.playing, { version: c.version.version })}</Badge>
  return (
    <>
      <span className="muted">{fill(MO.latest, { version: c.version.version })}</span>
      <VersionBadge status={c.version.status} />
    </>
  )
}

function ModelActions({ c, onChanged }: { c: Card; onChanged: () => void }) {
  const { href } = useSelection()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const toggle = async () => {
    setBusy(true)
    setErr(null)
    try {
      await api.updateModel(c.id, { retired: !c.retired })
      onChanged()
    } catch (e) {
      setErr(e instanceof ApiError && e.status !== 0 ? fill(MO.changeFailed, { code: e.code }) : MO.noAnswer)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="prof-model-acts">
      {c.retired ? null : (
        <Link className="btn sm" to={href('/submit', { model: c.id })}>
          <Icon id="i-plus" />
          {MO.submit}
        </Link>
      )}
      <button className="btn sm ghost" type="button" disabled={busy} onClick={() => void toggle()}>
        {c.retired ? MO.revive : MO.retire}
      </button>
      {err ? (
        <div className="prof-model-err" role="alert">
          <span className="form-error">{err}</span>
          <AskForHelp />
        </div>
      ) : null}
    </div>
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
      setErr(e instanceof ApiError && e.status !== 0 ? (lookup(NM.refusals, e.code) ?? e.message) : NM.failed)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel className="prof-new">
      <PanelHead
        title={NM.title}
        end={
          <button className="btn sm ghost" type="button" onClick={onCancel}>
            {NM.cancel}
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
          <Field label={NM.name} htmlFor="m-name" hint={NM.nameHint}>
            <input className="input" id="m-name" autoComplete="off" autoFocus value={name} placeholder={NM.namePlaceholder} onChange={(e) => setName(e.target.value)} />
          </Field>
          {err ? (
            <Notice tone="bad" title={NM.failedTitle}>
              <p>{err}</p>
              <AskForHelp />
            </Notice>
          ) : null}
          <div>
            <button className="btn primary" type="submit" disabled={busy || !name.trim()}>
              {NM.create}
            </button>
          </div>
        </form>
      </PanelBody>
    </Panel>
  )
}

// ---- 5. matches -------------------------------------------------------------------------------

function Matches({ handle, mine, game, models }: { handle: string; mine: boolean; game: string; models: { id: string; name: string }[] }) {
  const [param, setParams] = useQueryState()
  const { href } = useSelection()
  const model = param('model')
  const pub = useSteady(`profile-mx:${handle}:${model}`, () => api.matches({ owner: handle, model: model || null, limit: GRID }))
  const own = useApi(`profile-own-mx:${game}:${handle}`, () => api.myMatches({ game, limit: 25 }), mine)

  const shown = pub.data?.matches ?? []
  const seen = new Set(shown.map((m) => m.id))
  // What the public list cannot hold: pairings not yet played and trials, the owner's alone.
  const hidden: MyMatchCard[] = own.data
    ? own.data.matches.filter(
        (m) =>
          !seen.has(m.id) &&
          (m.status === 'pending' || isLive(m.status) || m.is_trial) &&
          (!model || m.seats.some((s) => s.mine && s.model_id === model)),
      )
    : []

  return (
    <Section
      icon="i-matches"
      title={X.title}
      sub={mine ? X.privateSub : undefined}
      more={{ label: mine ? X.allMine : X.allMatches, icon: 'i-matches', to: href('/matches', { owner: handle }) }}
    >
      {/* A chip left in the address still shows, so a narrowed grid can always be widened again. */}
      {models.length > 1 || model ? (
        <div className="prof-chips">
          <Segmented
            label={X.chips}
            value={model}
            onChange={(k) => setParams({ model: k })}
            items={[
              { key: '', label: X.all },
              ...models.map((m) => ({ key: m.id, label: m.name.length > CHIP ? `${m.name.slice(0, CHIP - 1)}…` : m.name, title: m.name })),
            ]}
          />
        </div>
      ) : null}
      {pub.error && !pub.data ? (
        <InlineError error={pub.error} what={X.what} />
      ) : !pub.data ? (
        <CardGrid>
          <CardSkeletons n={8} />
        </CardGrid>
      ) : shown.length || hidden.length ? (
        <CardGrid>
          {hidden.map((m) => (
            <Private m={m} key={m.id} />
          ))}
          {shown.map((m) => (
            <MatchCard m={m} via="grid" key={m.id} />
          ))}
        </CardGrid>
      ) : (
        <EmptyState boxed>{mine ? X.emptyMine : X.empty}</EmptyState>
      )}
    </Section>
  )
}

/** A queued pairing or a trial: its card, marked as the owner's alone, naming whom it meets. The
 *  pair clock has already chosen them, and a card of four seats names only the first. */
function Private({ m }: { m: MyMatchCard }) {
  const against = m.seats.filter((s) => !s.mine).map((s) => s.model)
  return (
    <div className="prof-private">
      <MatchCard m={m} via="grid" />
      <p className="prof-private-note">
        <Icon id="i-lock" />
        <span>
          {X.onlyYou}
          {against.length ? <> · {fill(X.against, { names: against.join(', ') })}</> : null}
        </span>
      </p>
    </div>
  )
}

// ---- 6. earlier seasons -----------------------------------------------------------------------

type SeasonRow = { m: ProfileGame['models'][number]; v: ProfileVersion | null }

function EarlierSeason({ g }: { g: ProfileGame }) {
  const rows: SeasonRow[] = g.models.map((m) => ({ m, v: m.versions.find((x) => x.status === 'active') ?? m.versions[0] ?? null }))
  const columns: Column<SeasonRow>[] = [
    {
      key: 'model',
      head: E.head.model,
      cell: (r) => (
        <Link className="model" to={modelPath(r.m.model_id)}>
          {r.m.model}
        </Link>
      ),
    },
    {
      key: 'version',
      head: E.head.version,
      cell: (r) => (r.v ? <Link to={versionPath(r.m.model_id, r.v.version)}>v{r.v.version}</Link> : <span className="muted">—</span>),
    },
    { key: 'class', head: E.head.class, wideOnly: true, cell: (r) => <ClassBadge k={r.v?.class} /> },
    {
      key: 'open',
      head: E.head.open,
      align: 'right',
      cell: (r) => (r.v?.ratings.open ? <span className="lead">{fmtRating(r.v.ratings.open.rating)}</span> : <span className="muted">—</span>),
    },
    { key: 'matches', head: E.head.matches, align: 'right', wideOnly: true, className: 'muted', cell: (r) => num(r.v?.ratings.open?.matches ?? 0) },
    {
      key: 'place',
      head: E.head.place,
      wideOnly: true,
      cell: (r) => {
        const o = r.v?.ratings.open
        const k = r.v?.class
        const kr = k ? r.v?.ratings[k] : undefined
        if (!o) return <span className="muted">—</span>
        const open = fill(E.place, { rank: o.rank, field: o.field })
        return kr && k ? `${open} · ${fill(E.classPlace, { rank: kr.rank, class: k })}` : open
      },
    },
  ]
  return (
    <details className="panel prof-season">
      <summary>
        <span>
          {g.game_name} · {g.season_name}
        </span>
        <SeasonBadge state={g.season_state} />
        <span className="muted">{count(E.models, g.models.length)}</span>
      </summary>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.m.model_id} empty={E.empty} />
    </details>
  )
}

// ---- 7. recent comments -----------------------------------------------------------------------

function Said({ handle }: { handle: string }) {
  const first = useApi(`profile-said:${handle}`, () => api.profileComments(handle))
  const [older, setOlder] = useState<ProfileComment[]>([])
  // Undefined until the first "Show older": the first page's cursor is the one to follow.
  const [cursor, setCursor] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const next = cursor === undefined ? (first.data?.next_cursor ?? null) : cursor
  const more = async () => {
    if (!next) return
    setBusy(true)
    setFailed(false)
    try {
      const page = await api.profileComments(handle, next)
      setOlder((o) => [...o, ...page.comments])
      setCursor(page.next_cursor)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  const rows = [...(first.data?.comments ?? []), ...older]
  return (
    <Panel>
      <PanelHead title={S.title} icon="i-comment" />
      {first.state === 'error' ? (
        <InlineError error={first.error} what={S.what} />
      ) : first.state === 'loading' ? (
        <Loading rows={3} />
      ) : rows.length ? (
        <ul className="prof-said">
          {rows.map((c) => (
            <li key={c.id}>
              <p>{c.body}</p>
              <p className="prof-said-where">
                <Icon id={c.host === 'model' ? 'i-flask' : 'i-matches'} />
                <Link to={c.link}>{c.host === 'model' ? fill(S.onModel, { model: c.host_name ?? '' }) : S.onMatch}</Link>
                <span aria-hidden="true">·</span>
                <time dateTime={c.created_at} title={dateTime(c.created_at)}>
                  {ago(c.created_at)}
                </time>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>{S.empty}</EmptyState>
      )}
      {next || failed ? (
        <PanelFoot>
          {next ? (
            <button className="btn sm ghost" type="button" disabled={busy} onClick={() => void more()}>
              {S.older}
            </button>
          ) : null}
          {failed ? <span className="form-error">{S.olderFailed}</span> : null}
        </PanelFoot>
      ) : null}
    </Panel>
  )
}
