// Comments: one short line of plain text under a match or a model, and replies under a comment.
// The threads read like Hacker News: the composer on top, indented replies that fold, and a reply
// link under every comment's text.
//
// WHAT IS STORED IS WHAT WAS TYPED. `#126` in a comment's text is drawn as a link that moves the
// player to turn 126 and pauses it, on the watch page alone and only up to the match's last turn;
// the link is never saved, so a comment reads the same in the bell or a paste. A URL is text.
//
// THE PUBLIC THREAD IS CACHED WITH NO CALLER IN ITS KEY, so the author's own held comments come
// from /v1/me/comments and are placed here, marked as waiting for review. It re-reads every thirty
// seconds while the tab is visible, as the bell does; older pages, once shown, are kept.

import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, api, startSignIn, type Comment, type ReportReason, type Thread } from '../api'
import { useSession } from '../providers/session-context'
import { ago, dateTime } from '../lib/format'
import { cx } from '../lib/cx'
import { count, fill } from '../lib/copy'
import { Avatar } from './Avatar'
import { Icon } from './ui'
import common from '../../copy/common.json'

const T = common.comments
const MAX = 500
const NEAR = 440
const POLL_MS = 30_000

export type CommentHost = { match: string } | { model: string }

type Node = Comment & { mine?: boolean; kids: Node[] }

type Props = {
  host: CommentHost
  /** The match's last turn: `#n` up to it is a link. Absent on a model page, where every `#` is text. */
  lastTurn?: number | null
  /** The turn the player shows, which the composer's chip types at the cursor. */
  turn?: number | null
  /** Move the player to a turn and pause it. */
  onSeek?: (turn: number) => void
  className?: string
}

/** Keyed by its host, so another match or model starts from an empty thread. */
export function Comments(props: Props) {
  const key = 'match' in props.host ? `match:${props.host.match}` : `model:${props.host.model}`
  return <Threads {...props} key={key} />
}

