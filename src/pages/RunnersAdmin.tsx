// `/admin/runners` — admin session only, linked from the account menu's Admin group and the
// admin tabs.
//
// WHAT THIS PAGE IS FOR, in one sentence: it is the answer to "which machine is
// wedged", which is the whole reason `matches.played_by` exists. Everything else
// here — minting, revoking, the arch column — is in service of being able to look
// at a list and say *that* one.
//
// A RUNNER IS NOT ENROLLED, IT SELF-REGISTERS. The gate upserts a row on
// (key_id, label) the first time a machine exchanges its key, so this page never
// creates a runner. It creates KEYS. Two machines sharing one key are two rows
// told apart by their label alone, which is why the label is the first column and
// why the empty state says to set it.
//
// THE KEY IS SHOWN ONCE AND THAT IS NOT A UI CHOICE. `runner_keys` stores a
// sha256 and an eight-character display prefix; there is nothing to show again.
// So the minted key gets its own card, above the fold, that does not go away on a
// re-render and says plainly that closing it loses the key. Minting another is
// free.
//
// TWO REVOKES, AND THEY ARE NOT THE SAME. Revoking a KEY stops every machine on
// it; revoking a RUNNER stops one and leaves the others. Both take effect within
// one token lifetime (ten minutes), because every /v1/runner/* call carries a
// short-lived token rather than the key. Neither cancels an in-flight match: the
// row's lease lapses and the reap clock frees it for somebody else, which is the
// same path a crashed machine takes.

import { useState } from 'react'
import { api, type MintedRunnerKey, type Runner, type RunnerKey } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform } from '../providers/platform-context'
import { useSession } from '../providers/session-context'
import { ago, dateTime, num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Panel, PanelBody, PanelFoot, PanelHead, type Column, DataTable, Field, Loading, Notice, PageHeader, Badge, Rich } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { InlineError, AdminGate } from '../components/ErrorStates'
import { count, fill } from '../lib/copy'
import T from '../../copy/admin-runners.json'
import common from '../../copy/common.json'

/** A machine that has not called in for this long, while holding matches, is the thing
 *  this page exists to make visible. Five minutes is the lease, so anything past it has
 *  already lost its claim or is about to. */
const STALE_MS = 5 * 60 * 1000

function staleness(r: Runner): number {
  return Date.now() - new Date(r.last_seen_at).getTime()
}

/** Silent for longer than a lease. NOT a verdict on its own: a runner with nothing in flight
 *  polls, finds nothing, and its last_seen still moves — so quiet here means it has stopped
 *  calling at all, which is a machine that is off, wedged, or cannot reach the gate. */
function isQuiet(r: Runner): boolean {
  return staleness(r) > STALE_MS
}

/** The one judgement this page makes, and it is deliberately narrow: holding matches AND
 *  silent past the lease. A quiet runner with nothing in flight is a machine that is simply
 *  off, which costs the ladder nothing. */
function isWedged(r: Runner): boolean {
  return r.live && r.in_flight > 0 && isQuiet(r)
}

