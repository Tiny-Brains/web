// `/status` — is the arena running matches, and is the API answering.
//
// THE TWO ARE REPORTED APART, not as one green light: the arena can be playing
// perfectly while the site cannot read it, and one light would hide that.
//
// GET /v1/status is the ARENA HALF ONLY, and deliberately so -- a route cannot
// honestly measure itself, because when the API is down the numbers saying so are
// exactly the numbers that do not arrive. The API half is measured HERE, from
// where the reader actually stands: this page times its own calls and re-checks
// every 30 seconds.
//
// NO STATE IS NAMED BY THE SERVER. Running, behind and down are a reading of the
// numbers, and the thresholds are this page's policy -- which is the point, since
// policy in SQL cannot change without a package reload.

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, type Status } from '../api'
import { ago, ms, num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, Facts, Note, Pill, type PillTone } from '../components/ui'

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
  const timer = useRef<number | null>(null)

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

  // Polling an external system on a timer is what an effect is for; `check` sets
  // state only after its await resolves.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void check()
    timer.current = window.setInterval(() => void check(), EVERY_MS)
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current)
    }
  }, [check])

  const reading = read(probe)

  return (
    <Shell>
      <section className="wrap head-say">
        <div className="eyebrow">System status</div>
        <h1>{reading.headline}</h1>
        <p>{reading.said}</p>
      </section>

      <section className="wrap sec tight">
        <div className="two">
          <Card>
            <div className="svc-head">
              <h3>The arena</h3>
              <Pill tone={reading.arena.tone}>{reading.arena.word}</Pill>
              <span className="checked">{probe ? `checked ${ago(new Date(probe.at).toISOString())}` : 'checking…'}</span>
            </div>
            <p className="svc-say">{reading.arena.say}</p>
            <div className="svc-facts">
              <Facts
                cols={3}
                items={[
                  { label: 'Matches last hour', value: probe?.status ? num(probe.status.arena.matches_last_hour) : '—' },
                  { label: 'Queue', value: probe?.status ? `${num(probe.status.arena.queue)} waiting` : '—' },
                  { label: 'Median match', value: probe?.status ? ms(probe.status.arena.median_played_ms) : '—' },
                ]}
              />
            </div>
            <div className="svc-facts" style={{ paddingTop: 0 }}>
              <Facts
                cols={3}
                items={[
                  { label: 'In flight', value: probe?.status ? num(probe.status.arena.in_flight) : '—' },
                  { label: 'Awaiting rating', value: probe?.status ? num(probe.status.arena.awaiting_rating) : '—' },
                  { label: 'Last played', value: probe?.status ? ago(probe.status.arena.last_played_at) : '—' },
                ]}
              />
            </div>
          </Card>

          <Card>
            <div className="svc-head">
              <h3>The API</h3>
              <Pill tone={reading.api.tone}>{reading.api.word}</Pill>
              <span className="checked">{checking ? 'checking…' : probe ? `checked ${ago(new Date(probe.at).toISOString())}` : ''}</span>
            </div>
            <p className="svc-say">{reading.api.say}</p>
            <div className="svc-facts">
              <Facts
                cols={3}
                items={[
                  { label: 'This request', value: probe?.latencyMs !== null && probe ? ms(probe.latencyMs) : '—' },
                  { label: 'Answered', value: probe ? (probe.error ? 'no' : 'yes') : '—' },
                  { label: 'Re-checks', value: `every ${EVERY_MS / 1000}s` },
                ]}
              />
            </div>
          </Card>
        </div>

        {reading.note ? <div style={{ marginTop: 20 }}>{reading.note}</div> : null}

        <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn sm" type="button" onClick={() => void check()} disabled={checking}>
            {checking ? 'Checking…' : 'Check again now'}
          </button>
          <span className="muted" style={{ font: '12px var(--font-mono)' }}>
            The API line is measured in your browser, not reported by the server.
          </span>
        </div>
      </section>

      {/* Editorial, not data, so it takes the home page's two-column shape rather
          than a card: a heading against its own text, no box drawn round it. */}
      <section className="wrap sec">
        <div className="say-two">
          <h2>What these two actually mean</h2>
          <div className="prose">
            <p className="muted">
              The <b>arena</b> is running when matches are being scheduled, played and rated. If it stops,
              nothing is lost: versions stay active, ratings stay where they are, and the queue drains when
              it comes back. Submitting still works.
            </p>
            <p className="muted">
              The <b>API</b> is what this website reads. If it stops answering, the site cannot show you a
              leaderboard or a match even though the arena may be playing perfectly well behind it — which
              is why the two are reported apart rather than as one green light.
            </p>
            <p className="muted">
              Neither line is a promise about the future. They are what was true at the last check, and the
              page re-checks itself every {EVERY_MS / 1000} seconds.
            </p>
          </div>
        </div>
      </section>
    </Shell>
  )
}

