// `/admin/runners` — admin session only, and unlinked by design: nothing on the
// site points here, so the page has to introduce itself.
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
import { Link } from 'react-router-dom'
import { api, type MintedRunnerKey, type Runner, type RunnerKey } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform } from '../providers/platform-context'
import { useSession } from '../providers/session-context'
import { ago, dateTime, num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardBody, CardFoot, CardHead, type Column, DataTable, Field, Loading, Note, PageHead, Pill } from '../components/ui'
import { InlineError } from '../components/ErrorStates'

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
      <Shell title="Runners · admin">
        <section className="wrap sec tight">
          <Loading rows={3} label="Checking your session" />
        </section>
      </Shell>
    )
  }

  // Gated here as a courtesy, not as the control: Soma answers 403 to a non-admin whatever
  // this page renders, and every runner statement joins through to `users.role = 'admin'`,
  // so a demotion stops the machines too.
  if (!me || me.role !== 'admin') {
    return (
      <Shell title="Runners · admin">
        <section className="mid">
          <div className="code">403 · admin only</div>
          <h1>This page is for administrators.</h1>
          <p>
            {me
              ? 'You are signed in, but this account does not administer runners. Nothing on the site links here; if you arrived by a saved link, that is all that happened.'
              : 'You are not signed in. Even signed in, this page only opens for an account that administers runners.'}
          </p>
          <div className="acts">
            <Link className="btn primary lg" to="/">
              Home
            </Link>
          </div>
        </section>
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

  const reloadBoth = () => {
    runners.reload()
    keys.reload()
  }

  return (
    <Shell
      ctx="select"
      ctxEnd={<span className="ctx-item">admin only · <b>unlinked</b></span>}
      title="Runners · admin"
    >
      <div className="admin-page">
        <PageHead
          title={<h1>Runners</h1>}
          badges={<Pill tone="scheduled">Admin</Pill>}
          end={<span className="muted note-mono">signed in as @{me.handle} · admin</span>}
          sub="Every machine playing this ladder, in the deployment or on somebody's desk. A machine is not enrolled here — it registers itself the first time it uses a key, so what this page hands out is keys."
        />

        <section className="wrap sec tight">
          <div className="stack">
            {minted ? <MintedCard minted={minted} onDismiss={() => setMinted(null)} /> : null}

            {wedged.length > 0 ? (
              <Note tone="bad" title={`${wedged.length} runner${wedged.length === 1 ? '' : 's'} holding work and not calling in.`}>
                <p>
                  {wedged.map((r) => r.label).join(', ')} — last seen more than five minutes ago
                  with {num(wedged.reduce((n, r) => n + r.in_flight, 0))} match
                  {wedged.reduce((n, r) => n + r.in_flight, 0) === 1 ? '' : 'es'} claimed. The lease
                  is five minutes, so those rows have already lapsed or are about to: the reap clock
                  frees them for another machine on its own. Revoking the runner stops it taking
                  more; it does not cancel what it holds.
                </p>
              </Note>
            ) : null}

            {/* TWO DISAGREEMENTS THAT ARE SILENT EVERYWHERE ELSE. A runner whose engine digest
                differs from the rest claims nothing, for ever, and looks perfectly healthy doing
                it — there is no error anywhere, so this list is where it can be seen. The Orion
                version is the same shape of problem one layer up: a match recorded against one
                Orion and admitted against another is exactly what a re-validation sweep looks
                for. */}
            {digests.size > 1 ? (
              <Note tone="warn" title="Live runners disagree about the engine.">
                <p>
                  {digests.size} distinct engine digests across {calling.length} runners that are
                  calling in. A runner
                  whose digest does not match the season&rsquo;s claims nothing and reports no
                  error. Check <code>ANTS_REF</code> on each machine — pin it, rather than tracking
                  a tag that moves.
                </p>
              </Note>
            ) : null}
            {versions.size > 1 ? (
              <Note tone="warn" title="Live runners disagree about the Orion version.">
                <p>
                  {[...versions].join(', ')}. Every match records the version that ran its adapters,
                  and admission judged the model under one of them.
                </p>
              </Note>
            ) : null}

            <Card>
              <CardHead
                title="The fleet"
                end={`${calling.length} calling in · ${authorised.length - calling.length} quiet · ${num(fleet.reduce((n, r) => n + r.in_flight, 0))} in flight`}
              />
              {runners.state === 'error' ? (
                <InlineError error={runners.error} what="The runners" />
              ) : (
                <DataTable
                  state={runners.state === 'loading' && fleet.length === 0 ? 'loading' : 'ready'}
                  columns={runnerColumns(reloadBoth)}
                  rows={fleet}
                  rowKey={(r) => r.id}
                  rowClass={(r) => (isWedged(r) ? 'bad' : r.live && !isQuiet(r) ? undefined : 'muted')}
                  empty="No machine has ever used a key on this deployment. Mint one below and start a runner with it."
                />
              )}
              <CardFoot>
                <span className="muted">
                  A runner stays listed after it is revoked or its owner is demoted, because{' '}
                  <code>played_by</code> on every match it played still points here.
                </span>
              </CardFoot>
            </Card>

            <MintCard onMinted={(k) => { setMinted(k); reloadBoth() }} />

            <Card>
              <CardHead title="Your keys" end={`${(keys.data ?? []).filter((k) => !k.revoked_at).length} active`} />
              {keys.state === 'error' ? (
                <InlineError error={keys.error} what="The keys" />
              ) : (
                <DataTable
                  state={keys.state === 'loading' && (keys.data ?? []).length === 0 ? 'loading' : 'ready'}
                  columns={keyColumns(reloadBoth)}
                  rows={keys.data ?? []}
                  rowKey={(k) => k.id}
                  rowClass={(k) => (k.revoked_at ? 'muted' : undefined)}
                  empty="You hold no runner keys."
                />
              )}
              <CardFoot>
                <span className="muted">
                  Keys you minted, under @{me.handle}. Revoking one stops every machine on it within
                  ten minutes — that is the token lifetime, not a schedule.
                </span>
              </CardFoot>
            </Card>

            <Note tone="info" title="Starting a machine with one of these.">
              <p>
                On the runner: <code>docker compose -f docker-compose.runner.yml up -d</code>, with{' '}
                <code>RUNNER_KEY</code> set to the key and <code>RUNNER_LABEL</code> to the
                machine&rsquo;s name. It needs no database, no bucket secret and no admin token —
                that is the point of the key. The full page is{' '}
                <code>devops/docs/deployment.md</code> §11; the game is <code>{slug}</code>.
              </p>
            </Note>
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
    <Card className="now">
      <CardHead title="Your new runner key" end={minted.label ?? 'no label'} />
      <CardBody className="stack">
        <Note tone="warn" title="Copy it now. This is the only time it is shown.">
          <p>{minted.note}</p>
        </Note>
        <div className="row2">
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
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </CardBody>
      <CardFoot>
        <button className="btn" type="button" onClick={onDismiss}>
          I have copied it
        </button>
      </CardFoot>
    </Card>
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
      setError(err instanceof Error ? err.message : 'The key could not be minted.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHead title="Mint a key" end="shown once" />
      <CardBody>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void mint()
          }}
        >
          <Field
            label="Label"
            htmlFor="k-label"
            hint="What this key is for — a machine, a batch, a person. It is not the runner's name: a machine sets its own label, and several may share one key."
          >
            <input
              className="input"
              id="k-label"
              maxLength={64}
              placeholder="mac-mini"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          {error ? <Note tone="bad" title="The key was not minted.">{error}</Note> : null}
          <div className="acts">
            <button className="btn primary" disabled={busy} type="submit">
              {busy ? 'Minting…' : 'Mint a key'}
            </button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

// ---------------------------------------------------------------- columns

function runnerColumns(reload: () => void): Column<Runner>[] {
  return [
    {
      key: 'label',
      head: 'Machine',
      wide: true,
      cell: (r) => (
        <>
          <b>{r.label}</b>
          <div className="muted note-mono">
            {r.key_label ? `${r.key_label} · ` : ''}
            {r.key_prefix} · @{r.owner}
          </div>
        </>
      ),
    },
    // DERIVED FROM `uname` ON THE MACHINE, never typed by anyone — which is what makes this
    // column worth a glance. A hand-written arch would say whatever the operator believed.
    { key: 'arch', head: 'Arch', cell: (r) => <span className="mono">{r.arch ?? '—'}</span> },
    {
      key: 'engine',
      head: 'Engine',
      cell: (r) => (
        <span className="mono" title={r.engine_digest ?? undefined}>
          {r.engine_digest ? r.engine_digest.slice(0, 19) : '—'}
        </span>
      ),
    },
    {
      key: 'orion',
      head: 'Orion',
      cell: (r) => <span className="mono">{r.orion_version ?? '—'}</span>,
    },
    {
      key: 'flight',
      head: 'In flight',
      align: 'right',
      cellClass: 'r-num',
      cell: (r) => `${num(r.in_flight)} / ${num(r.max_in_flight)}`,
    },
    { key: 'played', head: 'Played', align: 'right', cellClass: 'r-num', cell: (r) => num(r.played) },
    {
      key: 'seen',
      head: 'Last seen',
      align: 'right',
      cell: (r) => <span title={dateTime(r.last_seen_at)}>{ago(r.last_seen_at)}</span>,
    },
    {
      key: 'state',
      head: '',
      cell: (r) =>
        isWedged(r) ? (
          <Pill tone="bad">wedged</Pill>
        ) : r.revoked_at ? (
          <Pill tone="closed">revoked</Pill>
        ) : !r.live ? (
          // The row is fine; the KEY or its OWNER is not. Said separately because the repair
          // is different: re-grant the owner, or mint a new key.
          <Pill tone="closed">key or owner</Pill>
        ) : isQuiet(r) ? (
          // Authorised, and not there. Distinguished from `live` because a machine that stopped
          // calling an hour ago reading as LIVE is what makes a fleet list worth nothing.
          <Pill tone="wait">quiet</Pill>
        ) : (
          <Pill tone="ok">live</Pill>
        ),
    },
    {
      key: 'act',
      head: '',
      cell: (r) =>
        r.revoked_at ? null : (
          <RevokeButton
            what={`runner ${r.label}`}
            confirm={r.label}
            hint="Stops this machine only. The key keeps working for the others on it."
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
      head: 'Key',
      wide: true,
      cell: (k) => (
        <>
          <b>{k.label ?? 'no label'}</b>
          <div className="muted note-mono">{k.key_prefix}…</div>
        </>
      ),
    },
    {
      key: 'runners',
      head: 'Machines',
      align: 'right',
      cellClass: 'r-num',
      cell: (k) => num(k.runners),
    },
    {
      key: 'used',
      head: 'Last used',
      align: 'right',
      cell: (k) =>
        k.last_used_at ? (
          <span title={dateTime(k.last_used_at)}>{ago(k.last_used_at)}</span>
        ) : (
          // A key that has never been used is the normal state of one minted a minute ago, and
          // also the state of one that was pasted wrong. Said plainly rather than as a dash.
          <span className="muted">never</span>
        ),
    },
    {
      key: 'state',
      head: '',
      cell: (k) => (k.revoked_at ? <Pill tone="closed">revoked</Pill> : <Pill tone="ok">active</Pill>),
    },
    {
      key: 'act',
      head: '',
      cell: (k) =>
        k.revoked_at ? null : (
          <RevokeButton
            what={`key ${k.key_prefix}`}
            confirm={k.key_prefix}
            hint={
              k.runners > 0
                ? `Stops all ${k.runners} machine${k.runners === 1 ? '' : 's'} using it, within ten minutes.`
                : 'No machine is using it.'
            }
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
        Revoke
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
          (err: unknown) => setError(err instanceof Error ? err.message : 'It was not revoked.'),
        ).finally(() => setBusy(false))
      }}
    >
      <span className="muted">
        Revoke {what}? {hint} Type <code>{confirm}</code> to confirm.
      </span>
      <input
        aria-label={`Type ${confirm} to revoke`}
        className="input mono"
        onChange={(e) => setTyped(e.target.value)}
        value={typed}
      />
      {error ? <span className="muted">{error}</span> : null}
      <div className="acts">
        <button className="btn bad sm" disabled={busy || typed !== confirm} type="submit">
          {busy ? 'Revoking…' : 'Revoke'}
        </button>
        <button className="btn sm" type="button" onClick={() => { setOpen(false); setTyped('') }}>
          Cancel
        </button>
      </div>
    </form>
  )
}
