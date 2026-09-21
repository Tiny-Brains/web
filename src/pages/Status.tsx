// `/status` — is the arena running matches, and is the API answering.
//
// THE TWO ARE REPORTED APART, not as one green light: the arena can be playing
// perfectly while the site cannot read it.
//
// GET /v1/status is the ARENA HALF ONLY, deliberately: a route cannot honestly
// measure itself, because when the API is down the numbers saying so are exactly
// the numbers that do not arrive. The API half is measured HERE, from where the
// reader stands — this page times its own calls.
//
// NO STATE IS NAMED BY THE SERVER. Running, behind and down are a reading of the
// numbers, and the thresholds are this page's policy.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, type Status } from '../api'
import { ago, ms, num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Badge, Notice, PageHeader, Panel, PanelBody, PanelHead, Rich, Section, StatGrid, type BadgeTone } from '../components/ui'
import { fill } from '../lib/copy'
import T from '../../copy/status.json'

const S = T.states

const EVERY_MS = 30_000

/** How long an arena may go without finishing a match before "behind" is the
 *  honest word. Deliberately generous: a quiet ladder is not a broken one. */
const STALE_MS = 15 * 60_000

type Probe = {
  status: Status | null
  error: ApiError | null
  /** What the browser measured, which is the only latency a reader cares about. */
  latencyMs: number | null
  at: number
}

export default function StatusPage() {
  const [probe, setProbe] = useState<Probe | null>(null)
  const [checking, setChecking] = useState(true)

  const check = useCallback(async () => {
    setChecking(true)
    const started = performance.now()
    try {
      const status = await api.status()
      setProbe({ status, error: null, latencyMs: Math.round(performance.now() - started), at: Date.now() })
    } catch (err) {
      setProbe({
        status: null,
        error: err instanceof ApiError ? err : new ApiError(0, 'unknown', String(err)),
        latencyMs: null,
        at: Date.now(),
      })
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void check()
    const timer = window.setInterval(() => void check(), EVERY_MS)
    return () => window.clearInterval(timer)
  }, [check])

  const reading = read(probe)
  const arena = probe?.status?.arena ?? null
  const checked = probe ? fill(T.checked, { ago: ago(new Date(probe.at).toISOString()) }) : T.checking

  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[{ label: T.crumb }]}
        title={reading.headline}
        sub={reading.said}
        actions={
          <button className="btn sm" type="button" onClick={() => void check()} disabled={checking}>
            {checking ? T.check.busy : T.check.again}
          </button>
        }
      />
      <div className="wrap page-body stack">
        <div className="two">
          <Panel>
            <PanelHead
              title={
                <>
                  <h3>{T.arena.title}</h3>
                  <Badge tone={reading.arena.tone}>{reading.arena.word}</Badge>
                </>
              }
              end={checked}
            />
            <PanelBody>
              <p className="svc-say">{reading.arena.say}</p>
              <StatGrid
                items={[
                  { label: T.arena.stats.matchesLastHour, icon: 'i-matches', value: arena ? num(arena.matches_last_hour) : '—' },
                  { label: T.arena.stats.queue, value: arena ? <>{num(arena.queue)} <small>{T.arena.stats.waiting}</small></> : '—' },
                  { label: T.arena.stats.medianMatch, value: arena ? ms(arena.median_played_ms) : '—' },
                  { label: T.arena.stats.inFlight, value: arena ? num(arena.in_flight) : '—' },
                  { label: T.arena.stats.awaitingRating, value: arena ? num(arena.awaiting_rating) : '—' },
                  { label: T.arena.stats.lastPlayed, value: arena ? <small>{ago(arena.last_played_at)}</small> : '—' },
                ]}
              />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHead
              title={
                <>
                  <h3>{T.api.title}</h3>
                  <Badge tone={reading.api.tone}>{reading.api.word}</Badge>
                </>
              }
              end={checking ? T.checking : probe ? checked : ''}
            />
            <PanelBody>
              <p className="svc-say">{reading.api.say}</p>
              <StatGrid
                items={[
                  { label: T.api.stats.thisRequest, value: probe?.latencyMs != null ? ms(probe.latencyMs) : '—' },
                  { label: T.api.stats.answered, value: probe ? (probe.error ? T.api.stats.no : T.api.stats.yes) : '—' },
                  { label: T.api.stats.rechecks, value: <small>{fill(T.api.stats.every, { n: EVERY_MS / 1000 })}</small> },
                ]}
              />
              <p className="hint" style={{ marginTop: 12 }}>
                {T.api.measured}
              </p>
            </PanelBody>
          </Panel>
        </div>
        {reading.note}
        <Section title={T.meaning.title}>
          <div className="two">
            <p className="muted">
              <Rich text={T.meaning.arena} />
            </p>
            <p className="muted">
              <Rich text={T.meaning.api} />
            </p>
          </div>
        </Section>
      </div>
    </Shell>
  )
}