type Line = { tone: PillTone; word: string; say: string }

function read(probe: Probe | null): {
  headline: React.ReactNode
  said: string
  arena: Line
  api: Line
  note: React.ReactNode | null
} {
  if (!probe) {
    return {
      headline: 'Checking…',
      said: 'Asking the API how the arena is doing.',
      arena: { tone: 'closed', word: 'Unknown', say: 'Waiting for the first answer.' },
      api: { tone: 'closed', word: 'Unknown', say: 'Waiting for the first answer.' },
      note: null,
    }
  }

  // The API did not answer. It is the only case where the arena line is honestly
  // unknown, because the arena reports through the API.
  if (probe.error || !probe.status) {
    return {
      headline: (
        <>
          The API is <span className="bad">not answering</span>.
        </>
      ),
      said: 'This site cannot read anything right now. What you can see elsewhere on it was loaded earlier and may be stale.',
      arena: {
        tone: 'closed',
        word: 'Unknown',
        say: 'We cannot tell. The arena reports through the API, and the API is not reporting.',
      },
      api: {
        tone: 'bad',
        word: 'Not answering',
        say: probe.error?.status
          ? `The last read failed with ${probe.error.status} ${probe.error.code}.`
          : 'The last read did not complete. This is ours to fix.',
      },
      note: (
        <Note tone="bad" title="Your work is safe.">
          <p>
            Versions, ratings and finished matches live in the database, not in this website. Nothing is
            being lost while the API is down. Submitting will fail until it is back; try again rather than
            submitting twice.
          </p>
        </Note>
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

  const api: Line = {
    tone: 'ok',
    word: 'Answering',
    say:
      probe.latencyMs !== null && probe.latencyMs > 1500
        ? `Reads are answering, but slowly — this one took ${ms(probe.latencyMs)}.`
        : 'Every read this site makes is answering.',
  }

  if (stalled) {
    return {
      headline: (
        <>
          The arena has <span className="bad">stopped playing</span>.
        </>
      ),
      said: `Nothing has finished for ${ago(a.last_played_at)}, and ${num(a.queue)} matches are waiting. The API is answering, so the standings you can see are correct — they are simply not moving.`,
      arena: {
        tone: 'bad',
        word: 'Stopped',
        say: 'Matches are queued and none is finishing. Nothing is lost; the queue drains when it comes back.',
      },
      api,
      note: (
        <Note tone="warn" title="What this means for you.">
          <p>
            A version you submitted is still admitted and still queued; its trial will run. No result is
            dropped and no rating is wrong — the ladder is stopped, not damaged.
          </p>
        </Note>
      ),
    }
  }

  if (backedUp || countBehind) {
    return {
      headline: (
        <>
          The arena is <span className="warn">behind</span>.
        </>
      ),
      said: countBehind
        ? 'Matches are being played, but the ratings are being counted more slowly than they arrive, so a new result may take a few minutes to reach the ladder.'
        : 'Matches are still being played, but slower than they are being queued, so a new result may take a few minutes to show up.',
      arena: {
        tone: 'wait',
        word: 'Behind',
        say: countBehind
          ? `${num(a.awaiting_rating)} finished matches are waiting to be counted. Nothing is lost — results arrive late, not never.`
          : 'The queue is draining slower than it fills. Nothing is lost — results arrive late, not never.',
      },
      api,
      note: (
        <Note tone="warn" title="What this means for you.">
          <p>
            A version you submitted is still admitted and still queued; its trial will run. A match that
            finished may sit at <em>counting the rating change…</em> for longer than usual. No result is
            dropped and no rating is wrong — the ladder is just late.
          </p>
        </Note>
      ),
    }
  }

  return {
    headline: (
      <>
        Everything is <span className="ok">running</span>.
      </>
    ),
    said: `The arena is playing matches and the API is answering. ${num(a.matches_last_hour)} matches finished in the last hour.`,
    arena: {
      tone: 'ok',
      word: 'Running',
      say: 'Matches are being scheduled, played and rated normally.',
    },
    api,
    note:
      a.admission_queue > 0 || a.awaiting_trial > 0 ? (
        <Note tone="info" title="Versions in flight.">
          <p>
            {num(a.admission_queue)} being admitted and {num(a.awaiting_trial)} waiting for a trial. That is
            the ordinary state of a live season, and it is what a competitor whose version has not moved
            actually wants to know.
          </p>
        </Note>
      ) : null,
  }
}
