// `/admin/audit` — admin session only: every admin action, newest first.
//
// READ-ONLY. Nothing here acts: a removed comment is restored on the comments desk and commenting is
// switched back on on the user's desk, and each undo is a line of its own. So a row links to where
// its thing lives, and to the acting admin's desk.
//
// THE FILTERS ARE SOMA'S AND LIVE IN THE ADDRESS: `?admin=` (one handle), `?action=` (a prefix such
// as `comment.`, picked from the kinds of thing Soma writes lines about) and `?q=` (a substring of
// the target or the reason). Fifty a page on a keyset; Load more appends the next.
//
// Soma writes each line where it makes the change, so an action this page has no words for is drawn
// as its code rather than dropped. A desktop page that also reads on a phone: the reason folds away.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type AuditEntry, type AuditPage } from '../api'
import { useApi } from '../lib/useApi'
import { useQueryState } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { ago, dateTime, num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Badge, type Column, DataTable, Loading, PageHeader, Panel, Select } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { InlineError, AdminGate } from '../components/ErrorStates'
import { count, fill, lookup } from '../lib/copy'
import T from '../../copy/admin-audit.json'
import common from '../../copy/common.json'

export default function AuditAdmin() {
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

  // A courtesy, not the control: Soma answers 403 to a non-admin whatever this page renders.
  if (!me || me.role !== 'admin') {
    return (
      <Shell title={T.tab}>
        <AdminGate signedIn={Boolean(me)} />
      </Shell>
    )
  }

  return <Log />
}

const PREFIXES = Object.entries(T.prefixes).map(([value, label]) => ({ value, label }))

function Log() {
  const [get, set] = useQueryState()
  const admin = get('admin')
  const action = (T.prefixes as Record<string, string>)[get('action')] !== undefined ? get('action') : ''
  const q = get('q')

  const [typedAdmin, setTypedAdmin] = useDebounced(admin, handleOf, (v) => set({ admin: v }))
  const [typedQ, setTypedQ] = useDebounced(q, trimmed, (v) => set({ q: v }))

  const base = `${admin}|${action}|${q}`
  const first = useApi(`admin-audit:${base}`, () => api.adminAudit({ admin: admin || null, action: action || null, q: q || null }))
  // Kept while the same filters re-read; another filter starts from skeletons.
  const [kept, setKept] = useState<{ base: string; page: AuditPage } | null>(null)
  if (first.data && kept?.page !== first.data) setKept({ base, page: first.data })
  const page = first.data ?? (kept?.base === base ? kept.page : null)

  const [more, setMore] = useState<{ base: string; rows: AuditEntry[]; cursor: string | null; busy: boolean; failed: boolean; loaded: boolean }>({
    base: '', rows: [], cursor: null, busy: false, failed: false, loaded: false,
  })
  const extra = more.base === base && first.data ? more : null
  const rows = [...(page?.entries ?? []), ...(extra?.rows ?? [])]
  const cursor = extra?.loaded ? extra.cursor : (page?.next_cursor ?? null)

  const loadMore = async () => {
    if (!cursor) return
    setMore({ base, rows: extra?.rows ?? [], cursor, busy: true, failed: false, loaded: extra?.loaded ?? false })
    try {
      const next = await api.adminAudit({ admin: admin || null, action: action || null, q: q || null, cursor })
      setMore((m) => (m.base === base ? { base, rows: [...m.rows, ...next.entries], cursor: next.next_cursor, busy: false, failed: false, loaded: true } : m))
    } catch {
      setMore((m) => (m.base === base ? { ...m, busy: false, failed: true } : m))
    }
  }

  const filtered = Boolean(admin || action || q)

  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[{ label: common.admin.crumb, to: '/admin/seasons' }, { label: T.header.crumb }]}
        title={T.header.title}
        badges={<Badge tone="info">{common.admin.badge}</Badge>}
      >
        <AdminTabs current="audit" />
      </PageHeader>

      <div className="wrap page-body">
        <div className="desk">
          <Panel className="desk-strip">
            <div className="strip-row">
              <input
                className="input audit-admin"
                type="search"
                aria-label={T.filters.admin}
                placeholder={T.filters.adminPlaceholder}
                maxLength={64}
                value={typedAdmin}
                onChange={(e) => setTypedAdmin(e.target.value)}
              />
              <Select label={T.filters.action} value={action} options={PREFIXES} onChange={(v) => set({ action: v })} />
              <input
                className="input desk-search"
                type="search"
                aria-label={T.filters.q}
                placeholder={T.filters.qPlaceholder}
                maxLength={80}
                value={typedQ}
                onChange={(e) => setTypedQ(e.target.value)}
              />
              {filtered ? (
                <button
                  className="btn sm ghost"
                  type="button"
                  onClick={() => set({ admin: '', action: '', q: '' })}
                >
                  {T.filters.clear}
                </button>
              ) : null}
            </div>
          </Panel>

          <div className="desk-lists audit-lists">
            <Panel className="fill">
              <div className="fill-scroll">
                {first.error && !page ? (
                  <InlineError error={first.error} what={T.what} />
                ) : (
                  <DataTable
                    state={page ? 'ready' : 'loading'}
                    columns={COLUMNS}
                    rows={rows}
                    rowKey={(e) => e.id}
                    loadingRows={10}
                    empty={filtered ? T.emptyFiltered : T.empty}
                  />
                )}
              </div>
              <div className="fill-foot audit-foot">
                <span className="muted">{page ? count(T.shown, rows.length, { n: num(rows.length) }) : null}</span>
                <span className="muted">{T.foot}</span>
                {extra?.failed ? <span className="muted">{T.moreFailed}</span> : null}
                {cursor ? (
                  <button className="btn sm desk-more" type="button" disabled={Boolean(extra?.busy)} onClick={() => void loadMore()}>
                    {extra?.busy ? T.loadingMore : T.more}
                  </button>
                ) : null}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </Shell>
  )
}

