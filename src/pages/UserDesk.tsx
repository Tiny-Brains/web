// `/admin/users/:handle` — admin session only: one account's desk, opened from the Users list and
// from any comment on the comments desk.
//
// A STRIP, THEN THE LISTS BESIDE THE SWITCH. The strip is who they are (role, joined, last seen,
// their comments by state); the left panel is one of four lists (their comments, the reports against
// them, their models with every version, their sign-ins), chosen in the address (`?list=`); the right
// is the commenting switch and the account's history. Each list is Soma's newest fifty (sign-ins
// twenty): the desk is for judging a person, not for paging through them.
//
// THE SWITCH ASKS FOR A TERM AND A REASON. The reason is what the user reads in the composer's
// place, so it is required; an off already in force is replaced, its term running from now.
// `setUserCommenting` takes the id, never the handle. Soma writes each switch, and each comment
// decision here, as an audit line, and the history below is those lines.
//
// The role is changed on the Users list, whose typed-handle guard stays the one way to do it. A
// desktop page: a phone gets the lists, and the switch below them.

import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ApiError, api, type AdminUserDesk, type AuditEntry, type CommentDecision, type CommentingTerm, type CommentState,
  type ReportReason,
} from '../api'
import { useApi } from '../lib/useApi'
import { useQueryState } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { ago, date, dateTime, excerpt, num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Avatar } from '../components/Avatar'
import { ClassBadge, VersionBadge } from '../components/Model'
import { Badge, type BadgeTone, type Column, DataTable, Icon, Loading, Notice, PageHeader, PagePlaceholder, Panel, PanelHead, Segmented, Skel, Tabs } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { AdminGate, FetchFailed, NotFound } from '../components/ErrorStates'
import { count, fill, lookup } from '../lib/copy'
import T from '../../copy/admin-user.json'
import common from '../../copy/common.json'

export default function UserDesk() {
  const { me, session } = useSession()

  if (session.state === 'loading') {
    return (
      <Shell title={T.tab}>
        <PagePlaceholder label={common.site.checkingSession} />
      </Shell>
    )
  }

  // A courtesy, not the control: Soma answers 403 to a non-admin whatever this page renders.
  if (!me || me.role !== 'admin') {
    return (
      <Shell title={T.tab}>
        <AdminGate signedIn={Boolean(me)} />
      </Shell>
    )
  }

  return <Desk />
}

type List = 'comments' | 'reports' | 'models' | 'sessions'
const LISTS: List[] = ['comments', 'reports', 'models', 'sessions']
type Said = { ok: boolean; text: string }
type DeskComment = AdminUserDesk['comments'][number]

