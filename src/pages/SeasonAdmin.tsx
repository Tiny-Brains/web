// `/season-admin` — THE DESK OF ONE SEASON, for whoever runs it: the season's own admins (a
// membership `GET /v1/me` names in `admin_of`, not a role) and the platform's admins, for any season
// they can see, private ones included. The season is `?season=`; with none, the switcher's season
// when this account runs it, else the newest one it does.
//
// A DESK LIKE /admin/seasons, a FIXED HEIGHT: a strip that says where the season stands (and moves
// its dates or asks for its close), then two lists side by side, each scrolling in its own panel with
// what adds to it at the foot. There are more than two lists, so the strip's tabs pick which pair --
// the season's people, its boards and baselines, its runners, its notices and its log -- and the
// choice is `?view=`, so a pair is a link. Below 1100px the pair stacks.
//
// Soma's season-admin-only fragment is what protects every call: it re-reads the membership on each
// request, answers 404 for a season the caller may not see and 403 for one they do not run. The gate
// here is a courtesy. What only a platform admin may do -- naming a season's admins -- is drawn for a
// platform admin alone.
//
// A SEASON KEY IS THE SEASON'S. A runner started from one serves this season and no other, whoever
// minted it, and this desk lists every such key and machine, with the same two questions the
// platform's Runners page asks: is it authorised (`live`), and is it calling in. A runner on another
// engine claims nothing and reports no error, which is why a wrong-engine notice links here.

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ApiError, api, authProviders, type AdminOf, type AuditEntry, type MintedRunnerKey, type Season, type SeasonAdmin as SeasonAdminRow,
  type SeasonParticipant, type SeasonRunner, type SeasonRunnerKey, type SeasonRunnerKeyList, type SeasonSend,
} from '../api'
import { usePlatform } from '../providers/platform-context'
import { useSession } from '../providers/session-context'
import { useQueryState, useSelection } from '../lib/selection'
import { seasonDeskPath } from '../lib/paths'
import { useApi } from '../lib/useApi'
import { useKept } from '../lib/useKept'
import { isQuiet, isWedged, runnerRole } from '../lib/runners'
import { ago, dateTime, num } from '../lib/format'
import { count, fill, lookup } from '../lib/copy'
import { cx } from '../lib/cx'
import { Shell } from '../components/Shell'
import {
  Badge, type Column, ConfirmAction, CopyField, DataTable, Icon, IconLabel, Loading, Notice, PageHeader, Panel, Rich, Select, Tabs,
} from '../components/ui'
import { SeasonBadge, SeasonEntryBadge } from '../components/Model'
import { Avatar } from '../components/Avatar'
import { BaselinesPanel, CloseSheet, DatesSheet, DeskPanel, MapsPanel, MemorySheet } from '../components/SeasonPanels'
import { AuthGate, InlineError, Message, NotFound } from '../components/ErrorStates'
import T from '../../copy/season-admin.json'
import common from '../../copy/common.json'

const VIEWS = ['people', 'boards', 'runners', 'notices'] as const
type View = (typeof VIEWS)[number]

/** A refusal as a sentence: the desk's own table, else Soma's words. */
function said(err: unknown): string {
  if (!(err instanceof ApiError)) return T.refusals.unsent
  return lookup(T.refusals.said, err.code) ?? err.message
}

export default function SeasonAdmin() {
  const { me, session, refresh } = useSession()
  // `admin_of` rides the session's cached /v1/me, and being named a season's admin arrives as a
  // notification linking here: read it again on the way in, so the desk opens for them at once.
  useEffect(() => {
    void refresh()
  }, [refresh])

  if (session.state === 'loading') {
    return (
      <Shell title={T.tab}>
        <section className="wrap page-body">
          <Loading rows={3} label={common.site.checkingSession} />
        </section>
      </Shell>
    )
  }
  if (!me) {
    return (
      <Shell title={T.tab}>
        <AuthGate title={T.gate.signIn} />
      </Shell>
    )
  }
  const platform = me.role === 'admin'
  if (!platform && me.admin_of.length === 0) {
    return (
      <Shell title={T.tab}>
        <Message
          code={T.gate.code}
          title={T.gate.none}
          actions={
            <Link className="btn primary lg" to="/">
              {T.gate.home}
            </Link>
          }
        >
          <p>{T.gate.noneBody}</p>
        </Message>
      </Shell>
    )
  }
  return <Desk platform={platform} adminOf={me.admin_of} />
}