/** A text box that writes the address when the typing stops, and follows the address when it moves
 *  on its own (back, or the Clear button). `norm` is what the address holds of the text. */
function useDebounced(value: string, norm: (v: string) => string, commit: (v: string) => void): [string, (v: string) => void] {
  const [typed, setTyped] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if (norm(typed) !== value) setTyped(value)
  }
  const [pending, setPending] = useState(false)
  // Read through a ref, as useApi reads its callback: the page rebuilds it on every render.
  const latest = useRef({ norm, commit })
  useEffect(() => {
    latest.current = { norm, commit }
  })
  useEffect(() => {
    if (!pending) return
    const t = setTimeout(() => {
      setPending(false)
      latest.current.commit(latest.current.norm(typed))
    }, 250)
    return () => clearTimeout(t)
  }, [typed, pending])
  return [
    typed,
    (v) => {
      setTyped(v)
      setPending(true)
    },
  ]
}

const trimmed = (v: string) => v.trim()
const handleOf = (v: string) => v.trim().replace(/^@/, '')

const COLUMNS: Column<AuditEntry>[] = [
  {
    key: 'when',
    head: T.columns.when,
    cell: (e) => <span title={dateTime(e.at)}>{ago(e.at)}</span>,
  },
  {
    key: 'who',
    head: T.columns.who,
    cell: (e) => <Link to={`/admin/users/${encodeURIComponent(e.admin)}`}>@{e.admin}</Link>,
  },
  {
    key: 'what',
    head: T.columns.what,
    className: 'audit-what',
    cell: (e) => {
      const words = lookup(T.actions, e.action)
      const more = detailLine(e)
      return (
        <>
          {words ?? <code>{e.action}</code>}
          {more ? <div className="hint">{more}</div> : null}
        </>
      )
    },
  },
  { key: 'on', head: T.columns.on, className: 'audit-on', cell: (e) => <Target e={e} /> },
  {
    key: 'reason',
    head: T.columns.reason,
    className: 'audit-reason',
    wideOnly: true,
    cell: (e) => (e.reason ? <span>{e.reason}</span> : null),
  },
]

/** What the line's detail adds to the action: the term, the role, the recipients. */
function detailLine(e: AuditEntry): string | null {
  const d = e.detail
  if (e.action === 'user.commenting_off' && typeof d.term === 'string') return lookup(T.detail.terms, d.term) ?? null
  if (e.action === 'user.role' && typeof d.role === 'string') return fill(T.detail.role, { role: d.role })
  if (e.action === 'notify.send' && typeof d.recipients === 'number') return count(T.detail.recipients, d.recipients, { n: num(d.recipients) })
  return null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** Where the thing an admin acted on lives, linked when it has a page. */
function Target({ e }: { e: AuditEntry }) {
  const id = e.target_id ?? ''
  const d = e.detail
  switch (e.target_kind) {
    case 'user':
      return <Link to={`/admin/users/${encodeURIComponent(id)}`}>{fill(T.targets.user, { id })}</Link>
    case 'comment':
      return <span className="mono" title={id}>{fill(T.targets.comment, { id: id.slice(0, 8) })}</span>
    case 'thread': {
      const host = str(d.host)
      const hostId = str(d.host_id)
      if (!host || !hostId) return <span className="mono">{fill(T.targets.other, { kind: e.target_kind, id })}</span>
      return (
        <Link to={host === 'match' ? `/matches/${hostId}` : `/models/${hostId}`}>
          {fill(T.targets.thread, { on: host === 'match' ? T.targets.threadMatch : T.targets.threadModel })}
        </Link>
      )
    }
    case 'comment_word':
      return <span>{fill(T.targets.comment_word, { word: str(d.word) ?? id })}</span>
    case 'season':
      return <Link to={`/admin/seasons?season=${encodeURIComponent(id)}`}>{fill(T.targets.season, { id })}</Link>
    case 'season_map':
      return <span className="mono">{fill(T.targets.season_map, { id })}</span>
    case 'baseline':
      return <span>{fill(T.targets.baseline, { id })}</span>
    case 'model':
      return <Link to={`/models/${id}`}>{T.targets.model}</Link>
    case 'match':
      return <Link to={`/matches/${id}`}>{T.targets.match}</Link>
    case 'post': {
      const name = str(d.title) ?? str(d.slug)
      return <Link to={`/admin/posts/${id}`}>{name ? fill(T.targets.post, { name }) : T.targets.postUntitled}</Link>
    }
    case 'announcement':
      return <Link to="/admin/announcements">{T.targets.announcement}</Link>
    case 'notify_send':
      return <Link to="/admin/notify">{T.targets.notify_send}</Link>
    case 'runner':
    case 'runner_key':
      return <Link to="/admin/runners">{fill(T.targets[e.target_kind], { label: str(d.label) ?? id })}</Link>
    case 'pick':
      return <Link to="/admin/picks">{T.targets.pick}</Link>
    default:
      return <span className="mono">{fill(T.targets.other, { kind: e.target_kind, id })}</span>
  }
}