function Desk() {
  const { handle = '' } = useParams()
  const desk = useApi(`admin-user:${handle}`, () => api.adminUser(handle))
  // Kept across a re-read, so the desk never blanks while a decision or a switch reloads it.
  const [kept, setKept] = useState<AdminUserDesk | null>(null)
  if (desk.data && desk.data !== kept) setKept(desk.data)
  const data = desk.data ?? (kept?.user.handle.toLowerCase() === handle.toLowerCase() ? kept : null)

  const [get, set] = useQueryState()
  const list: List = (LISTS as string[]).includes(get('list')) ? (get('list') as List) : 'comments'

  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<Said | null>(null)

  if (desk.error && !data) {
    return (
      <Shell title={T.tab}>
        {desk.error.status === 404 ? <NotFound kind="profile" /> : <FetchFailed error={desk.error} kind="profile" />}
      </Shell>
    )
  }
  // An unknown handle may answer 200 with a null body, like an unknown model.
  if (desk.state === 'ready' && !desk.data) {
    return (
      <Shell title={T.tab}>
        <NotFound kind="profile" />
      </Shell>
    )
  }

  const decide = async (c: DeskComment, action: CommentDecision) => {
    setBusy(true)
    setSaid(null)
    try {
      const r = await api.decideComments({ ids: [c.id], action })
      setSaid(r.decided ? { ok: true, text: T.said[action] } : { ok: false, text: T.said.left })
      desk.reload()
    } catch (err) {
      setSaid({ ok: false, text: refusal(err) })
    } finally {
      setBusy(false)
    }
  }

  const shownHandle = data?.user.handle ?? handle
  const u = data?.user
  const lastSeen = data?.sessions[0]?.last_seen_at ?? null
  const counts = data?.counts

  const listItems = LISTS.map((k) => ({
    key: k,
    label: T.lists[k],
    count: data ? (k === 'comments' ? data.comments.length : k === 'reports' ? data.reports.length : k === 'models' ? data.models.length : data.sessions.length) : null,
  }))

  return (
    <Shell title={fill(T.tabHandle, { handle: shownHandle })}>
      <PageHeader
        crumbs={[
          { label: common.admin.crumb, to: '/admin/seasons' },
          { label: T.header.crumbUsers, to: '/admin/users' },
          { label: fill(T.header.handle, { handle: shownHandle }) },
        ]}
        title={
          <span className="udesk-who">
            <Avatar handle={shownHandle} name={u?.display_name} size="xs" />
            {fill(T.header.handle, { handle: shownHandle })}
          </span>
        }
        badges={
          u ? (
            <>
              <Badge tone={u.role === 'admin' ? 'info' : 'off'}>{T.role[u.role]}</Badge>
              {u.role !== 'baseline' ? <SwitchBadge off={u.comments_off_until} /> : null}
            </>
          ) : null
        }
        sub={u ? (u.display_name ? fill(T.header.sub, { name: u.display_name, date: date(u.created_at) }) : fill(T.header.subNoName, { date: date(u.created_at) })) : null}
      >
        <AdminTabs current="users" />
      </PageHeader>

      <div className="wrap page-body">
        <div className="desk udesk">
          <Panel className="desk-strip">
            <div className="strip-row">
              <span className="strip-fact">
                <Icon id="i-clock" />
                {data ? (lastSeen ? fill(T.strip.lastSeen, { when: ago(lastSeen) }) : T.strip.neverSeen) : <Skel w={120} />}
              </span>
              <span className="strip-fact">
                <Icon id="i-comment" />
                {counts ? (
                  fill(T.strip.counts, {
                    live: num(counts.live),
                    held: num(counts.held),
                    reported: num(counts.reported),
                    removed: num(counts.removed),
                    deleted: num(counts.deleted),
                  })
                ) : (
                  <Skel w={320} />
                )}
              </span>
              <span className="strip-fact">
                <Icon id="i-flask" />
                {data ? count(T.strip.models, data.models.length) : <Skel w={60} />}
              </span>
              <span className="strip-actions">
                <Link to="/admin/users">{T.strip.changeRole}</Link>
              </span>
            </div>
            {said ? (
              <div className="strip-sheet">
                <Notice tone={said.ok ? 'ok' : 'bad'} title={said.text} />
              </div>
            ) : null}
          </Panel>

          <div className="desk-lists udesk-lists">
            <Panel className="fill">
              <PanelHead title={<Tabs label={T.lists.label} current={list} items={listItems} onPick={(k) => set({ list: k === 'comments' ? '' : k })} />} />
              <div className="fill-scroll">
                {list === 'comments' ? (
                  <DataTable
                    state={data ? 'ready' : 'loading'}
                    columns={commentColumns((c) => (
                      <CommentActions c={c} busy={busy} onDecide={(action) => void decide(c, action)} />
                    ))}
                    rows={data?.comments ?? []}
                    rowKey={(c) => c.id}
                    loadingRows={6}
                    empty={T.comments.empty}
                  />
                ) : list === 'reports' ? (
                  <DataTable
                    state={data ? 'ready' : 'loading'}
                    columns={reportColumns(data)}
                    rows={data?.reports ?? []}
                    rowKey={(r) => `${r.comment_id}:${r.reporter}:${r.at}`}
                    loadingRows={6}
                    empty={T.reports.empty}
                  />
                ) : list === 'models' ? (
                  <DataTable
                    state={data ? 'ready' : 'loading'}
                    columns={MODEL_COLUMNS}
                    rows={data?.models ?? []}
                    rowKey={(m) => m.model_id}
                    loadingRows={3}
                    empty={T.models.empty}
                  />
                ) : (
                  <DataTable
                    state={data ? 'ready' : 'loading'}
                    columns={SESSION_COLUMNS}
                    rows={data?.sessions ?? []}
                    rowKey={(s) => `${s.issued_at}:${s.last_seen_at}`}
                    loadingRows={4}
                    empty={T.sessions.empty}
                  />
                )}
              </div>
              <div className="fill-foot">
                <span className="muted">{list === 'sessions' ? T.lists.newestSessions : T.lists.newest}</span>
              </div>
            </Panel>

            <Panel className="fill udesk-side">
              <PanelHead title={T.commenting.title} icon="i-comment" />
              <div className="udesk-body">
                {data ? (
                  <CommentingSwitch
                    key={`${data.user.id}:${data.user.comments_off_until ?? 'on'}`}
                    desk={data}
                    onChanged={(text, ok) => {
                      setSaid({ ok, text })
                      desk.reload()
                    }}
                  />
                ) : (
                  <Loading rows={3} label={T.loading} />
                )}
                <h4>{T.history.title}</h4>
                {data ? <History lines={data.audit} /> : <Loading rows={2} label={T.loading} />}
              </div>
              <div className="fill-foot">
                <span className="muted">{T.commenting.audit}</span>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </Shell>
  )
}

