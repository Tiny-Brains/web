// `/admin/comments` — admin session only: the comments desk.
//
// FOUR TABS OVER ONE LIST. Held (oldest first: what the filter tagged, for a link or a listed word,
// waiting however long it takes), Reported (most reported first), All (newest first, the only one a
// removed comment can be restored from) and Words, the list the filter tags on. The tab, the search
// and the open comment live in the address (`?tab=`, `?q=`, `?c=`), so a desk is a link another
// admin can open.
//
// A ROW OPENS THE DETAIL BESIDE THE LIST: the comment in its thread, where it was said, its author's
// counts, and the actions. The detail keeps the comment it was opened on after a decision takes it
// off the list (an approved held comment leaves Held at once), so the admin sees what they did.
//
// THE CURSORS ARE SOMA'S: an offset for Held and Reported (a count moves under a keyset) and a
// keyset for All. A decision reloads from the first page rather than patching rows in place, since
// every offset after it has shifted.
//
// Soma writes every decision, lock and word change to the audit log. A desktop page: a phone gets
// the list and not the detail, nor the selection.

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ApiError, api, type AdminComment, type AdminCommentPage, type Comment, type CommentDecision, type CommentState,
  type CommentView, type ReportReason, type Thread,
} from '../api'
import { useApi } from '../lib/useApi'
import { useQueryState } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { ago, date, dateTime, num } from '../lib/format'
import { Shell } from '../components/Shell'
import {
  Badge, type BadgeTone, EmptyState, Icon, Loading, Notice, PageHeader, Panel, PanelHead, Skel, Tabs,
} from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { InlineError, AdminGate } from '../components/ErrorStates'
import { count, fill, lookup } from '../lib/copy'
import T from '../../copy/admin-comments.json'
import common from '../../copy/common.json'

export default function CommentsAdmin() {
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

  return <Desk />
}

type Tab = CommentView | 'words'
const TABS: Tab[] = ['held', 'reported', 'all', 'words']
/** Soma's own bound on one decision. */
const MOST = 100

type Said = { ok: boolean; text: string }