function Threads({ host, lastTurn, turn, onSeek, className }: Props) {
  const { me } = useSession()
  const [first, setFirst] = useState<Thread | null>(null)
  const [older, setOlder] = useState<Thread[]>([])
  const [held, setHeld] = useState<(Comment & { mine: true })[]>([])
  const [failed, setFailed] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const hostRef = useRef(host)
  useEffect(() => {
    hostRef.current = host
  }, [host])

  const read = useCallback(async () => {
    try {
      const t = await api.thread(hostRef.current)
      setFirst(t)
      setFailed(false)
    } catch {
      setFailed(true)
    }
    if (me) {
      try {
        setHeld((await api.myHeldComments(hostRef.current)).comments)
      } catch {
        // Your waiting comments are a courtesy; the thread still draws without them.
      }
    }
  }, [me])

  useEffect(() => {
    void read()
  }, [read])

  // Every thirty seconds while the tab is visible, and once on coming back to it.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void read()
    }
    const t = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [read])

  const pages = useMemo(() => (first ? [first, ...older] : []), [first, older])
  const next = pages.length ? pages[pages.length - 1].next_cursor : null
  const showOlder = async () => {
    if (!next) return
    setLoadingOlder(true)
    try {
      const t = await api.thread(host, next)
      setOlder((o) => [...o, t])
    } catch {
      setFailed(true)
    } finally {
      setLoadingOlder(false)
    }
  }

  const tree = useMemo(() => build(pages, held), [pages, held])
  const total = first?.comments ?? 0
  const locked = first?.locked ?? false

  const post = async (body: string, parent?: string) => {
    const created = await api.postComment({ ...host, parent: parent ?? null, body } as Parameters<typeof api.postComment>[0])
    setReplyTo(null)
    if (created.state === 'held') setHeld((h) => [...h, created])
    await read()
  }

  const remove = async (id: string) => {
    await api.deleteComment(id)
    setHeld((h) => h.filter((c) => c.id !== id))
    await read()
  }

  const admin = me?.role === 'admin'
  const lock = async () => {
    await api.lockThread({ ...host, locked: !locked } as Parameters<typeof api.lockThread>[0])
    await read()
  }

  return (
    <section className={cx('cmts', className)} aria-labelledby="comments-h">
      <div className="cmts-head">
        <h2 id="comments-h">
          {T.title}
          <small>{total.toLocaleString('en-GB')}</small>
        </h2>
        {locked ? (
          <span className="cmts-locked">
            <Icon id="i-lock" />
            {T.locked}
          </span>
        ) : null}
        {admin ? (
          <button className="btn sm ghost push" type="button" onClick={() => void lock()}>
            <Icon id="i-lock" />
            {locked ? T.unlock : T.lock}
          </button>
        ) : null}
      </div>
      {locked ? null : me ? (
        me.comments_off_until ? (
          <div className="cmts-off">
            <Icon id="i-info" />
            <span>
              {me.comments_off_until === 'infinity'
                ? T.offForGood
                : fill(T.offUntil, { date: dateTime(me.comments_off_until) })}
              {me.comments_off_reason ? ` ${fill(T.offReason, { reason: me.comments_off_reason })}` : null}
            </span>
          </div>
        ) : (
          <Composer handle={me.handle} name={me.display_name} turn={lastTurn ? turn : null} onPost={(b) => post(b)} />
        )
      ) : (
        <div className="cmts-visitor">
          <p>{T.signInLine}</p>
          <button className="btn sm" type="button" onClick={() => startSignIn()}>
            <Icon id="i-github" />
            {T.signIn}
          </button>
        </div>
      )}
      {failed && !first ? (
        <p className="empty">{T.failed}</p>
      ) : !first ? (
        <div className="loading cmts-loading" aria-label={T.loading}>
          <div className="skel" />
          <div className="skel" />
        </div>
      ) : tree.length === 0 ? (
        <p className="empty">{T.empty}</p>
      ) : (
        <div className="cmts-threads">
          {tree.map((n) => (
            <Row
              node={n}
              depth={0}
              parentAuthor={null}
              key={n.id}
              ctx={{ me: me?.handle ?? null, lastTurn: lastTurn ?? null, turn: turn ?? null, onSeek, replyTo, setReplyTo, post, remove, locked }}
            />
          ))}
        </div>
      )}
      {next ? (
        <div className="cmts-foot">
          <button className="btn sm ghost" type="button" disabled={loadingOlder} onClick={() => void showOlder()}>
            {T.older}
          </button>
        </div>
      ) : null}
    </section>
  )
}

/** The pages' roots, newest first, each with its replies nested under their parents, oldest first;
 *  your held comments placed where they belong. */
