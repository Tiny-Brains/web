// `/admin/picks` — admin session only. The matches pinned for the home TV's Staff picks channel,
// in the order it plays them, across every game. The channel shows on home while at least one is
// pinned.
//
// A PICK IS PINNED BY ITS MATCH, typed or pasted: a bare id or any address carrying one (the watch
// page's, with or without the host), since the id is all Soma takes. It joins the end of the list.
//
// THE ORDER IS SENT WHOLE: a move swaps two neighbours and sends every live pick id in the new order,
// which is what Soma checks against (409 `order_incomplete` when another admin pinned or unpinned
// meanwhile). Every write answers the whole list, and that answer replaces what is drawn.

import { useState } from 'react'
import { api, ApiError, type AdminPick, type AdminPickList } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { ago, dateTime } from '../lib/format'
import { count, fill, lookup } from '../lib/copy'
import { Shell } from '../components/Shell'
import { MatchCard } from '../components/MatchCard'
import { Badge, EmptyState, Icon, IconLabel, Notice, PageHeader, PagePlaceholder, Panel, PanelFoot, PanelHead } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { AdminGate, InlineError } from '../components/ErrorStates'
import T from '../../copy/admin-picks.json'
import common from '../../copy/common.json'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export default function PicksAdmin() {
  const { me, session } = useSession()

  if (session.state === 'loading') {
    return (
      <Shell title={T.tab}>
        <PagePlaceholder label={common.site.checkingSession} />
      </Shell>
    )
  }

  if (!me || me.role !== 'admin') {
    return (
      <Shell title={T.tab}>
        <AdminGate signedIn={Boolean(me)} />
      </Shell>
    )
  }

  return <Desk />
}

function Desk() {
  const list = useApi('admin-picks', () => api.adminPicks())
  // The answer to the last write, which is newer than the read it replaced.
  const [wrote, setWrote] = useState<AdminPickList | null>(null)
  const [kept, setKept] = useState<AdminPickList | null>(null)
  if (list.data && list.data !== kept) {
    setKept(list.data)
    setWrote(null)
  }
  const data = wrote ?? list.data ?? kept
  const picks = data?.picks ?? []
  const loading = data === null && list.state === 'loading'

  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async (write: () => Promise<AdminPickList>, ok: (l: AdminPickList) => string) => {
    setBusy(true)
    setSaid(null)
    try {
      const l = await write()
      setWrote(l)
      setSaid({ ok: true, text: ok(l) })
      return true
    } catch (err) {
      setSaid({ ok: false, text: refusal(err) })
      // A 409 means the list moved under us: read it as it stands.
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) list.reload()
      return false
    } finally {
      setBusy(false)
    }
  }

  const pin = async () => {
    const raw = typed.trim()
    if (!raw) return setSaid({ ok: false, text: T.refusals.empty })
    const id = (UUID.exec(raw)?.[0] ?? raw).toLowerCase()
    const done = await run(
      () => api.pinPick(id),
      (l) => fill(T.said.pinned, { n: l.picks.length }),
    )
    if (done) setTyped('')
  }

  const move = (from: number, to: number) => {
    const ids = picks.map((p) => p.pick_id)
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    void run(() => api.reorderPicks(ids), () => fill(T.said.moved, { n: to + 1 }))
  }

  const unpin = (p: AdminPick) => void run(() => api.unpinPick(p.pick_id), () => T.said.unpinned)

  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[{ label: common.admin.crumb, to: '/admin/seasons' }, { label: T.header.crumb }]}
        title={T.header.title}
        badges={<Badge tone="info">{common.admin.badge}</Badge>}
      >
        <AdminTabs current="picks" />
      </PageHeader>

      <div className="wrap page-body">
        <div className="desk adb-one">
          <Panel className="desk-strip">
            <form
              className="strip-row"
              onSubmit={(e) => {
                e.preventDefault()
                void pin()
              }}
            >
              <input
                className="input mono desk-search"
                type="text"
                aria-label={T.pin.label}
                placeholder={T.pin.placeholder}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
              <button className="btn primary sm" type="submit" disabled={busy || !typed.trim()}>
                <IconLabel icon="i-pin">{busy ? T.pin.working : T.pin.button}</IconLabel>
              </button>
              <span className="hint">{T.pin.hint}</span>
            </form>
            {said ? (
              <div className="strip-sheet">
                <Notice tone={said.ok ? 'ok' : 'bad'} title={said.text} />
              </div>
            ) : null}
          </Panel>

          <Panel className="fill">
            <PanelHead icon="i-pin" title={T.list.title} end={data ? <span className="num">{count(T.list.count, picks.length)}</span> : null} />
            <div className="fill-scroll">
              <div className="adb-picks-scroll">
                {list.error && !data ? (
                  <InlineError error={list.error} what={T.list.what} />
                ) : loading ? (
                  <ol className="adb-picks" aria-busy="true">
                    {Array.from({ length: 3 }, (_, i) => (
                      <li className="adb-pick" key={i}>
                        <span className="adb-pick-n num">{fill(T.row.position, { n: i + 1 })}</span>
                        <div className="mcard row" aria-hidden="true">
                          <div className="tile-box skel" />
                          <div className="skel mcard-skel-line" />
                        </div>
                        <span />
                      </li>
                    ))}
                  </ol>
                ) : picks.length === 0 ? (
                  <EmptyState>{T.list.empty}</EmptyState>
                ) : (
                  <ol className="adb-picks">
                    {picks.map((p, i) => (
                      <li className="adb-pick" key={p.pick_id}>
                        <span className="adb-pick-n num">{fill(T.row.position, { n: i + 1 })}</span>
                        <div className="adb-pick-card">
                          <MatchCard m={p} layout="row" chip={null} />
                          <span className="hint" title={dateTime(p.pinned_at)}>
                            {fill(T.row.pinned, { handle: p.pinned_by, when: ago(p.pinned_at) })}
                          </span>
                        </div>
                        <span className="adb-pick-acts">
                          <button
                            className="icon-btn"
                            type="button"
                            aria-label={fill(T.row.upLabel, { n: i + 1 })}
                            title={T.row.up}
                            disabled={busy || i === 0}
                            onClick={() => move(i, i - 1)}
                          >
                            <Icon id="i-up" />
                          </button>
                          <button
                            className="icon-btn"
                            type="button"
                            aria-label={fill(T.row.downLabel, { n: i + 1 })}
                            title={T.row.down}
                            disabled={busy || i === picks.length - 1}
                            onClick={() => move(i, i + 1)}
                          >
                            <Icon id="i-down" />
                          </button>
                          <button className="btn sm" type="button" disabled={busy} onClick={() => unpin(p)}>
                            {T.row.unpin}
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
            <PanelFoot>
              <span className="hint">
                <Icon id="i-play" /> {T.list.foot}
              </span>
            </PanelFoot>
          </Panel>
        </div>
      </div>
    </Shell>
  )
}

function refusal(err: unknown): string {
  if (err instanceof ApiError) {
    const said = lookup(T.refusals.said, err.code)
    if (said !== undefined) return said
    if (err.status === 0) return T.refusals.unreachable
  }
  return T.refusals.fallback
}