export default function RunnersAdmin() {
  const { me, session } = useSession()
  const { slug } = usePlatform()
  const runners = useApi('admin-runners', () => api.runners())
  const keys = useApi('admin-runner-keys', () => api.runnerKeys())
  const [minted, setMinted] = useState<MintedRunnerKey | null>(null)

  if (session.state === 'loading') {
    return (
      <Shell title={T.tab}>
        <section className="wrap page-body">
          <Loading rows={3} label={common.site.checkingSession} />
        </section>
      </Shell>
    )
  }

  // Gated here as a courtesy, not as the control: Soma answers 403 to a non-admin whatever
  // this page renders, and every runner statement joins through to `users.role = 'admin'`,
  // so a demotion stops the machines too.
  if (!me || me.role !== 'admin') {
    return (
      <Shell title={T.tab}>
        <AdminGate signedIn={Boolean(me)} />
      </Shell>
    )
  }

  const fleet = runners.data ?? []
  const wedged = fleet.filter(isWedged)
  // TWO DIFFERENT QUESTIONS, and conflating them is what made the first version of this page
  // call a machine last seen two hours ago "live". `live` is AUTHORISED — the row, its key and
  // the key's owner are all in good standing. Calling in is whether it is actually there.
  const authorised = fleet.filter((r) => r.live)
  const calling = authorised.filter((r) => !isQuiet(r))
  // Read off the machines that are actually playing: a probe row from last week disagreeing
  // about the engine is not news, and warning about it would train the reader to ignore this.
  const digests = new Set(calling.map((r) => r.engine_digest).filter(Boolean))
  const versions = new Set(calling.map((r) => r.orion_version).filter(Boolean))
  const wedgedInFlight = wedged.reduce((n, r) => n + r.in_flight, 0)

  const reloadBoth = () => {
    runners.reload()
    keys.reload()
  }

  return (
    <Shell title={T.tab} scoped>
      <div>
        <PageHeader
          crumbs={[{ label: common.admin.crumb, to: '/admin/seasons' }, { label: T.header.crumb }]}
          title={T.header.title}
          badges={<Badge tone="info">{common.admin.badge}</Badge>}
          sub={T.header.sub}
        >
          <AdminTabs current="runners" />
        </PageHeader>

        <section className="wrap page-body">
          <div className="stack">
            {minted ? <MintedCard minted={minted} onDismiss={() => setMinted(null)} /> : null}

            {wedged.length > 0 ? (
              <Notice tone="bad" title={count(T.wedged.title, wedged.length)}>
                <p>
                  {count(T.wedged.body, wedgedInFlight, { n: num(wedgedInFlight), runners: wedged.map((r) => r.label).join(', ') })}
                </p>
              </Notice>
            ) : null}

            {/* TWO DISAGREEMENTS THAT ARE SILENT EVERYWHERE ELSE. A runner whose engine digest
                differs from the rest claims nothing, for ever, and looks perfectly healthy doing
                it — there is no error anywhere, so this list is where it can be seen. The Orion
                version is the same shape of problem one layer up: a match recorded against one
                Orion and admitted against another is exactly what a re-validation sweep looks
                for. */}
            {digests.size > 1 ? (
              <Notice tone="warn" title={T.digests.title}>
                <p>
                  <Rich text={T.digests.body} vars={{ digests: digests.size, calling: calling.length }} />
                </p>
              </Notice>
            ) : null}
            {versions.size > 1 ? (
              <Notice tone="warn" title={T.versions.title}>
                <p>
                  {fill(T.versions.body, { versions: [...versions].join(', ') })}
                </p>
              </Notice>
            ) : null}

            <Panel>
              <PanelHead
                title={T.fleet.title}
                end={fill(T.fleet.end, {
                  calling: calling.length,
                  quiet: authorised.length - calling.length,
                  inFlight: num(fleet.reduce((n, r) => n + r.in_flight, 0)),
                })}
              />
              {runners.state === 'error' ? (
                <InlineError error={runners.error} what={T.fleet.what} />
              ) : (
                <DataTable
                  state={runners.state === 'loading' && fleet.length === 0 ? 'loading' : 'ready'}
                  columns={runnerColumns(reloadBoth)}
                  rows={fleet}
                  rowKey={(r) => r.id}
                  rowClass={(r) => (isWedged(r) ? 'bad' : r.live && !isQuiet(r) ? undefined : 'muted')}
                  empty={T.fleet.empty}
                />
              )}
              <PanelFoot>
                <span className="muted">
                  <Rich text={T.fleet.foot} />
                </span>
              </PanelFoot>
            </Panel>

            <MintCard onMinted={(k) => { setMinted(k); reloadBoth() }} />

            <Panel>
              <PanelHead title={T.keys.title} end={fill(T.keys.end, { n: (keys.data ?? []).filter((k) => !k.revoked_at).length })} />
              {keys.state === 'error' ? (
                <InlineError error={keys.error} what={T.keys.what} />
              ) : (
                <DataTable
                  state={keys.state === 'loading' && (keys.data ?? []).length === 0 ? 'loading' : 'ready'}
                  columns={keyColumns(reloadBoth)}
                  rows={keys.data ?? []}
                  rowKey={(k) => k.id}
                  rowClass={(k) => (k.revoked_at ? 'muted' : undefined)}
                  empty={T.keys.empty}
                />
              )}
              <PanelFoot>
                <span className="muted">
                  {fill(T.keys.foot, { handle: me.handle })}
                </span>
              </PanelFoot>
            </Panel>

            <Notice tone="info" title={T.start.title}>
              <p>
                <Rich
                  text={T.start.body}
                  vars={{
                    readme: (
                      <a href={T.start.readmeHref} rel="noopener">
                        <Rich text={T.start.readme} vars={{ section: <em>{T.start.readmeSection}</em> }} />
                      </a>
                    ),
                    game: <code>{slug}</code>,
                  }}
                />
              </p>
            </Notice>
          </div>
        </section>
      </div>
    </Shell>
  )
}