function build(pages: Thread[], held: (Comment & { mine: true })[]): Node[] {
  const byId = new Map<string, Node>()
  const roots: Node[] = []
  const seen = new Set<string>()
  const add = (c: Comment & { mine?: boolean }) => {
    if (seen.has(c.id)) return
    seen.add(c.id)
    byId.set(c.id, { ...c, kids: [] })
  }
  for (const p of pages)
    for (const r of p.roots) {
      add(r)
      for (const x of r.replies) add(x)
    }
  for (const h of held) add(h)
  for (const n of byId.values()) {
    const parent = n.parent_id ? byId.get(n.parent_id) : null
    if (parent) parent.kids.push(n)
    else if (!n.parent_id) roots.push(n)
  }
  const oldest = (a: Node, b: Node) => a.created_at.localeCompare(b.created_at)
  for (const n of byId.values()) n.kids.sort(oldest)
  // Your held top-level comments first, as the newest thing on the page; then the public roots.
  return roots.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

type Ctx = {
  me: string | null
  lastTurn: number | null
  turn: number | null
  onSeek?: (turn: number) => void
  replyTo: string | null
  setReplyTo: (id: string | null) => void
  post: (body: string, parent?: string) => Promise<void>
  remove: (id: string) => Promise<void>
  locked: boolean
}

function hidden(n: Node): number {
  return 1 + n.kids.reduce((s, k) => s + hidden(k), 0)
}

function Row({ node: n, depth, parentAuthor, ctx }: { node: Node; depth: number; parentAuthor: string | null; ctx: Ctx }) {
  const [folded, setFolded] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const gone = n.state === 'deleted' || n.state === 'removed'
  const mine = Boolean(ctx.me && n.author === ctx.me)
  // Four levels on a phone, eight wider (CSS); a reply below the last level says whom it answers.
  const deep = depth >= 8
  return (
    <div className={cx('crow', folded && 'folded', n.state === 'held' && 'held')} id={`comment-${n.id}`} data-depth={Math.min(depth, 8)}>
      <div className="cmeta">
        <button className="cfold" type="button" aria-expanded={!folded} aria-label={folded ? T.unfold : T.fold} onClick={() => setFolded((f) => !f)}>
          {folded ? '[+]' : '[–]'}
        </button>
        {gone ? (
          <span>{T.deleted}</span>
        ) : (
          <>
            <Avatar handle={n.author ?? '?'} name={null} />
            <Link to={`/profile/${n.author}`}>
              <b>{fill(T.handle, { handle: n.author ?? '' })}</b>
            </Link>
            {n.owner ? <span className="badge accent">{T.owner}</span> : null}
          </>
        )}
        <time dateTime={n.created_at} title={dateTime(n.created_at)}>
          {ago(n.created_at)}
        </time>
        {n.state === 'held' ? <span className="badge warn">{T.waiting}</span> : null}
        {folded ? <span className="chidden">{count(T.hidden, hidden(n))}</span> : null}
        {!gone && ctx.me && !folded ? (
          <span className="cacts">
            {mine ? (
              confirming ? (
                <>
                  <button type="button" className="danger" onClick={() => void ctx.remove(n.id)}>
                    {T.deleteConfirm}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)}>
                    {T.cancel}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirming(true)}>
                  {T.delete}
                </button>
              )
            ) : n.state === 'live' ? (
              <button type="button" onClick={() => setReporting((r) => !r)}>
                {T.report}
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {gone ? null : (
        <p className="ctext">
          {deep && parentAuthor ? <span className="cto">{fill(T.replyingTo, { handle: parentAuthor })} </span> : null}
          <Text body={n.body ?? ''} lastTurn={ctx.lastTurn} onSeek={ctx.onSeek} />
        </p>
      )}
      {reporting ? <Report id={n.id} onDone={() => setReporting(false)} /> : null}
      {!gone && ctx.me && !ctx.locked && n.state === 'live' ? (
        ctx.replyTo === n.id ? (
          <div className="creply">
            <Composer reply turn={ctx.lastTurn ? ctx.turn : null} onPost={(b) => ctx.post(b, n.id)} onCancel={() => ctx.setReplyTo(null)} />
          </div>
        ) : (
          <div className="creply-line">
            <button type="button" onClick={() => ctx.setReplyTo(n.id)}>
              {T.reply}
            </button>
          </div>
        )
      ) : null}
      {n.kids.length ? (
        <div className={cx('ckids', depth >= 7 && 'flat')}>
          {n.kids.map((k) => (
            <Row node={k} depth={depth + 1} parentAuthor={n.author} ctx={ctx} key={k.id} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** The text as typed, with `#n` a link to turn n where there is a player and n is a turn in it. */
function Text({ body, lastTurn, onSeek }: { body: string; lastTurn: number | null; onSeek?: (turn: number) => void }) {
  if (lastTurn === null || !onSeek) return <>{body}</>
  const out: ReactNode[] = []
  const re = /#(\d{1,6})\b/g
  let at = 0
  for (const m of body.matchAll(re)) {
    const n = Number(m[1])
    if (n > lastTurn) continue
    const i = m.index ?? 0
    if (i > at) out.push(body.slice(at, i))
    out.push(
      <button type="button" className="tref" onClick={() => onSeek(n)} title={fill(T.seek, { turn: n })} key={i}>
        {m[0]}
      </button>,
    )
    at = i + m[0].length
  }
  if (at < body.length) out.push(body.slice(at))
  return <>{out}</>
}

const REASONS: ReportReason[] = ['spam', 'abuse', 'off_topic', 'other']

function Report({ id, onDone }: { id: string; onDone: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [words, setWords] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const send = async () => {
    setState('sending')
    try {
      await api.reportComment(id, { reason, words: words.trim() || null })
      setState('sent')
      window.setTimeout(onDone, 1500)
    } catch {
      setState('failed')
    }
  }
  if (state === 'sent') return <p className="creport-done">{T.reportSent}</p>
  return (
    <form
      className="creport"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <div className="seg" role="group" aria-label={T.reportReason}>
        {REASONS.map((r) => (
          <button type="button" aria-pressed={reason === r} onClick={() => setReason(reason === r ? null : r)} key={r}>
            {T.reasons[r]}
          </button>
        ))}
      </div>
      <input className="input" maxLength={200} value={words} onChange={(e) => setWords(e.target.value)} placeholder={T.reportWords} aria-label={T.reportWords} />
      <button className="btn sm primary" type="submit" disabled={state === 'sending'}>
        {T.reportSend}
      </button>
      <button className="btn sm ghost" type="button" onClick={onDone}>
        {T.cancel}
      </button>
      {state === 'failed' ? <span className="form-error">{T.reportFailed}</span> : null}
    </form>
  )
}

/** One field, one line, 500 characters; Enter posts. The chip types the player's turn at the
 *  cursor. A refusal says what happened and how long to wait. */
function Composer({
  handle,
  name,
  reply = false,
  turn,
  onPost,
  onCancel,
}: {
  handle?: string
  name?: string | null
  reply?: boolean
  turn?: number | null
  onPost: (body: string) => Promise<void>
  onCancel?: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (reply) field.current?.focus()
  }, [reply])

  const insertTurn = () => {
    if (turn === null || turn === undefined) return
    const el = field.current
    const tag = `#${turn}`
    const at = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? at
    const before = text.slice(0, at)
    const pad = before && !before.endsWith(' ') ? ' ' : ''
    const next = `${before}${pad}${tag} ${text.slice(end)}`.slice(0, MAX)
    setText(next)
    requestAnimationFrame(() => {
      el?.focus()
      const caret = before.length + pad.length + tag.length + 1
      el?.setSelectionRange(caret, caret)
    })
  }

  const submit = async () => {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    setError(null)
    try {
      await onPost(body)
      setText('')
    } catch (e) {
      setError(refusal(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className={cx('ccomposer', reply && 'reply')}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {handle && !reply ? <Avatar handle={handle} name={name ?? null} /> : null}
      <div className="ccomposer-field">
        <input
          ref={field}
          className="input"
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value.replace(/[\r\n]+/g, ' '))}
          placeholder={reply ? T.replyPlaceholder : T.placeholder}
          aria-label={reply ? T.replyPlaceholder : T.placeholder}
          disabled={busy}
        />
        {text.length >= NEAR ? <span className={cx('ccount', text.length >= MAX && 'full')}>{MAX - text.length}</span> : null}
        {turn !== null && turn !== undefined ? (
          <button className="cchip" type="button" onClick={insertTurn} title={fill(T.turnChip, { turn })}>
            <Icon id="i-hash" />
            {turn}
          </button>
        ) : null}
      </div>
      <button className="btn sm primary" type="submit" disabled={busy || !text.trim()}>
        {reply ? T.replySend : T.post}
      </button>
      {onCancel ? (
        <button className="btn sm ghost" type="button" onClick={onCancel}>
          {T.cancel}
        </button>
      ) : null}
      {error ? <p className="form-error ccomposer-error" role="alert">{error}</p> : null}
    </form>
  )
}

function refusal(e: unknown): string {
  if (!(e instanceof ApiError)) return T.refused.unknown
  const body = (e.body ?? {}) as { retry_after?: number; until?: string; reason?: string | null }
  switch (e.code) {
    case 'too_fast':
      return fill(T.refused.tooFast, { n: body.retry_after ?? 15 })
    case 'daily_limit':
      return T.refused.dailyLimit
    case 'commenting_off':
      return body.until === 'infinity' ? T.offForGood : fill(T.offUntil, { date: dateTime(body.until ?? null) })
    case 'thread_locked':
      return T.refused.locked
    case 'body_invalid':
      return T.refused.bodyInvalid
    case 'unknown_parent':
      return T.refused.unknownParent
    default:
      return T.refused.unknown
  }
}