function Desk() {
  const [get, set] = useQueryState()
  const [params] = useSearchParams()
  const raw = get('tab')
  const tab: Tab = (TABS as string[]).includes(raw) ? (raw as Tab) : 'held'
  const q = get('q')
  const open = get('c')

  // The Words tab still reads the Held list: it is what carries the tab counts.
  const view: CommentView = tab === 'words' ? 'held' : tab
  const [nonce, setNonce] = useState(0)
  const list = useList(view, tab === 'words' ? '' : q, nonce)
  const words = useApi('admin-words', () => api.adminWords())
  const [wordsKept, setWordsKept] = useState(words.data)
  if (words.data && words.data !== wordsKept) setWordsKept(words.data)
  const wordList = words.data ?? wordsKept

  // The selection belongs to one list: another tab or search starts with none.
  const base = `${view}|${q}`
  const [sel, setSel] = useState<{ base: string; ids: string[] }>({ base, ids: [] })
  const picked = sel.base === base ? sel.ids : []
  const toggle = (id: string) =>
    setSel({ base, ids: picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < MOST ? [...picked, id] : picked })
  const toggleAll = () =>
    setSel({ base, ids: picked.length ? [] : list.rows.slice(0, MOST).map((c) => c.id) })

  // The open comment: its row while the list holds it, else the copy taken when it was opened.
  const [snap, setSnap] = useState<AdminComment | null>(null)
  const shown = list.rows.find((c) => c.id === open) ?? (snap?.id === open ? snap : null)
  const [locks, setLocks] = useState<Record<string, boolean>>({})

  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<Said | null>(null)
  const [removing, setRemoving] = useState(false)

  // The search box writes the address when the typing stops, not once per key.
  const [typed, setTyped] = useState(q)
  const [seenQ, setSeenQ] = useState(q)
  if (q !== seenQ) {
    setSeenQ(q)
    if (typed.trim() !== q) setTyped(q)
  }
  useEffect(() => {
    if (typed.trim() === q) return
    const t = setTimeout(() => set({ q: typed.trim(), c: '' }), 250)
    return () => clearTimeout(t)
  }, [typed, q, set])

  const tabHref = (t: Tab) => {
    const next = new URLSearchParams(params)
    next.delete('c')
    if (t === 'held') next.delete('tab')
    else next.set('tab', t)
    if (t === 'words') next.delete('q')
    const s = next.toString()
    return s ? `/admin/comments?${s}` : '/admin/comments'
  }

  const decide = async (ids: string[], action: CommentDecision, reason?: string) => {
    setBusy(true)
    setSaid(null)
    try {
      const r = await api.decideComments({ ids, action, reason: reason?.trim() || null })
      const left = ids.length - r.decided
      setSaid({
        ok: r.decided > 0,
        text: [count(T.said[action], r.decided), left > 0 ? count(T.said.skipped, left) : ''].filter(Boolean).join(' '),
      })
      const now = shown ? r.comments.find((x) => x.id === shown.id) : undefined
      if (shown && now) setSnap({ ...shown, state: now.state, decided_at: now.decided_at })
      setSel({ base, ids: [] })
      setRemoving(false)
      setNonce((n) => n + 1)
    } catch (err) {
      setSaid({ ok: false, text: refusal(err) })
    } finally {
      setBusy(false)
    }
  }

  const lock = async (c: AdminComment, locked: boolean) => {
    setBusy(true)
    setSaid(null)
    try {
      const r = await api.lockThread({ thread: c.thread.id, locked })
      setLocks((l) => ({ ...l, [r.thread_id]: r.locked }))
      setSaid({ ok: true, text: r.locked ? T.said.locked : T.said.unlocked })
    } catch (err) {
      setSaid({ ok: false, text: refusal(err) })
    } finally {
      setBusy(false)
    }
  }

  const openRow = (c: AdminComment) => {
    setSnap(c)
    setSaid(null)
    set({ c: c.id })
  }

  const counts = list.page?.counts
  const tabItems = TABS.map((t) => ({
    key: t,
    label: T.tabs[t],
    to: tabHref(t),
    count: t === 'held' ? counts?.held : t === 'reported' ? counts?.reported : t === 'words' ? wordList?.words.length : null,
  }))

  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[{ label: common.admin.crumb, to: '/admin/seasons' }, { label: T.header.crumb }]}
        title={T.header.title}
        icon="i-comment"
        badges={<Badge tone="info">{common.admin.badge}</Badge>}
      >
        <AdminTabs current="comments" />
      </PageHeader>

      <div className="wrap page-body">
        <div className="desk cdesk">
          <Panel className="desk-strip">
            <div className="strip-row">
              <Tabs label={T.tabs.label} current={tab} items={tabItems} />
              {tab !== 'words' ? (
                <input
                  className="input desk-search"
                  type="search"
                  aria-label={T.search}
                  placeholder={T.search}
                  maxLength={80}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
              ) : null}
              {tab !== 'words' ? (
                <div className="strip-actions cdesk-bulk">
                  <span className="strip-fact">{count(T.bulk.selected, picked.length)}</span>
                  {tab === 'held' || tab === 'all' ? (
                    <button className="btn sm" type="button" disabled={busy || !picked.length} onClick={() => void decide(picked, 'approve')}>
                      <Icon id="i-check" />
                      {T.bulk.approve}
                    </button>
                  ) : null}
                  <button className="btn sm" type="button" disabled={busy || !picked.length} onClick={() => setRemoving(true)}>
                    <Icon id="i-x" />
                    {T.bulk.remove}
                  </button>
                  {tab === 'all' ? (
                    <button className="btn sm" type="button" disabled={busy || !picked.length} onClick={() => void decide(picked, 'restore')}>
                      {T.bulk.restore}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            {removing && picked.length ? (
              <div className="strip-sheet">
                <RemoveForm n={picked.length} busy={busy} onCancel={() => setRemoving(false)} onRemove={(reason) => void decide(picked, 'remove', reason)} />
              </div>
            ) : null}
            {said ? (
              <div className="strip-sheet">
                <Notice tone={said.ok ? 'ok' : 'bad'} title={said.text} />
              </div>
            ) : null}
          </Panel>

          {tab === 'words' ? (
            <Words list={wordList?.words ?? null} error={words.error && !wordList ? words.error : null} reload={words.reload} />
          ) : (
            <div className="desk-lists cdesk-lists">
              <Panel className="fill">
                <div className="fill-scroll">
                  {list.error && !list.page ? (
                    <InlineError error={list.error} what={T.list.what} />
                  ) : (
                    <CommentTable
                      view={view}
                      rows={list.page ? list.rows : null}
                      empty={q ? fill(T.list.empty.search, { q }) : T.list.empty[view]}
                      open={open}
                      picked={picked}
                      onToggle={toggle}
                      onToggleAll={toggleAll}
                      onOpen={openRow}
                    />
                  )}
                </div>
                <div className="fill-foot cdesk-foot">
                  <span className="muted">
                    {list.page
                      ? view === 'held'
                        ? count(T.list.waiting, list.page.counts.held, { n: num(list.page.counts.held) })
                        : view === 'reported'
                          ? count(T.list.reportedCount, list.page.counts.reported, { n: num(list.page.counts.reported) })
                          : count(T.list.shown, list.rows.length, { n: num(list.rows.length) })
                      : null}
                  </span>
                  {picked.length >= MOST ? <span className="muted">{T.bulk.most}</span> : null}
                  <span className="cdesk-phone muted">{T.list.phone}</span>
                  {list.moreError ? <span className="muted">{T.list.moreFailed}</span> : null}
                  {list.cursor ? (
                    <button className="btn sm desk-more" type="button" disabled={list.loadingMore} onClick={() => void list.loadMore()}>
                      {list.loadingMore ? T.list.loadingMore : T.list.more}
                    </button>
                  ) : null}
                </div>
              </Panel>

              <Detail
                key={shown?.id ?? 'none'}
                c={shown}
                locked={shown ? (locks[shown.thread.id] ?? shown.thread.locked) : false}
                busy={busy}
                nonce={nonce}
                onDecide={(c, action, reason) => void decide([c.id], action, reason)}
                onLock={(c, locked) => void lock(c, locked)}
              />
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}

// ---------- the list ----------

type ListState = {
  page: AdminCommentPage | null
  rows: AdminComment[]
  error: ApiError | null
  cursor: string | null
  loadingMore: boolean
  moreError: boolean
  loadMore: () => Promise<void>
}

/** The first page through `useApi`, the pages after it appended here. A reload of the same list
 *  keeps the rows it had until the new ones arrive; another list starts from skeletons. */
function useList(view: CommentView, q: string, nonce: number): ListState {
  const base = `${view}|${q}`
  const key = `${base}|${nonce}`
  const first = useApi(`admin-comments:${key}`, () => api.adminComments({ view, q: q || null }))
  const [kept, setKept] = useState<{ base: string; page: AdminCommentPage } | null>(null)
  if (first.data && kept?.page !== first.data) setKept({ base, page: first.data })
  const page = first.data ?? (kept?.base === base ? kept.page : null)

  const [more, setMore] = useState<{ key: string; rows: AdminComment[]; cursor: string | null; busy: boolean; failed: boolean; loaded: boolean }>({
    key: '', rows: [], cursor: null, busy: false, failed: false, loaded: false,
  })
  const extra = more.key === key && first.data ? more : null
  // An offset page can repeat a row that moved up while the admin read: one row per id.
  const rows: AdminComment[] = []
  const seen = new Set<string>()
  for (const c of [...(page?.comments ?? []), ...(extra?.rows ?? [])]) {
    if (!seen.has(c.id)) {
      seen.add(c.id)
      rows.push(c)
    }
  }
  const cursor = extra?.loaded ? extra.cursor : (first.data?.next_cursor ?? null)

  const loadMore = async () => {
    if (!cursor) return
    setMore({ key, rows: extra?.rows ?? [], cursor, busy: true, failed: false, loaded: extra?.loaded ?? false })
    try {
      const next = await api.adminComments({ view, q: q || null, cursor })
      setMore((m) => (m.key === key ? { key, rows: [...m.rows, ...next.comments], cursor: next.next_cursor, busy: false, failed: false, loaded: true } : m))
    } catch {
      setMore((m) => (m.key === key ? { ...m, busy: false, failed: true } : m))
    }
  }

  return {
    page,
    rows,
    error: first.error,
    cursor,
    loadingMore: Boolean(extra?.busy),
    moreError: Boolean(extra?.failed),
    loadMore,
  }
}

function CommentTable({
  view,
  rows,
  empty,
  open,
  picked,
  onToggle,
  onToggleAll,
  onOpen,
}: {
  view: CommentView
  rows: AdminComment[] | null
  empty: string
  open: string
  picked: string[]
  onToggle: (id: string) => void
  onToggleAll: () => void
  onOpen: (c: AdminComment) => void
}) {
  if (rows && rows.length === 0) return <EmptyState>{empty}</EmptyState>
  const third = view === 'held' ? T.list.why : view === 'reported' ? T.list.reports : T.list.state
  return (
    <div className="tscroll">
      <table className="table cdesk-table">
        <thead>
          <tr>
            <th className="cdesk-chk">
              <input
                type="checkbox"
                aria-label={T.list.pickAll}
                title={T.list.pickAll}
                checked={Boolean(rows?.length) && picked.length > 0}
                disabled={!rows?.length}
                onChange={onToggleAll}
              />
            </th>
            <th>{T.list.comment}</th>
            <th>{third}</th>
          </tr>
        </thead>
        <tbody aria-busy={rows === null || undefined}>
          {rows === null
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <td className="cdesk-chk" />
                  <td>
                    <div className="cdesk-text">
                      <Skel w="85%" />
                    </div>
                    <div className="cdesk-meta">
                      <Skel w={180} />
                    </div>
                  </td>
                  <td>
                    <Skel w={60} />
                  </td>
                </tr>
              ))
            : rows.map((c) => {
                const on = picked.includes(c.id)
                return (
                  <tr
                    key={c.id}
                    className={c.id === open ? 'cdesk-open' : undefined}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a, input, button')) return
                      onOpen(c)
                    }}
                  >
                    <td className="cdesk-chk">
                      <input
                        type="checkbox"
                        aria-label={T.list.pick}
                        checked={on}
                        disabled={!on && picked.length >= MOST}
                        onChange={() => onToggle(c.id)}
                      />
                    </td>
                    <td>
                      <button className="cdesk-text" type="button" aria-pressed={c.id === open} onClick={() => onOpen(c)}>
                        {c.body}
                      </button>
                      <div className="cdesk-meta">
                        <Link to={deskPath(c.author.handle)}>@{c.author.handle}</Link>
                        <span aria-hidden="true">·</span>
                        <Where c={c} />
                        <span aria-hidden="true">·</span>
                        <span title={dateTime(c.created_at)}>{ago(c.created_at)}</span>
                        {c.thread.locked ? <Icon id="i-lock" label={T.detail.locked} /> : null}
                      </div>
                    </td>
                    <td>
                      {view === 'held' ? (
                        <HoldTag tag={c.hold_tag} />
                      ) : view === 'reported' ? (
                        <Reports c={c} />
                      ) : (
                        <div className="cdesk-tags">
                          <StateBadge state={c.state} />
                          {c.state === 'held' ? <HoldTag tag={c.hold_tag} /> : null}
                          {c.reports.count ? <span className="muted">{count(T.reportCount, c.reports.count)}</span> : null}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
        </tbody>
      </table>
    </div>
  )
}

function Reports({ c }: { c: AdminComment }) {
  const words = c.reports.recent.find((r) => r.words)?.words
  return (
    <div className="cdesk-tags">
      <Badge tone="bad">{count(T.reportCount, c.reports.count)}</Badge>
      <span className="muted">{reasonLine(c.reports.reasons)}</span>
      {words ? <span className="cdesk-words">{fill(T.quoted, { words })}</span> : null}
    </div>
  )
}

// ---------- the detail ----------

function Detail({
  c,
  locked,
  busy,
  nonce,
  onDecide,
  onLock,
}: {
  c: AdminComment | null
  locked: boolean
  busy: boolean
  nonce: number
  onDecide: (c: AdminComment, action: CommentDecision, reason?: string) => void
  onLock: (c: AdminComment, locked: boolean) => void
}) {
  const [removing, setRemoving] = useState(false)
  const host = c ? (c.host === 'match' ? { match: c.host_id } : { model: c.host_id }) : null
  const thread = useApi(`thread:${c?.host}:${c?.host_id}:${nonce}`, () => api.thread(host ?? { match: '' }), Boolean(c))
  const author = useApi(`admin-user:${c?.author.id}:${nonce}`, () => api.adminUser(c?.author.id ?? ''), Boolean(c))

  if (!c) {
    return (
      <Panel className="fill cdesk-detail">
        <EmptyState>{T.detail.none}</EmptyState>
      </Panel>
    )
  }

  const off = author.data ? author.data.user.comments_off_until : c.author.commenting_off_until
  const counts = author.data?.counts

  return (
    <Panel className="fill cdesk-detail">
      <PanelHead
        title={<h3>{fill(T.detail.handle, { handle: c.author.handle })}</h3>}
        end={
          <Link to={deskPath(c.author.handle)} aria-label={fill(T.detail.openDeskLabel, { handle: c.author.handle })}>
            {T.detail.openDesk}
          </Link>
        }
      />
      <div className="cdesk-body">
        <h4>
          {T.detail.thread}
          {locked ? <Badge tone="off">{T.detail.locked}</Badge> : null}
        </h4>
        <ThreadView c={c} thread={thread.state === 'loading' ? undefined : thread.data} />

        <dl className="kvs">
          <dt>{T.detail.where}</dt>
          <dd>
            <Where c={c} />
          </dd>
          <dt>{T.detail.said}</dt>
          <dd>{dateTime(c.created_at)}</dd>
          {c.decided_at ? (
            <>
              <dt>{T.detail.decided}</dt>
              <dd>
                <span className="cdesk-tags">
                  <StateBadge state={c.state} />
                  {c.decided_by ? fill(T.detail.decidedBy, { when: dateTime(c.decided_at), handle: c.decided_by }) : dateTime(c.decided_at)}
                </span>
              </dd>
            </>
          ) : null}
        </dl>

        <h4>{T.detail.author}</h4>
        {author.error ? <p className="muted">{T.detail.authorFailed}</p> : null}
        <dl className="kvs">
          <dt>{T.detail.comments}</dt>
          <dd>
            {counts ? (
              fill(T.detail.commentCounts, { live: num(counts.live), held: num(counts.held), removed: num(counts.removed) })
            ) : (
              <Skel w={160} />
            )}
          </dd>
          <dt>{T.detail.reported}</dt>
          <dd>{counts ? count(T.detail.reportedCount, counts.reported, { n: num(counts.reported) }) : <Skel w={90} />}</dd>
          <dt>{T.detail.commenting}</dt>
          <dd>
            {off ? (
              <span className="cdesk-tags">
                <Badge tone="bad">{T.detail.off}</Badge>
                {off === 'infinity' ? T.detail.offForGood : fill(T.detail.offUntil, { date: date(off) })}
              </span>
            ) : (
              <Badge tone="ok">{T.detail.on}</Badge>
            )}
          </dd>
        </dl>

        {c.reports.count ? (
          <>
            <h4>{T.detail.reports}</h4>
            <dl className="kvs">
              <dt>{T.detail.reasons}</dt>
              <dd>{reasonLine(c.reports.reasons)}</dd>
              <dt>{T.detail.newest}</dt>
              <dd>
                <ul className="cdesk-reports">
                  {c.reports.recent.map((r, i) => (
                    <li key={i}>
                      <span className="muted">
                        {fill(T.detail.reportBy, { reporter: r.reporter, reason: reasonWord(r.reason), when: ago(r.at) })}
                      </span>
                      {r.words ? <span>{fill(T.quoted, { words: r.words })}</span> : null}
                    </li>
                  ))}
                </ul>
              </dd>
            </dl>
          </>
        ) : null}
      </div>
      <div className="fill-foot cdesk-acts">
        {removing ? (
          <RemoveForm n={1} busy={busy} onCancel={() => setRemoving(false)} onRemove={(reason) => onDecide(c, 'remove', reason)} />
        ) : (
          <div className="row">
            {c.state === 'held' ? (
              <button className="btn sm primary" type="button" disabled={busy} onClick={() => onDecide(c, 'approve')}>
                <Icon id="i-check" />
                {T.detail.approve}
              </button>
            ) : null}
            {c.state === 'live' || c.state === 'held' ? (
              <button className="btn sm" type="button" disabled={busy} onClick={() => setRemoving(true)}>
                <Icon id="i-x" />
                {T.detail.remove}
              </button>
            ) : null}
            {c.state === 'removed' ? (
              <button className="btn sm" type="button" disabled={busy} onClick={() => onDecide(c, 'restore')}>
                {T.detail.restore}
              </button>
            ) : null}
            <button className="btn sm" type="button" disabled={busy} onClick={() => onLock(c, !locked)}>
              <Icon id="i-lock" />
              {locked ? T.detail.unlock : T.detail.lock}
            </button>
          </div>
        )}
      </div>
    </Panel>
  )
}

type Line = { id: string; author: string | null; body: string | null; at: string; reply: boolean; state: CommentState; tag: string | null }

const lineOf = (x: Comment, reply: boolean): Line => ({
  id: x.id, author: x.author, body: x.body, at: x.created_at, reply, state: x.state, tag: x.hold_tag,
})

/** The comment among its neighbours. The public thread never carries a held comment, and carries a
 *  removed one only as a placeholder, so the desk's own copy is put in its place by time. */
function ThreadView({ c, thread }: { c: AdminComment; thread: Thread | null | undefined }) {
  if (thread === undefined) {
    return (
      <div className="cdesk-thread" aria-busy="true" aria-label={T.detail.threadLoading}>
        <Skel w="60%" />
        <Skel w="90%" />
        <Skel w="75%" />
      </div>
    )
  }
  const self: Line = { id: c.id, author: c.author.handle, body: c.body, at: c.created_at, reply: c.root_id !== c.id, state: c.state, tag: c.hold_tag }
  const root = thread?.roots.find((r) => r.id === c.root_id)
  let lines: Line[]
  if (c.root_id === c.id) {
    lines = [self, ...(root?.replies ?? []).filter((r) => r.id !== c.id).map((r) => lineOf(r, true))]
  } else if (root) {
    const replies = [...root.replies.filter((r) => r.id !== c.id).map((r) => lineOf(r, true)), self]
    replies.sort((a, b) => a.at.localeCompare(b.at))
    lines = [lineOf(root, false), ...replies]
  } else {
    lines = [self]
  }
  return (
    <>
      {thread === null ? <p className="muted">{T.detail.threadFailed}</p> : null}
      {thread && !root && c.root_id !== c.id ? <p className="muted">{T.detail.threadFar}</p> : null}
      <div className="cdesk-thread">
        {lines.map((l) => (
          <div className={l.id === c.id ? 'cdesk-line this' : l.reply ? 'cdesk-line reply' : 'cdesk-line'} key={l.id}>
            <small>
              {l.author ? `@${l.author}` : null}
              {l.author ? ' · ' : null}
              {ago(l.at)}
              {l.id === c.id || l.state !== 'live' ? (
                <>
                  {' '}
                  <StateBadge state={l.state} />
                </>
              ) : null}
              {l.id === c.id && l.state === 'held' ? (
                <>
                  {' '}
                  <HoldTag tag={l.tag} />
                </>
              ) : null}
            </small>
            <span className={l.body === null ? 'muted' : undefined}>{l.body ?? T.detail.gone}</span>
          </div>
        ))}
      </div>
    </>
  )
}

// ---------- the Words tab ----------

function Words({
  list,
  error,
  reload,
}: {
  list: { id: string; word: string; added_by: string; added_at: string }[] | null
  error: ApiError | null
  reload: () => void
}) {
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<Said | null>(null)

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const w = word.trim()
    if (!w) return
    setBusy(true)
    setSaid(null)
    try {
      const made = await api.addWord(w)
      setSaid({ ok: true, text: fill(T.words.added, { word: made.word }) })
      setWord('')
      reload()
    } catch (err) {
      setSaid({ ok: false, text: refusal(err, w) })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string, w: string) => {
    setBusy(true)
    setSaid(null)
    try {
      await api.removeWord(id)
      setSaid({ ok: true, text: fill(T.words.removed, { word: w }) })
    } catch (err) {
      setSaid({ ok: false, text: refusal(err, w) })
    } finally {
      setBusy(false)
      reload()
    }
  }

  let body: ReactNode
  if (error) body = <InlineError error={error} what={T.words.what} />
  else if (list === null)
    body = (
      <div className="cdesk-words-grid" aria-busy="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span className="cdesk-word" key={i}>
            <Skel w={70} />
          </span>
        ))}
      </div>
    )
  else if (list.length === 0) body = <EmptyState>{T.words.empty}</EmptyState>
  else
    body = (
      <ul className="cdesk-words-grid">
        {list.map((w) => (
          <li className="cdesk-word" key={w.id} title={fill(T.words.addedBy, { handle: w.added_by, date: date(w.added_at) })}>
            <span>{w.word}</span>
            <button
              className="icon-btn"
              type="button"
              disabled={busy}
              aria-label={fill(T.words.remove, { word: w.word })}
              title={fill(T.words.remove, { word: w.word })}
              onClick={() => void remove(w.id, w.word)}
            >
              <Icon id="i-x" />
            </button>
          </li>
        ))}
      </ul>
    )

  return (
    <Panel className="fill">
      <PanelHead
        title={T.words.title}
        end={
          <form className="row" onSubmit={(e) => void add(e)}>
            <input
              className="input cdesk-add"
              aria-label={T.words.addLabel}
              placeholder={T.words.addPlaceholder}
              maxLength={40}
              value={word}
              onChange={(e) => setWord(e.target.value)}
            />
            <button className="btn sm primary" type="submit" disabled={busy || !word.trim()}>
              <Icon id="i-plus" />
              {T.words.add}
            </button>
          </form>
        }
      />
      {said ? (
        <div className="cdesk-said">
          <Notice tone={said.ok ? 'ok' : 'bad'} title={said.text} />
        </div>
      ) : null}
      <div className="fill-scroll cdesk-scroll">{body}</div>
      <div className="fill-foot">
        <span className="muted">{T.words.foot}</span>
      </div>
    </Panel>
  )
}

// ---------- small parts ----------

/** A removal with an optional reason, which lands in the audit line. */
function RemoveForm({ n, busy, onRemove, onCancel }: { n: number; busy: boolean; onRemove: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('')
  return (
    <form
      className="strip-form"
      onSubmit={(e) => {
        e.preventDefault()
        onRemove(reason)
      }}
    >
      <label className="cdesk-reason">
        {T.removeForm.reason}
        <input className="input" maxLength={300} placeholder={T.removeForm.placeholder} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button className="btn sm danger" type="submit" disabled={busy}>
        {count(T.removeForm.confirm, n)}
      </button>
      <button className="btn sm" type="button" onClick={onCancel}>
        {T.removeForm.cancel}
      </button>
    </form>
  )
}

function Where({ c }: { c: AdminComment }) {
  const to = c.host === 'match' ? `/matches/${c.host_id}#comment-${c.id}` : `/models/${c.host_id}#comment-${c.id}`
  const words = c.host === 'match' ? T.where.match : c.host_name ? fill(T.where.model, { name: c.host_name }) : T.where.modelUnnamed
  return (
    <Link className="cdesk-where" to={to}>
      <Icon id={c.host === 'match' ? 'i-matches' : 'i-flask'} />
      {words}
    </Link>
  )
}

/** Why the filter held it: a link, or the listed word it carried. */
function HoldTag({ tag }: { tag: string | null }) {
  if (!tag) return null
  return <span className="cdesk-tag">{tag === 'link' ? T.tag.link : fill(T.tag.word, { word: tag })}</span>
}

const STATE_TONE: Record<CommentState, BadgeTone> = { live: 'ok', held: 'wait', removed: 'bad', deleted: 'off' }

function StateBadge({ state }: { state: CommentState }) {
  return <Badge tone={STATE_TONE[state] ?? 'off'}>{T.state[state] ?? state}</Badge>
}

function reasonWord(r: ReportReason | 'none' | null): string {
  return T.reasons[r ?? 'none'] ?? r ?? T.reasons.none
}

/** "abuse ×2, spam ×1", most given first. */
function reasonLine(reasons: Partial<Record<ReportReason | 'none', number>>): string {
  return (Object.entries(reasons) as [ReportReason | 'none', number][])
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => fill(T.reasonCount, { reason: reasonWord(r), n }))
    .join(', ')
}

function deskPath(handle: string): string {
  return `/admin/users/${encodeURIComponent(handle)}`
}

/** Soma's refusal, as a sentence. `word` names the word a Words refusal was about. */
function refusal(err: unknown, word = ''): string {
  if (err instanceof ApiError) {
    const said = lookup(T.refusals.said, err.code)
    if (said !== undefined) {
      const listed = (err.body as { word?: unknown } | undefined)?.word
      return fill(said, { word: typeof listed === 'string' ? listed : word })
    }
    if (err.status === 0) return T.refusals.unreachable
  }
  return err instanceof Error ? err.message : T.refusals.fallback
}