// ---------------------------------------------------------------- the minted key

/** ITS OWN CARD, not a toast. There is exactly one moment this value exists outside the
 *  operator's clipboard, and a notification that fades is the wrong shape for it. */
function MintedCard({ minted, onDismiss }: { minted: MintedRunnerKey; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <Panel className="now">
      <PanelHead title={T.minted.title} end={minted.label ?? T.minted.noLabel} />
      <PanelBody className="stack">
        <Notice tone="warn" title={T.minted.warning}>
          <p>{minted.note}</p>
        </Notice>
        <div className="form-grid">
          <code className="mono" style={{ wordBreak: 'break-all' }}>{minted.key}</code>
          <button
            className="btn"
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(minted.key).then(
                () => setCopied(true),
                // A clipboard that refuses is not an error worth a dialog: the value is on
                // screen and selectable, which is the fallback.
                () => setCopied(false),
              )
            }}
          >
            {copied ? common.ui.copied : common.ui.copy}
          </button>
        </div>
      </PanelBody>
      <PanelFoot>
        <button className="btn" type="button" onClick={onDismiss}>
          {T.minted.done}
        </button>
      </PanelFoot>
    </Panel>
  )
}

// ---------------------------------------------------------------- minting

function MintCard({ onMinted }: { onMinted: (k: MintedRunnerKey) => void }) {
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mint = async () => {
    setBusy(true)
    setError(null)
    try {
      onMinted(await api.createRunnerKey(label.trim() ? { label: label.trim() } : {}))
      setLabel('')
    } catch (err) {
      setError(err instanceof Error ? err.message : T.mint.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <PanelHead title={T.mint.title} end={T.mint.end} />
      <PanelBody>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void mint()
          }}
        >
          <Field
            label={T.mint.label}
            htmlFor="k-label"
            hint={T.mint.hint}
          >
            <input
              className="input"
              id="k-label"
              maxLength={64}
              placeholder={T.mint.placeholder}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          {error ? <Notice tone="bad" title={T.mint.notMinted}>{error}</Notice> : null}
          <div className="acts">
            <button className="btn primary" disabled={busy} type="submit">
              {busy ? T.mint.minting : T.mint.submit}
            </button>
          </div>
        </form>
      </PanelBody>
    </Panel>
  )
}

// ---------------------------------------------------------------- columns

function runnerColumns(reload: () => void): Column<Runner>[] {
  return [
    {
      key: 'label',
      head: T.fleet.head.machine,
      cell: (r) => (
        <>
          <b>{r.label}</b>
          <div className="hint mono">
            {r.key_label ? `${r.key_label} · ` : ''}
            {r.key_prefix}{' · '}@{r.owner}
          </div>
        </>
      ),
    },
    // DERIVED FROM `uname` ON THE MACHINE, never typed by anyone — which is what makes this
    // column worth a glance. A hand-written arch would say whatever the operator believed.
    { key: 'arch', head: T.fleet.head.arch, cell: (r) => <span className="mono">{r.arch ?? '—'}</span> },
    {
      key: 'engine',
      head: T.fleet.head.engine,
      cell: (r) => (
        <span className="mono" title={r.engine_digest ?? undefined}>
          {r.engine_digest ? r.engine_digest.slice(0, 19) : '—'}
        </span>
      ),
    },
    {
      key: 'orion',
      head: T.fleet.head.orion,
      cell: (r) => <span className="mono">{r.orion_version ?? '—'}</span>,
    },
    {
      key: 'flight',
      head: T.fleet.head.inFlight,
      align: 'right',
      className: 'r-num',
      cell: (r) => `${num(r.in_flight)} / ${num(r.max_in_flight)}`,
    },
    { key: 'played', head: T.fleet.head.played, align: 'right', className: 'r-num', cell: (r) => num(r.played) },
    {
      key: 'seen',
      head: T.fleet.head.lastSeen,
      align: 'right',
      cell: (r) => <span title={dateTime(r.last_seen_at)}>{ago(r.last_seen_at)}</span>,
    },
    {
      key: 'state',
      head: '',
      cell: (r) =>
        isWedged(r) ? (
          <Badge tone="bad">{T.fleet.state.wedged}</Badge>
        ) : r.revoked_at ? (
          <Badge tone="off">{T.fleet.state.revoked}</Badge>
        ) : !r.live ? (
          // The row is fine; the KEY or its OWNER is not. Said separately because the repair
          // is different: re-grant the owner, or mint a new key.
          <Badge tone="off">{T.fleet.state.keyOrOwner}</Badge>
        ) : isQuiet(r) ? (
          // Authorised, and not there. Distinguished from `live` because a machine that stopped
          // calling an hour ago reading as LIVE is what makes a fleet list worth nothing.
          <Badge tone="wait">{T.fleet.state.quiet}</Badge>
        ) : (
          <Badge tone="ok">{T.fleet.state.live}</Badge>
        ),
    },
    {
      key: 'act',
      head: '',
      cell: (r) =>
        r.revoked_at ? null : (
          <RevokeButton
            what={fill(T.fleet.revoke, { label: r.label })}
            confirm={r.label}
            hint={T.fleet.revokeHint}
            run={() => api.revokeRunner(r.id)}
            onDone={reload}
          />
        ),
    },
  ]
}