function Desk({ platform, adminOf }: { platform: boolean; adminOf: AdminOf[] }) {
  const { slug: game, gameName, season: resolved, seasons, seasonsLoading, seasonsError, seasonMissing, reload } = usePlatform()
  const { season: wanted, href } = useSelection()
  const [get] = useQueryState()
  const mine = adminOf.filter((a) => a.game === game)
  const runs = (slug: string) => platform || mine.some((a) => a.season === slug)
  // No `?season=`: the switcher's season when this account runs it, else the newest one it runs.
  const target = wanted ?? (resolved && runs(resolved.slug) ? resolved.slug : (mine[0]?.season ?? resolved?.slug ?? null))
  const found = seasons.find((s) => s.slug === target) ?? null
  // The season on screen outlives a reload of the seasons (a close, moved dates), as on
  // /admin/seasons: a reload blanks the list while it runs, which would unmount the sheet saying
  // what just happened.
  const [kept, setKept] = useState<Season | null>(found)
  if (found !== null && found !== kept) setKept(found)
  const season = found ?? (seasonsLoading && kept?.slug === target ? kept : null)
  const view: View = (VIEWS as readonly string[]).includes(get('view')) ? (get('view') as View) : 'people'

  if (seasonMissing || (target !== null && !seasonsLoading && !seasonsError && seasons.length > 0 && found === null)) {
    return (
      <Shell title={common.errors.tabNotFound}>
        <NotFound kind="season" />
      </Shell>
    )
  }

  if (season && !runs(season.slug)) {
    return (
      <Shell title={T.tab} season={season.slug}>
        <Message code={T.gate.code} title={fill(T.gate.notYours, { season: season.name })}>
          <p>{T.gate.notYoursBody}</p>
          <ul className="sa-yours">
            {adminOf.map((a) => (
              <li key={`${a.game}/${a.season}`}>
                <Link to={seasonDeskPath(a)}>{a.name}</Link>{' '}
                <SeasonBadge state={a.state} />
              </li>
            ))}
          </ul>
        </Message>
      </Shell>
    )
  }

  return (
    <Shell title={season ? `${T.tab} · ${season.name}` : T.tab} season={season?.slug}>
      <PageHeader
        crumbs={[{ label: T.header.crumb, to: href('/season-admin') }, ...(season ? [{ label: season.name }] : [])]}
        title={season ? fill(T.header.title, { season: season.name }) : T.header.crumb}
        icon="i-shield"
        badges={<Badge tone="info">{platform ? T.header.badgePlatform : T.header.badgeSeason}</Badge>}
        actions={
          platform && season ? (
            <Link className="btn" to={`/admin/seasons?season=${encodeURIComponent(season.slug)}`}>
              <IconLabel icon="i-settings">{T.header.platformDesk}</IconLabel>
            </Link>
          ) : null
        }
      />
      <div className="wrap page-body">
        {season === null ? (
          seasonsLoading ? (
            <Loading rows={4} label={T.loading} />
          ) : seasonsError ? (
            <InlineError error={seasonsError} what={T.what} />
          ) : (
            <Notice tone="info" title={fill(T.none.title, { game: gameName })}>
              <p>{T.none.body}</p>
            </Notice>
          )
        ) : (
          <div className="desk">
            <Strip
              key={`strip-${season.slug}`}
              game={game}
              season={season}
              choices={platform ? seasons : seasons.filter((s) => runs(s.slug))}
              view={view}
              onDone={reload}
            />
            <div className="desk-lists">
              {view === 'people' ? (
                <>
                  <ParticipantsPanel key={`people-${season.slug}`} game={game} season={season} />
                  <AdminsPanel key={`admins-${season.slug}`} game={game} season={season} platform={platform} />
                </>
              ) : view === 'boards' ? (
                <>
                  <MapsPanel key={`maps-${season.slug}`} game={game} season={season} />
                  <BaselinesPanel key={`baselines-${season.slug}`} game={game} season={season} />
                </>
              ) : view === 'runners' ? (
                <RunnersView key={`runners-${season.slug}`} game={game} season={season} />
              ) : (
                <>
                  <NotifyPanel key={`notify-${season.slug}`} game={game} season={season} />
                  <AuditPanel key={`audit-${season.slug}`} game={game} season={season} />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}

// ---- the strip ------------------------------------------------------------------------------------

const dayMonthYear = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Which season, where it stands, the three operations on it, and which pair of lists is showing. */
function Strip({ game, season, choices, view, onDone }: { game: string; season: Season; choices: Season[]; view: View; onDone: () => void }) {
  const { href } = useSelection()
  const [, set] = useQueryState()
  const [sheet, setSheet] = useState<'dates' | 'memory' | 'close' | null>(null)
  const open = season.state === 'open' || season.state === 'settling'
  const canClose = open && season.close_requested_at === null
  const S = T.strip
  const stateWord = (s: Season) => (s.state === 'closed' ? S.final : s.state)

  return (
    <Panel className="desk-strip">
      <div className="strip-row">
        <Select
          look="pick"
          prefix={S.season}
          label={S.season}
          value={season.slug}
          options={choices.map((s) => ({
            value: s.slug,
            label: s.name,
            hint: s.visibility === 'private' ? fill(S.privateHint, { state: stateWord(s) }) : stateWord(s),
          }))}
          onChange={(slug) => set({ season: slug })}
        />
        <SeasonBadge state={season.state} />
        <SeasonEntryBadge visibility={season.visibility} entry={season.entry} />
        <span className="strip-fact" title={S.window}>
          <Icon id="i-calendar" />
          {dayMonthYear(season.submissions_open_at)} → {dayMonthYear(season.closed_at ?? season.submissions_close_at)}
        </span>
        <span className="strip-fact" title={S.entries}>
          <Icon id="i-user" label={S.entries} />
          {num(season.entries)}
        </span>
        <span className="strip-fact" title={S.played}>
          <Icon id="i-matches" label={S.played} />
          {num(season.matches_played)}
        </span>
        <div className="strip-actions">
          {season.state === 'scheduled' ? (
            <>
              <button className={cx('btn sm', sheet === 'dates' && 'on')} type="button" onClick={() => setSheet(sheet === 'dates' ? null : 'dates')}>
                <IconLabel icon="i-calendar">{S.moveDates}</IconLabel>
              </button>
              <button className={cx('btn sm', sheet === 'memory' && 'on')} type="button" onClick={() => setSheet(sheet === 'memory' ? null : 'memory')}>
                {S.memory}
              </button>
            </>
          ) : null}
          {canClose ? (
            <button className={cx('btn sm danger', sheet === 'close' && 'on')} type="button" onClick={() => setSheet(sheet === 'close' ? null : 'close')}>
              {S.close}
            </button>
          ) : null}
          {open && !canClose ? <Badge tone="wait">{S.closeRequested}</Badge> : null}
          <Link className="btn sm" to={`/leaderboard?season=${encodeURIComponent(season.slug)}`}>
            <IconLabel icon="i-leaderboard">{season.state === 'closed' ? S.finalStandings : S.standings}</IconLabel>
          </Link>
        </div>
      </div>
      {sheet === 'dates' ? <DatesSheet season={season} game={game} onDone={onDone} /> : null}
      {sheet === 'memory' ? <MemorySheet season={season} game={game} onDone={onDone} /> : null}
      {sheet === 'close' ? <CloseSheet season={season} game={game} onDone={onDone} /> : null}
      <div className="sa-views">
        <Tabs
          label={S.views}
          current={view}
          items={VIEWS.map((v) => ({
            key: v,
            label: T.views[v],
            to: href('/season-admin', { season: season.slug, view: v === 'people' ? null : v }),
          }))}
        />
      </div>
    </Panel>
  )
}

/** An inline ask before something that cannot be put back by a second click. */
function Ask({ title, body, yes, no, busy, onYes, onNo }: { title: string; body: ReactNode; yes: string; no: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <Notice tone="warn" title={title}>
      <p>{body}</p>
      <div className="row">
        <button className="btn sm danger" type="button" disabled={busy} onClick={onYes}>
          {yes}
        </button>
        <button className="btn sm" type="button" onClick={onNo}>
          {no}
        </button>
      </div>
    </Notice>
  )
}

// ---- people ---------------------------------------------------------------------------------------

/** The season's roster: each login a provider knows, pinned to an account once it has signed in and
 *  waiting until then. Added in bulk at the foot, removed one at a time. */
function ParticipantsPanel({ game, season }: { game: string; season: Season }) {
  const P = T.participants
  const closed = season.state === 'closed'
  const list = useKept(`participants:${game}:${season.slug}`, () => api.seasonParticipants(game, season.slug))
  const rows = list.data?.participants ?? []
  const pinned = rows.filter((r) => r.resolved).length
  const [confirming, setConfirming] = useState<SeasonParticipant | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameOf = (p: SeasonParticipant) => p.login ?? fill(P.everyone, { provider: p.provider })

  const remove = async (p: SeasonParticipant) => {
    setBusy(true)
    setError(null)
    try {
      await api.removeSeasonParticipant(game, season.slug, p.id)
    } catch (err) {
      setError(said(err))
    } finally {
      setBusy(false)
      setConfirming(null)
      list.reload()
    }
  }

  const columns: Column<SeasonParticipant>[] = [
    {
      key: 'who',
      head: <IconLabel icon="i-user">{P.head.who}</IconLabel>,
      className: 'sa-wrap',
      cell: (p) => (
        <span className="sa-who">
          <b className={p.wildcard ? undefined : 'mono'}>{nameOf(p)}</b>
          {p.wildcard ? null : <span className="hint">{fill(P.on, { provider: p.provider })}</span>}
        </span>
      ),
    },
    {
      key: 'state',
      head: P.head.state,
      cell: (p) =>
        p.resolved && p.handle ? (
          <span className="sa-state" title={fill(P.pinnedTitle, { handle: p.handle })}>
            <Badge tone="ok">{P.pinned}</Badge> <Link to={`/profile/${encodeURIComponent(p.handle)}`}>@{p.handle}</Link>
          </span>
        ) : (
          <span className="sa-state" title={P.waitingTitle}>
            <Badge tone="wait">{P.waiting}</Badge>
          </span>
        ),
    },
    { key: 'added', head: P.head.added, align: 'right', wideOnly: true, className: 'muted', cell: (p) => <span title={dateTime(p.added_at)}>{ago(p.added_at)}</span> },
    {
      key: 'act',
      head: '',
      align: 'right',
      cell: (p) =>
        closed ? null : (
          <button className="btn sm ghost" type="button" disabled={busy} aria-label={fill(P.removeLabel, { login: nameOf(p) })} onClick={() => setConfirming(p)}>
            {P.remove}
          </button>
        ),
    },
  ]

  const openEntry = season.entry === 'open' && season.visibility === 'public'
  const notes =
    openEntry || season.visibility === 'private' || confirming || error ? (
      <>
        {openEntry ? (
          <Notice tone="info" title={P.openEntry.title}>
            <p>{P.openEntry.body}</p>
          </Notice>
        ) : null}
        {season.visibility === 'private' && !confirming ? <p className="muted">{P.privateNote}</p> : null}
        {confirming ? (
          <Ask
            title={fill(P.confirm.title, { login: nameOf(confirming) })}
            body={P.confirm.body}
            yes={P.confirm.yes}
            no={P.confirm.no}
            busy={busy}
            onYes={() => void remove(confirming)}
            onNo={() => setConfirming(null)}
          />
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
      </>
    ) : null

  return (
    <DeskPanel
      icon="i-user"
      title={P.title}
      end={list.data ? <span className="num">{fill(P.count, { pinned: num(pinned), waiting: num(rows.length - pinned) })}</span> : null}
      notes={notes}
      foot={closed ? null : <AddParticipants game={game} season={season} before={list.data ? rows.length : null} onDone={list.reload} />}
    >
      {list.error && !list.data ? (
        <InlineError error={list.error} what={P.what} />
      ) : (
        <DataTable
          state={list.loading ? 'loading' : 'ready'}
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          rowClass={(p) => (p.resolved ? undefined : 'off')}
          loadingRows={6}
          empty={closed ? P.emptyClosed : P.empty}
        />
      )}
    </DeskPanel>
  )
}

/** Bulk add: a provider, and logins one per line or separated by commas. A login already listed is
 *  left alone, so the count added is the list's growth. */
function AddParticipants({ game, season, before, onDone }: { game: string; season: Season; before: number | null; onDone: () => void }) {
  const A = T.participants.add
  const providers = useApi('auth-providers', authProviders)
  const known = providers.data ?? []
  const [provider, setProvider] = useState('')
  const [logins, setLogins] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  // Soma's default is github; the deployment's first provider when it has none by that name.
  const chosen = provider || (known.find((p) => p.slug === 'github')?.slug ?? known[0]?.slug ?? 'github')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!logins.trim()) return
    setBusy(true)
    setResult(null)
    try {
      const r = await api.addSeasonParticipants(game, season.slug, { provider: chosen, logins })
      // A DELTA ONLY WHEN THE BEFORE-COUNT IS KNOWN. `before` was whatever `useKept` happened to
      // hold, so a participants read that failed or had not landed made it 0 and pasting 3 logins
      // into a season of 40 reported "43 added". Soma's route is idempotent for a login already
      // listed, so this line is the admin's only signal that anything happened -- it has to be
      // either right or plainly a total.
      const added = before === null ? null : Math.max(0, r.participants.length - before)
      setResult({
        ok: true,
        text:
          added === null
            ? fill(A.total, { n: num(r.participants.length) })
            : added > 0
              ? count(A.added, added, { n: num(added) })
              : A.none,
      })
      setLogins('')
      onDone()
    } catch (err) {
      setResult({ ok: false, text: said(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack tight" onSubmit={(e) => void submit(e)}>
      <div className="sa-add">
        {known.length > 1 ? (
          <Select
            label={A.provider}
            value={chosen}
            options={known.map((p) => ({ value: p.slug, label: p.label }))}
            onChange={setProvider}
          />
        ) : null}
        <textarea
          className="input"
          rows={2}
          aria-label={A.logins}
          placeholder={A.placeholder}
          value={logins}
          onChange={(e) => {
            setLogins(e.target.value)
            setResult(null)
          }}
        />
        <button className="btn primary sm" type="submit" disabled={busy || !logins.trim()}>
          <IconLabel icon="i-plus">{busy ? A.adding : A.submit}</IconLabel>
        </button>
      </div>
      {result ? (
        <p className={result.ok ? 'muted' : 'form-error'} aria-live="polite">
          {result.text}
        </p>
      ) : null}
    </form>
  )
}

/** The season's own admins. Naming or removing one is a platform admin's, so the add and the remove
 *  are drawn for a platform admin alone; Soma refuses anyone else either way. */
function AdminsPanel({ game, season, platform }: { game: string; season: Season; platform: boolean }) {
  const A = T.admins
  const { me } = useSession()
  const closed = season.state === 'closed'
  const list = useKept(`season-admins:${game}:${season.slug}`, () => api.seasonAdmins(game, season.slug))
  const rows = list.data?.admins ?? []
  const [confirming, setConfirming] = useState<SeasonAdminRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editable = platform && !closed

  const remove = async (a: SeasonAdminRow) => {
    setBusy(true)
    setError(null)
    try {
      await api.removeSeasonAdmin(game, season.slug, a.handle)
    } catch (err) {
      setError(said(err))
    } finally {
      setBusy(false)
      setConfirming(null)
      list.reload()
    }
  }

  const columns: Column<SeasonAdminRow>[] = [
    {
      key: 'who',
      head: <IconLabel icon="i-shield">{A.head.who}</IconLabel>,
      cell: (a) => (
        <span className="user-cell">
          <Avatar handle={a.handle} name={a.display_name} size="xs" />
          <span>
            <Link to={`/profile/${encodeURIComponent(a.handle)}`}>@{a.handle}</Link>
            {me?.handle === a.handle ? <span className="muted"> · {A.you}</span> : null}
            {a.display_name ? <div className="hint">{a.display_name}</div> : null}
          </span>
        </span>
      ),
    },
    { key: 'added', head: A.head.added, align: 'right', className: 'muted', cell: (a) => <span title={dateTime(a.added_at)}>{ago(a.added_at)}</span> },
    {
      key: 'act',
      head: '',
      align: 'right',
      cell: (a) =>
        editable ? (
          <button className="btn sm ghost" type="button" disabled={busy} onClick={() => setConfirming(a)}>
            {A.remove}
          </button>
        ) : null,
    },
  ]

  return (
    <DeskPanel
      icon="i-shield"
      title={A.title}
      end={list.data ? <span className="num">{count(A.count, rows.length, { n: num(rows.length) })}</span> : null}
      notes={
        confirming || error ? (
          <>
            {confirming ? (
              <Ask
                title={fill(A.confirm.title, { handle: confirming.handle })}
                body={A.confirm.body}
                yes={A.confirm.yes}
                no={A.confirm.no}
                busy={busy}
                onYes={() => void remove(confirming)}
                onNo={() => setConfirming(null)}
              />
            ) : null}
            {error ? <p className="form-error">{error}</p> : null}
          </>
        ) : null
      }
      foot={editable ? <AddAdmin game={game} season={season} onDone={list.reload} /> : closed ? null : <p className="muted">{A.platformOnly}</p>}
    >
      {list.error && !list.data ? (
        <InlineError error={list.error} what={A.what} />
      ) : (
        <DataTable state={list.loading ? 'loading' : 'ready'} columns={columns} rows={rows} rowKey={(a) => a.id} loadingRows={3} empty={A.empty} />
      )}
    </DeskPanel>
  )
}

function AddAdmin({ game, season, onDone }: { game: string; season: Season; onDone: () => void }) {
  const A = T.admins.add
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const h = handle.trim().replace(/^@/, '')
    if (!h) return
    setBusy(true)
    setResult(null)
    try {
      await api.addSeasonAdmin(game, season.slug, h)
      setResult({ ok: true, text: fill(A.added, { handle: h }) })
      setHandle('')
      onDone()
    } catch (err) {
      setResult({ ok: false, text: said(err) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="stack tight" onSubmit={(e) => void submit(e)}>
      <div className="sa-add">
        <input className="input" type="text" maxLength={64} aria-label={A.label} placeholder={A.placeholder} value={handle} onChange={(e) => setHandle(e.target.value)} />
        <button className="btn primary sm" type="submit" disabled={busy || !handle.trim()}>
          <IconLabel icon="i-plus">{busy ? A.adding : A.submit}</IconLabel>
        </button>
      </div>
      {result ? <p className={result.ok ? 'muted' : 'form-error'}>{result.text}</p> : null}
    </form>
  )
}

// ---- runners --------------------------------------------------------------------------------------

type Machine = SeasonRunner & { key: SeasonRunnerKey }

/** The season's keys and the machines started from them: one read, two lists. Every revoke answers
 *  the whole document again, so the page re-reads rather than splicing. The read also carries
 *  whether anything can admit for this season, which is the machines panel's alarm. */
function RunnersView({ game, season }: { game: string; season: Season }) {
  const keys = useKept(`season-keys:${game}:${season.slug}`, () => api.seasonRunnerKeys(game, season.slug))
  return (
    <>
      <KeysPanel game={game} season={season} keys={keys} />
      <MachinesPanel game={game} season={season} keys={keys} />
    </>
  )
}

type KeysRead = { data: SeasonRunnerKeyList | null; error: ApiError | null; loading: boolean; reload: () => void }

function KeysPanel({ game, season, keys }: { game: string; season: Season; keys: KeysRead }) {
  const K = T.keys
  const closed = season.state === 'closed'
  const rows = keys.data?.keys ?? []
  const [minted, setMinted] = useState<MintedRunnerKey | null>(null)
  const [revoking, setRevoking] = useState<SeasonRunnerKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const revoke = async (k: SeasonRunnerKey) => {
    setBusy(true)
    setError(null)
    try {
      await api.revokeSeasonRunnerKey(game, season.slug, k.id)
      setRevoking(null)
    } catch (err) {
      setError(said(err))
    } finally {
      setBusy(false)
      keys.reload()
    }
  }

  const machines = (k: SeasonRunnerKey) => k.runners.filter((r) => !r.revoked_at).length
  const columns: Column<SeasonRunnerKey>[] = [
    {
      key: 'key',
      head: <IconLabel icon="i-key">{K.head.key}</IconLabel>,
      className: 'sa-wrap',
      cell: (k) => (
        <>
          <b>{k.label ?? K.noLabel}</b>
          <div className="hint mono">
            {`${k.key_prefix}… · `}
            {fill(K.by, { owner: k.owner })}
          </div>
        </>
      ),
    },
    { key: 'machines', head: K.head.machines, align: 'right', className: 'r-num', cell: (k) => num(machines(k)) },
    {
      key: 'used',
      head: K.head.lastUsed,
      align: 'right',
      wideOnly: true,
      cell: (k) => (k.last_used_at ? <span title={dateTime(k.last_used_at)}>{ago(k.last_used_at)}</span> : <span className="muted">{K.never}</span>),
    },
    {
      key: 'state',
      head: '',
      cell: (k) =>
        k.revoked_at ? (
          <Badge tone="off">{K.revoked}</Badge>
        ) : (
          <button className="btn sm ghost" type="button" disabled={busy} onClick={() => setRevoking(k)}>
            {K.revoke}
          </button>
        ),
    },
  ]

  const notes =
    minted || revoking || error ? (
      <>
        {minted ? (
          <Notice tone="warn" title={fill(K.minted.title, { label: minted.label ?? K.noLabel })}>
            <p>
              <Rich text={K.minted.body} />
            </p>
            <CopyField value={minted.key} />
            <div className="row">
              <button className="btn sm" type="button" onClick={() => setMinted(null)}>
                {K.minted.done}
              </button>
            </div>
          </Notice>
        ) : null}
        {revoking ? (
          <Notice tone="warn" title={fill(K.revokeTitle, { prefix: revoking.key_prefix })}>
            <p>{machines(revoking) > 0 ? count(K.revokeBody, machines(revoking), { n: num(machines(revoking)) }) : K.revokeUnused}</p>
            <ConfirmAction word={revoking.key_prefix} action={fill(K.revokeAction, { prefix: revoking.key_prefix })} busy={busy} size="sm" onConfirm={() => void revoke(revoking)} />
            <div className="row">
              <button className="btn sm" type="button" onClick={() => setRevoking(null)}>
                {K.cancel}
              </button>
            </div>
          </Notice>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
      </>
    ) : null

  return (
    <DeskPanel
      icon="i-key"
      title={K.title}
      end={keys.data ? <span className="num">{count(K.count, rows.filter((k) => !k.revoked_at).length, { n: num(rows.filter((k) => !k.revoked_at).length) })}</span> : null}
      notes={notes}
      foot={
        closed ? null : (
          <MintKey
            game={game}
            season={season}
            onMinted={(k) => {
              setMinted(k)
              keys.reload()
            }}
          />
        )
      }
    >
      {keys.error && !keys.data ? (
        <InlineError error={keys.error} what={K.what} />
      ) : (
        <DataTable
          state={keys.loading ? 'loading' : 'ready'}
          columns={columns}
          rows={rows}
          rowKey={(k) => k.id}
          rowClass={(k) => (k.revoked_at ? 'off' : undefined)}
          loadingRows={3}
          empty={K.empty}
        />
      )}
    </DeskPanel>
  )
}

function MintKey({ game, season, onMinted }: { game: string; season: Season; onMinted: (k: MintedRunnerKey) => void }) {
  const M = T.keys.mint
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!label.trim()) return
    setBusy(true)
    setError(null)
    try {
      onMinted(await api.createSeasonRunnerKey(game, season.slug, label.trim()))
      setLabel('')
    } catch (err) {
      setError(said(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="stack tight" onSubmit={(e) => void submit(e)}>
      <div className="sa-add">
        <input className="input" type="text" maxLength={64} aria-label={M.label} placeholder={M.placeholder} value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn primary sm" type="submit" disabled={busy || !label.trim()}>
          <IconLabel icon="i-key">{busy ? M.minting : M.submit}</IconLabel>
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  )
}

function MachinesPanel({ game, season, keys }: { game: string; season: Season; keys: KeysRead }) {
  const R = T.runners
  const machines: Machine[] = (keys.data?.keys ?? []).flatMap((k) => k.runners.map((r) => ({ ...r, key: k })))
  const [stopping, setStopping] = useState<Machine | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const authorised = machines.filter((r) => r.live)
  const calling = authorised.filter((r) => !isQuiet(r))
  const wedged = machines.filter(isWedged)
  // A runner reporting another engine than the season's claims nothing and says nothing: read off
  // the ones calling in, since last week's probe disagreeing is not news.
  const offEngine = season.engine_digest ? calling.filter((r) => r.engine_digest && r.engine_digest !== season.engine_digest) : []
  // NOTHING IS ADMITTED WHILE NO ADMITTING RUNNER IS UP, and that state looks exactly like nothing
  // being wrong: a queued admission spends no attempt waiting, so the submissions sit in `testing`
  // and expire with nothing anywhere naming the reason. Soma answers it rather than the page
  // deriving it, because the reach spans the season's fleet policy and must be the admission
  // claim's own predicate -- a count that disagreed with what would be claimed is worse than none.
  const adm = keys.data?.admissions ?? null
  const stuck = adm !== null && adm.queued > 0 && adm.admitters === 0

  const stop = async (r: Machine) => {
    setBusy(true)
    setError(null)
    try {
      await api.revokeSeasonRunner(game, season.slug, r.id)
      setStopping(null)
    } catch (err) {
      setError(said(err))
    } finally {
      setBusy(false)
      keys.reload()
    }
  }

  const columns: Column<Machine>[] = [
    {
      key: 'machine',
      head: <IconLabel icon="i-server">{R.head.machine}</IconLabel>,
      className: 'sa-wrap',
      cell: (r) => (
        <>
          <b className={cx(offEngine.includes(r) && 'sa-bad')} title={r.engine_digest ?? undefined}>
            {r.label}
            {offEngine.includes(r) ? <Icon id="i-alert" label={R.wrongEngine} /> : null}
          </b>
          <div className="hint mono">
            {`${r.key.label ?? r.key.key_prefix} · ${R.role[runnerRole(r)]}${r.arch ? ` · ${r.arch}` : ''}`}
          </div>
        </>
      ),
    },
    { key: 'flight', head: R.head.inFlight, align: 'right', className: 'r-num', cell: (r) => `${num(r.in_flight)} / ${num(r.max_in_flight)}` },
    { key: 'seen', head: R.head.lastSeen, align: 'right', cell: (r) => <span title={dateTime(r.last_seen_at)}>{ago(r.last_seen_at)}</span> },
    {
      key: 'state',
      head: '',
      cell: (r) =>
        isWedged(r) ? (
          <Badge tone="bad">{R.state.wedged}</Badge>
        ) : r.revoked_at ? (
          <Badge tone="off">{R.state.revoked}</Badge>
        ) : !r.live ? (
          <Badge tone="off">{R.state.keyOrOwner}</Badge>
        ) : isQuiet(r) ? (
          <Badge tone="wait">{R.state.quiet}</Badge>
        ) : (
          <Badge tone="ok">{R.state.live}</Badge>
        ),
    },
    {
      key: 'act',
      head: '',
      align: 'right',
      cell: (r) =>
        r.revoked_at ? null : (
          <button className="btn sm ghost" type="button" disabled={busy} onClick={() => setStopping(r)}>
            {R.stop}
          </button>
        ),
    },
  ]

  const notes =
    stuck || offEngine.length || wedged.length || stopping || error ? (
      <>
        {stuck && adm ? (
          <Notice tone="bad" title={count(R.noAdmitter.title, adm.queued, { n: num(adm.queued) })}>
            <p>{R.noAdmitter[adm.reach]}</p>
          </Notice>
        ) : null}
        {offEngine.length ? (
          <Notice tone="warn" title={count(R.engine.title, offEngine.length, { n: num(offEngine.length) })}>
            <p>
              <Rich
                text={R.engine.body}
                vars={{ runners: offEngine.map((r) => r.label).join(', '), digest: <code>{(season.engine_digest ?? '').slice(0, 19)}</code> }}
              />
            </p>
          </Notice>
        ) : null}
        {wedged.length ? (
          <Notice tone="bad" title={count(R.wedged.title, wedged.length, { n: num(wedged.length) })}>
            <p>{fill(R.wedged.body, { runners: wedged.map((r) => r.label).join(', ') })}</p>
          </Notice>
        ) : null}
        {stopping ? (
          <Notice tone="warn" title={fill(R.stopTitle, { label: stopping.label })}>
            <p>{R.stopBody}</p>
            <ConfirmAction word={stopping.label} action={fill(R.stopAction, { label: stopping.label })} busy={busy} size="sm" onConfirm={() => void stop(stopping)} />
            <div className="row">
              <button className="btn sm" type="button" onClick={() => setStopping(null)}>
                {R.cancel}
              </button>
            </div>
          </Notice>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
      </>
    ) : null

  return (
    <DeskPanel
      icon="i-server"
      title={R.title}
      end={
        keys.data ? (
          <span className="num">
            {fill(R.end, { calling: num(calling.length), quiet: num(authorised.length - calling.length), inFlight: num(machines.reduce((n, r) => n + r.in_flight, 0)) })}
          </span>
        ) : null
      }
      notes={notes}
      foot={
        <p className="muted">
          <Rich text={R.start} />
        </p>
      }
    >
      {keys.error && !keys.data ? (
        <InlineError error={keys.error} what={R.what} />
      ) : (
        <DataTable
          state={keys.loading ? 'loading' : 'ready'}
          columns={columns}
          rows={machines}
          rowKey={(r) => r.id}
          rowClass={(r) => (isWedged(r) ? 'bad' : r.live && !isQuiet(r) ? undefined : 'off')}
          loadingRows={3}
          empty={R.empty}
        />
      )}
    </DeskPanel>
  )
}

// ---- notify and the log ---------------------------------------------------------------------------

/** A line to everyone in the season -- its entrants, its pinned participants and its admins -- in
 *  their bells, and every line sent to it. */
function NotifyPanel({ game, season }: { game: string; season: Season }) {
  const N = T.notify
  const doc = useKept(`season-notify:${game}:${season.slug}`, () => api.seasonNotify(game, season.slug))
  const sends = doc.data?.sends ?? []
  const columns: Column<SeasonSend>[] = [
    {
      key: 'subject',
      head: <IconLabel icon="i-megaphone">{N.head.subject}</IconLabel>,
      className: 'sa-subject',
      cell: (s) => (
        <>
          <span>{s.subject}</span>
          {s.link ? <div className="hint mono">{s.link}</div> : null}
        </>
      ),
    },
    { key: 'by', head: N.head.by, wideOnly: true, cell: (s) => <span className="muted">@{s.sent_by}</span> },
    { key: 'when', head: N.head.when, align: 'right', cell: (s) => <span title={dateTime(s.sent_at)}>{ago(s.sent_at)}</span> },
    { key: 'read', head: N.head.read, align: 'right', className: 'r-num', cell: (s) => fill(N.readOf, { read: num(s.read), recipients: num(s.recipients) }) },
  ]
  return (
    <DeskPanel
      icon="i-megaphone"
      title={N.title}
      end={doc.data ? <span className="num">{count(N.reaches, doc.data.recipients, { n: num(doc.data.recipients) })}</span> : null}
      foot={season.state === 'closed' ? null : <Compose game={game} season={season} onSent={doc.reload} />}
    >
      {doc.error && !doc.data ? (
        <InlineError error={doc.error} what={N.what} />
      ) : (
        <DataTable state={doc.loading ? 'loading' : 'ready'} columns={columns} rows={sends} rowKey={(s) => s.id} loadingRows={3} empty={N.empty} />
      )}
    </DeskPanel>
  )
}

function Compose({ game, season, onSent }: { game: string; season: Season; onSent: () => void }) {
  const C = T.notify.compose
  const [subject, setSubject] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!subject.trim()) return
    setBusy(true)
    setResult(null)
    try {
      const r = await api.sendSeasonNotify(game, season.slug, { subject: subject.trim(), link: link.trim() || null })
      const n = r.sends[0]?.recipients ?? r.recipients
      setResult({ ok: true, text: count(C.sent, n, { n: num(n) }) })
      setSubject('')
      setLink('')
      onSent()
    } catch (err) {
      setResult({ ok: false, text: err instanceof ApiError ? (lookup(T.notify.said, err.code) ?? err.message) : T.notify.failed })
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="stack tight" onSubmit={(e) => void submit(e)}>
      <input className="input" type="text" maxLength={200} aria-label={C.subject} placeholder={C.subjectPlaceholder} value={subject} onChange={(e) => setSubject(e.target.value)} />
      <div className="sa-add">
        <input className="input mono" type="text" maxLength={300} aria-label={C.link} placeholder={C.linkPlaceholder} value={link} onChange={(e) => setLink(e.target.value)} />
        <button className="btn primary sm" type="submit" disabled={busy || !subject.trim()}>
          <IconLabel icon="i-megaphone">{busy ? C.sending : C.send}</IconLabel>
        </button>
      </div>
      <p className={result && !result.ok ? 'form-error' : 'muted'} aria-live="polite">
        {result ? result.text : C.who}
      </p>
    </form>
  )
}

const PREFIXES = Object.entries(T.audit.prefixes).map(([value, label]) => ({ value, label }))

/** Everything done to this season, newest first, fifty lines a page. */
function AuditPanel({ game, season }: { game: string; season: Season }) {
  const A = T.audit
  const { seasonName } = usePlatform()
  const [action, setAction] = useState('')
  const base = `${game}:${season.slug}:${action}`
  const first = useKept(`season-audit:${base}`, () => api.seasonAudit(game, season.slug, { action: action || null }))
  const [more, setMore] = useState<{ base: string; rows: AuditEntry[]; cursor: string | null; busy: boolean; failed: boolean; loaded: boolean }>({
    base: '', rows: [], cursor: null, busy: false, failed: false, loaded: false,
  })
  const extra = more.base === base ? more : null
  const rows = [...(first.data?.entries ?? []), ...(extra?.rows ?? [])]
  const cursor = extra?.loaded ? extra.cursor : (first.data?.next_cursor ?? null)

  const loadMore = async () => {
    if (!cursor) return
    setMore({ base, rows: extra?.rows ?? [], cursor, busy: true, failed: false, loaded: extra?.loaded ?? false })
    try {
      const next = await api.seasonAudit(game, season.slug, { action: action || null, cursor })
      setMore((m) => (m.base === base ? { base, rows: [...m.rows, ...next.entries], cursor: next.next_cursor, busy: false, failed: false, loaded: true } : m))
    } catch {
      setMore((m) => (m.base === base ? { ...m, busy: false, failed: true } : m))
    }
  }

  /** What a line's detail adds: how many logins, how many recipients, where an import came from. */
  const detail = (e: AuditEntry): string | null => {
    const d = e.detail
    if (e.action === 'participant.add' && typeof d.added === 'number') return count(A.detail.added, d.added, { n: num(d.added) })
    if (e.action === 'notify.send' && typeof d.recipients === 'number') return count(A.detail.recipients, d.recipients, { n: num(d.recipients) })
    if (e.action.endsWith('.import') && typeof d.from === 'string') return fill(A.detail.from, { season: seasonName(d.from) })
    return null
  }

  const columns: Column<AuditEntry>[] = [
    { key: 'when', head: A.head.when, cell: (e) => <span title={dateTime(e.at)}>{ago(e.at)}</span> },
    { key: 'who', head: A.head.who, cell: (e) => <span>@{e.admin}</span> },
    {
      key: 'what',
      head: A.head.what,
      cell: (e) => {
        const more2 = detail(e)
        return (
          <>
            {lookup(A.actions, e.action) ?? <code>{e.action}</code>}
            {more2 ? <div className="hint">{more2}</div> : null}
          </>
        )
      },
    },
    {
      key: 'on',
      head: A.head.on,
      wideOnly: true,
      cell: (e) => {
        const label = typeof e.detail.label === 'string' ? e.detail.label : null
        const login = typeof e.detail.login === 'string' ? e.detail.login : null
        const handle = typeof e.detail.handle === 'string' ? `@${e.detail.handle}` : null
        // The season itself and a send's id say nothing on the season's own log.
        const id = e.target_kind === 'notify_send' || e.target_id === season.slug ? null : e.target_id
        return <span className="mono sa-target">{label ?? login ?? handle ?? id ?? '—'}</span>
      },
    },
  ]

  return (
    <DeskPanel
      icon="i-list"
      title={A.title}
      end={<Select label={A.filter} value={action} options={PREFIXES} onChange={setAction} />}
      foot={
        <div className="audit-foot">
          <span className="muted">{first.data ? count(A.shown, rows.length, { n: num(rows.length) }) : null}</span>
          {extra?.failed ? <span className="muted">{A.moreFailed}</span> : null}
          {cursor ? (
            <button className="btn sm desk-more" type="button" disabled={Boolean(extra?.busy)} onClick={() => void loadMore()}>
              {extra?.busy ? A.loadingMore : A.more}
            </button>
          ) : null}
        </div>
      }
    >
      {first.error && !first.data ? (
        <InlineError error={first.error} what={A.what} />
      ) : (
        <DataTable
          state={first.loading ? 'loading' : 'ready'}
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id}
          loadingRows={8}
          empty={action ? A.emptyFiltered : A.empty}
        />
      )}
    </DeskPanel>
  )
}
