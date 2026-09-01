import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from './api'

type Probe = {
  label: string
  method: string
  path: string
  /** Session-gated endpoints answer 401 until the GitHub sign-in has run. */
  gated: boolean
  run: () => Promise<unknown>
}

const PROBES: Probe[] = [
  { label: 'Games', method: 'GET', path: '/v1/games', gated: false, run: () => api.games() },
  { label: 'Leaderboard', method: 'GET', path: '/v1/games/ants/leaderboard', gated: false, run: () => api.leaderboard('ants') },
  { label: 'Me', method: 'GET', path: '/v1/me', gated: true, run: () => api.me() },
  { label: 'My models', method: 'GET', path: '/v1/models?game=ants', gated: true, run: () => api.myModels('ants') },
]

type Result =
  | { kind: 'pending' }
  | { kind: 'ok'; body: unknown }
  | { kind: 'denied'; status: number }
  | { kind: 'failed'; detail: string }

/**
 * Calls each endpoint and reports what came back. Its whole point is the contrast:
 * the two public rows answer either way, and the two gated rows flip from 401 to
 * 200 across a GitHub sign-in without the frontend attaching a single credential.
 */
export function Probes({ signedIn, onRerun }: { signedIn: boolean; onRerun: () => void }) {
  const [results, setResults] = useState<Record<string, Result>>({})

  const runAll = useCallback(() => {
    setResults(Object.fromEntries(PROBES.map((p) => [p.path, { kind: 'pending' } as Result])))
    for (const p of PROBES) {
      p.run()
        .then((body) => setResults((r) => ({ ...r, [p.path]: { kind: 'ok', body } })))
        .catch((err) =>
          setResults((r) => ({
            ...r,
            [p.path]:
              err instanceof ApiError && (err.status === 401 || err.status === 403)
                ? { kind: 'denied', status: err.status }
                : { kind: 'failed', detail: err instanceof ApiError ? `${err.status} ${err.code}` : String(err) },
          })),
        )
    }
  }, [])

  // Re-probe whenever the session changes, so the table always describes now.
  useEffect(runAll, [runAll, signedIn])

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Endpoints</h2>
        <button
          className="btn ghost small"
          onClick={() => {
            onRerun()
            runAll()
          }}
        >
          Re-probe
        </button>
      </div>
      <table className="probes">
        <tbody>
          {PROBES.map((p) => {
            const r = results[p.path] ?? { kind: 'pending' }
            return (
              <tr key={p.path}>
                <td className="probe-name">
                  {p.label}
                  {p.gated && <span className="tag">session</span>}
                </td>
                <td className="mono muted small">
                  {p.method} {p.path}
                </td>
                <td className="probe-result">
                  {r.kind === 'pending' && <span className="muted">…</span>}
                  {r.kind === 'ok' && <span className="pill ok">200</span>}
                  {r.kind === 'denied' && <span className="pill warn">{r.status}</span>}
                  {r.kind === 'failed' && <span className="pill bad">{r.detail}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="muted small">
        {signedIn
          ? 'All four answer: the session cookie satisfies the channel JWT guard.'
          : 'The two session rows answer 401 until GitHub sign-in mints the cookie.'}
      </p>
    </section>
  )
}