function keyColumns(reload: () => void): Column<RunnerKey>[] {
  return [
    {
      key: 'key',
      head: T.keys.head.key,
      cell: (k) => (
        <>
          <b>{k.label ?? T.keys.noLabel}</b>
          <div className="hint mono">{k.key_prefix}…</div>
        </>
      ),
    },
    {
      key: 'runners',
      head: T.keys.head.machines,
      align: 'right',
      className: 'r-num',
      cell: (k) => num(k.runners),
    },
    {
      key: 'used',
      head: T.keys.head.lastUsed,
      align: 'right',
      cell: (k) =>
        k.last_used_at ? (
          <span title={dateTime(k.last_used_at)}>{ago(k.last_used_at)}</span>
        ) : (
          // A key that has never been used is the normal state of one minted a minute ago, and
          // also the state of one that was pasted wrong. Said plainly rather than as a dash.
          <span className="muted">{T.keys.never}</span>
        ),
    },
    {
      key: 'state',
      head: '',
      cell: (k) => (k.revoked_at ? <Badge tone="off">{T.keys.state.revoked}</Badge> : <Badge tone="ok">{T.keys.state.active}</Badge>),
    },
    {
      key: 'act',
      head: '',
      cell: (k) =>
        k.revoked_at ? null : (
          <RevokeButton
            what={fill(T.keys.revoke, { prefix: k.key_prefix })}
            confirm={k.key_prefix}
            hint={k.runners > 0 ? count(T.keys.revokeHint, k.runners) : T.keys.revokeHintUnused}
            run={() => api.revokeRunnerKey(k.id)}
            onDone={reload}
          />
        ),
    },
  ]
}

// ---------------------------------------------------------------- revoking

/** TYPE IT, DO NOT CLICK IT. Revoking a key stops every machine on it, and the two things
 *  this page revokes look alike in a table — the same shape of mistake the seasons page makes
 *  you type a number to avoid. There is no undo: a revoked key cannot be un-revoked, only
 *  replaced. */
function RevokeButton({
  what,
  confirm,
  hint,
  run,
  onDone,
}: {
  what: string
  confirm: string
  hint: string
  run: () => Promise<unknown>
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button className="btn sm" type="button" onClick={() => setOpen(true)}>
        {T.revoke.button}
      </button>
    )
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (typed !== confirm) return
        setBusy(true)
        setError(null)
        run().then(
          () => {
            setOpen(false)
            setTyped('')
            onDone()
          },
          (err: unknown) => setError(err instanceof Error ? err.message : T.revoke.failed),
        ).finally(() => setBusy(false))
      }}
    >
      <span className="muted">
        <Rich text={T.revoke.ask} vars={{ what, hint, word: <code>{confirm}</code> }} />
      </span>
      <input
        aria-label={fill(T.revoke.input, { word: confirm })}
        className="input mono"
        onChange={(e) => setTyped(e.target.value)}
        value={typed}
      />
      {error ? <span className="muted">{error}</span> : null}
      <div className="acts">
        <button className="btn danger sm" disabled={busy || typed !== confirm} type="submit">
          {busy ? T.revoke.revoking : T.revoke.button}
        </button>
        <button className="btn sm" type="button" onClick={() => { setOpen(false); setTyped('') }}>
          {T.revoke.cancel}
        </button>
      </div>
    </form>
  )
}