type Line = { tone: BadgeTone; word: string; say: string }
type Reading = { headline: ReactNode; said: string; arena: Line; api: Line; note: ReactNode | null }

const WAITING: Line = { tone: 'off', word: S.checking.line.word, say: S.checking.line.say }

function InFlight({ admitting, trialling }: { admitting: number; trialling: number }) {
  return (
    <Notice tone="info" title={T.notes.inFlight.title}>
      <p>{fill(T.notes.inFlight.body, { admitting: num(admitting), trialling: num(trialling) })}</p>
    </Notice>
  )
}

function LateNote({ counting }: { counting?: boolean }) {
  return (
    <Notice tone="warn" title={T.notes.late.title}>
      <p>
        {counting ? (
          <Rich text={T.notes.late.bodyCounting} vars={{ counting: <em>{T.notes.late.counting}</em> }} />
        ) : (
          T.notes.late.body
        )}
      </p>
    </Notice>
  )
}

/** A headline: its sentence, with the word that says the state drawn in the state's colour. */
function Headline({ text, word, className }: { text: string; word: string; className: string }) {
  return <Rich text={text} vars={{ word: <span className={className}>{word}</span> }} />
}

function read(probe: Probe | null): Reading {
  if (!probe) {
    return {
      headline: S.checking.headline,
      said: S.checking.said,
      arena: WAITING,
      api: WAITING,
      note: null,
    }
  }

  // The API did not answer. The only case where the arena line is honestly
  // unknown, because the arena reports through the API.
  if (probe.error || !probe.status) {
    return {
      headline: <Headline text={S.down.headline} word={S.down.headlineWord} className="headline-bad" />,
      said: S.down.said,
      arena: {
        tone: 'off',
        word: S.down.arena.word,
        say: S.down.arena.say,
      },
      api: {
        tone: 'bad',
        word: S.down.api.word,
        say: probe.error?.status
          ? fill(S.down.api.sayStatus, { status: probe.error.status, code: probe.error.code })
          : S.down.api.say,
      },
      note: (
        <Notice tone="bad" title={T.notes.safe.title}>
          <p>{T.notes.safe.body}</p>
        </Notice>
      ),
    }
  }

  const a = probe.status.arena
  const idleFor = a.last_played_at ? Date.now() - new Date(a.last_played_at).getTime() : Infinity
  // A queue that dwarfs what the last hour actually played is behind. A `finished`
  // pile that is not shrinking is the count clock falling behind rather than the
  // arena, and it is worth telling apart.
  const backedUp = a.queue > Math.max(50, a.matches_last_hour * 3)
  const countBehind = a.awaiting_rating > Math.max(25, a.matches_last_hour)
  const stalled = idleFor > STALE_MS && a.queue > 0

  const apiLine: Line = {
    tone: 'ok',
    word: S.answering.word,
    say:
      probe.latencyMs !== null && probe.latencyMs > 1500
        ? fill(S.answering.saySlow, { ms: ms(probe.latencyMs) })
        : S.answering.say,
  }

  if (stalled) {
    return {
      headline: <Headline text={S.stopped.headline} word={S.stopped.headlineWord} className="headline-bad" />,
      said: fill(S.stopped.said, { ago: ago(a.last_played_at), queue: num(a.queue) }),
      arena: {
        tone: 'bad',
        word: S.stopped.arena.word,
        say: S.stopped.arena.say,
      },
      api: apiLine,
      note: <LateNote />,
    }
  }

  if (backedUp || countBehind) {
    return {
      headline: <Headline text={S.behind.headline} word={S.behind.headlineWord} className="headline-warn" />,
      said: countBehind ? S.behind.saidCounting : S.behind.said,
      arena: {
        tone: 'wait',
        word: S.behind.arena.word,
        say: countBehind ? fill(S.behind.arena.sayCounting, { n: num(a.awaiting_rating) }) : S.behind.arena.say,
      },
      api: apiLine,
      note: <LateNote counting />,
    }
  }

  return {
    headline: <Headline text={S.running.headline} word={S.running.headlineWord} className="headline-ok" />,
    said: fill(S.running.said, { n: num(a.matches_last_hour) }),
    arena: { tone: 'ok', word: S.running.arena.word, say: S.running.arena.say },
    api: apiLine,
    note:
      a.admission_queue > 0 || a.awaiting_trial > 0 ? (
        <InFlight admitting={a.admission_queue} trialling={a.awaiting_trial} />
      ) : null,
  }
}