// ---------- the commenting switch ----------

function CommentingSwitch({ desk, onChanged }: { desk: AdminUserDesk; onChanged: (text: string, ok: boolean) => void }) {
  const u = desk.user
  const [term, setTerm] = useState<CommentingTerm>('week')
  const [reason, setReason] = useState(u.comments_off_reason ?? '')
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)

  if (u.role === 'baseline') return <p className="muted">{T.commenting.baseline}</p>

  const off = u.comments_off_until
  const change = async (body: { off: CommentingTerm; reason: string } | { off: null }) => {
    setBusy(true)
    setRefused(null)
    try {
      const r = await api.setUserCommenting(u.id, body)
      if (!r.changed) onChanged(T.commenting.unchanged, false)
      else if (r.commenting === 'on') onChanged(fill(T.commenting.saidOn, { handle: r.handle }), true)
      else
        onChanged(
          fill(T.commenting.saidOff, {
            handle: r.handle,
            until: r.comments_off_until === 'infinity' ? T.commenting.saidOffForGood : fill(T.commenting.saidOffUntil, { date: dateTime(r.comments_off_until) }),
          }),
          true,
        )
    } catch (err) {
      setRefused(refusal(err))
    } finally {
      setBusy(false)
    }
  }

  const trimmed = reason.trim()
  return (
    <div className="udesk-switch">
      <div className="udesk-now">
        <SwitchBadge off={off} />
        {off ? <span>{off === 'infinity' ? T.commenting.offForGood : fill(T.commenting.offUntil, { date: dateTime(off) })}</span> : null}
      </div>
      {off && u.comments_off_reason ? <p className="udesk-reason">{fill(T.commenting.reasonShown, { reason: u.comments_off_reason })}</p> : null}
      {off ? (
        <div className="row">
          <button className="btn sm primary" type="button" disabled={busy} onClick={() => void change({ off: null })}>
            <Icon id="i-check" />
            {T.commenting.switchOn}
          </button>
        </div>
      ) : null}

      <form
        className="udesk-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (trimmed) void change({ off: term, reason: trimmed })
        }}
      >
        <div className="field">
          <span className="udesk-label">{T.commenting.termLabel}</span>
          <Segmented
            label={T.commenting.termLabel}
            value={term}
            onChange={(k) => setTerm(k as CommentingTerm)}
            items={(['day', 'week', 'month', 'forever'] as CommentingTerm[]).map((k) => ({ key: k, label: T.commenting.terms[k] }))}
          />
        </div>
        <label className="field">
          <span className="udesk-label">{T.commenting.reasonLabel}</span>
          <textarea className="input" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          <span className="hint">{fill(T.commenting.reasonHint, { n: reason.length })}</span>
        </label>
        <div className="row">
          <button className={off ? 'btn sm' : 'btn sm danger'} type="submit" disabled={busy || !trimmed}>
            {off ? T.commenting.replace[term] : T.commenting.switchOff[term]}
          </button>
        </div>
      </form>
      {refused ? <Notice tone="bad" title={refused} /> : null}
    </div>
  )
}

function SwitchBadge({ off }: { off: string | null }) {
  return off ? <Badge tone="bad">{T.commenting.off}</Badge> : <Badge tone="ok">{T.commenting.on}</Badge>
}

/** The audit lines about the account and its comments, newest first: the switch's history among
 *  them, with the reason each admin gave. */
function History({ lines }: { lines: AuditEntry[] }) {
  if (!lines.length) return <p className="muted">{T.history.empty}</p>
  return (
    <ol className="udesk-history">
      {lines.map((a) => (
        <li key={a.id}>
          <span className="muted" title={dateTime(a.at)}>
            {date(a.at)}
          </span>
          <span>
            {historyLine(a)} <span className="muted">{fill(T.history.by, { admin: a.admin })}</span>
            {a.reason ? <span className="udesk-reason">{fill(T.history.reason, { reason: a.reason })}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  )
}

function historyLine(a: AuditEntry): string {
  const what = lookup(T.history.actions, a.action) ?? a.action
  const term = typeof a.detail.term === 'string' ? lookup(T.history.terms, a.detail.term) : undefined
  if (a.action === 'user.commenting_off' && term) return fill(T.history.offFor, { term })
  if (a.action === 'user.role' && typeof a.detail.role === 'string') return fill(T.history.roleTo, { role: a.detail.role })
  return what
}

// ---------- the lists ----------

function CommentActions({ c, busy, onDecide }: { c: DeskComment; busy: boolean; onDecide: (action: CommentDecision) => void }) {
  return (
    <span className="row udesk-acts">
      {c.state === 'held' ? (
        <button className="btn sm" type="button" disabled={busy} onClick={() => onDecide('approve')}>
          {T.comments.approve}
        </button>
      ) : null}
      {c.state === 'live' || c.state === 'held' ? (
        <button className="btn sm" type="button" disabled={busy} onClick={() => onDecide('remove')}>
          {T.comments.remove}
        </button>
      ) : null}
      {c.state === 'removed' ? (
        <button className="btn sm" type="button" disabled={busy} onClick={() => onDecide('restore')}>
          {T.comments.restore}
        </button>
      ) : null}
    </span>
  )
}

function commentColumns(act: (c: DeskComment) => ReactNode): Column<DeskComment>[] {
  return [
    {
      key: 'comment',
      head: T.comments.comment,
      className: 'udesk-text',
      cell: (c) => (
        <>
          <div>{c.body}</div>
          <div className="udesk-meta">
            <Where host={c.host} hostId={c.host_id} id={c.id} />
            <span aria-hidden="true">·</span>
            <span title={dateTime(c.created_at)}>{ago(c.created_at)}</span>
          </div>
        </>
      ),
    },
    {
      key: 'state',
      head: T.comments.state,
      cell: (c) => (
        <span className="udesk-tags">
          <StateBadge state={c.state} />
          {c.state === 'held' && c.hold_tag ? <span className="cdesk-tag">{c.hold_tag === 'link' ? T.tag.link : fill(T.tag.word, { word: c.hold_tag })}</span> : null}
          {c.reports ? <span className="muted">{count(T.comments.reportCount, c.reports)}</span> : null}
        </span>
      ),
    },
    { key: 'act', head: '', align: 'right', cell: act },
  ]
}

function reportColumns(data: AdminUserDesk | null): Column<AdminUserDesk['reports'][number]>[] {
  const byId = new Map((data?.comments ?? []).map((c) => [c.id, c]))
  return [
    { key: 'when', head: T.reports.when, cell: (r) => <span title={dateTime(r.at)}>{ago(r.at)}</span> },
    { key: 'by', head: T.reports.by, cell: (r) => <Link to={deskPath(r.reporter)}>@{r.reporter}</Link> },
    { key: 'reason', head: T.reports.reason, cell: (r) => reasonWord(r.reason) },
    { key: 'words', head: T.reports.words, wideOnly: true, cell: (r) => (r.words ? fill(T.history.reason, { reason: r.words }) : null) },
    {
      key: 'comment',
      head: T.reports.comment,
      className: 'udesk-text',
      cell: (r) => {
        const c = byId.get(r.comment_id)
        return c ? (
          <>
            <div>{excerpt(c.body, 90)}</div>
            <div className="udesk-meta">
              <Where host={c.host} hostId={c.host_id} id={c.id} />
            </div>
          </>
        ) : (
          <span className="muted">{T.reports.unknownComment}</span>
        )
      },
    },
  ]
}

const MODEL_COLUMNS: Column<AdminUserDesk['models'][number]>[] = [
  {
    key: 'model',
    head: T.models.model,
    cell: (m) => (
      <span className="udesk-tags">
        <Link to={`/models/${m.model_id}`}>{m.model}</Link>
        {m.retired ? <Badge tone="off">{T.models.retired}</Badge> : null}
      </span>
    ),
  },
  {
    key: 'versions',
    head: T.models.versions,
    cell: (m) =>
      m.versions.length ? (
        <ul className="udesk-versions">
          {m.versions.map((v) => (
            <li key={v.version_id}>
              <Link className="mono" to={`/versions/${v.version_id}`}>
                v{v.version}
              </Link>
              <VersionBadge status={v.status} />
              <ClassBadge k={v.class} />
              <span className="muted">{fill(T.models.season, { season: v.season })}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="muted">{T.models.noVersions}</span>
      ),
  },
]

const SESSION_COLUMNS: Column<AdminUserDesk['sessions'][number]>[] = [
  { key: 'seen', head: T.sessions.seen, cell: (s) => <span title={dateTime(s.last_seen_at)}>{ago(s.last_seen_at)}</span> },
  { key: 'issued', head: T.sessions.issued, wideOnly: true, cell: (s) => dateTime(s.issued_at) },
  { key: 'expires', head: T.sessions.expires, wideOnly: true, cell: (s) => date(s.expires_at) },
  {
    key: 'browser',
    head: T.sessions.browser,
    className: 'udesk-agent',
    cell: (s) => <span title={s.user_agent ?? undefined}>{s.user_agent ?? T.sessions.unknownBrowser}</span>,
  },
  {
    key: 'state',
    head: T.sessions.state,
    cell: (s) =>
      s.live ? (
        <Badge tone="ok">{T.sessions.live}</Badge>
      ) : s.revoked_at ? (
        <Badge tone="off">{T.sessions.revoked}</Badge>
      ) : (
        <Badge tone="off">{T.sessions.expired}</Badge>
      ),
  },
]

// ---------- small parts ----------

function Where({ host, hostId, id }: { host: 'match' | 'model'; hostId: string; id: string }) {
  return (
    <Link className="cdesk-where" to={host === 'match' ? `/matches/${hostId}#comment-${id}` : `/models/${hostId}#comment-${id}`}>
      <Icon id={host === 'match' ? 'i-matches' : 'i-flask'} />
      {host === 'match' ? T.where.match : T.where.model}
    </Link>
  )
}

const STATE_TONE: Record<CommentState, BadgeTone> = { live: 'ok', held: 'wait', removed: 'bad', deleted: 'off' }

function StateBadge({ state }: { state: CommentState }) {
  return <Badge tone={STATE_TONE[state] ?? 'off'}>{T.state[state] ?? state}</Badge>
}

function reasonWord(r: ReportReason | null): string {
  return T.reports.reasons[r ?? 'none'] ?? r
}

function deskPath(handle: string): string {
  return `/admin/users/${encodeURIComponent(handle)}`
}

/** Soma's refusal, as a sentence. */
function refusal(err: unknown): string {
  if (err instanceof ApiError) {
    const said = lookup(T.refusals.said, err.code)
    if (said !== undefined) return said
    if (err.status === 0) return T.refusals.unreachable
  }
  return err instanceof Error ? err.message : T.refusals.fallback
}
