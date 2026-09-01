import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, startGitHubSignIn, type Game } from './api'
import { useSession } from './useSession'
import { GitHubMark } from './GitHubMark'
import { Probes } from './Probes'
import './App.css'

export default function App() {
  const { session, refresh, signOut } = useSession()
  const [games, setGames] = useState<Game[] | null>(null)

  // A public read, so it renders for anonymous visitors too — it is the control
  // against which the session-gated probes below are read.
  useEffect(() => {
    api.games().then(setGames).catch(() => setGames(null))
  }, [])

  const onSignOut = useCallback(async () => {
    await signOut()
  }, [signOut])

  return (
    <div className="app">
      <header className="bar">
        <div className="wordmark">
          tiny<span>brains</span>
        </div>
        <div className="bar-right">
          {session.state === 'signed-in' ? (
            <>
              <span className="handle">@{session.me.handle}</span>
              <button className="btn ghost" onClick={onSignOut}>
                Sign out
              </button>
            </>
          ) : session.state === 'anonymous' ? (
            <button className="btn" onClick={startGitHubSignIn}>
              <GitHubMark /> Sign in with GitHub
            </button>
          ) : null}
        </div>
      </header>

      <main>
        {session.state === 'loading' && <p className="muted">Checking session…</p>}

        {session.state === 'error' && (
          <div className="panel bad">
            <h2>Could not reach Soma</h2>
            <p className="muted">
              {session.error instanceof ApiError
                ? `${session.error.status} ${session.error.code} — ${session.error.message}`
                : session.error.message}
            </p>
            <p className="muted small">
              Is <code>orion-server</code> running on 127.0.0.1:8080?
            </p>
          </div>
        )}

        {session.state === 'anonymous' && (
          <section className="hero">
            <h1>Sign in to submit a model.</h1>
            <p className="muted">
              Soma authenticates through GitHub. Signing in mints a 30-day session
              cookie; the session-gated endpoints below start answering the moment
              it exists.
            </p>
            <button className="btn big" onClick={startGitHubSignIn}>
              <GitHubMark /> Sign in with GitHub
            </button>
          </section>
        )}

        {session.state === 'signed-in' && (
          <section className="panel">
            <h2>Identity</h2>
            <p className="muted small">
              Straight from <code>GET /v1/me</code>, resolved from the session
              cookie's <code>sub</code> claim — not from anything the browser holds.
            </p>
            <dl className="kv">
              <dt>handle</dt>
              <dd className="mono">{session.me.handle}</dd>
              <dt>user id</dt>
              <dd className="mono">{session.me.id}</dd>
              <dt>role</dt>
              <dd className="mono">{session.me.role}</dd>
            </dl>
          </section>
        )}

        <Probes signedIn={session.state === 'signed-in'} onRerun={refresh} />

        <section className="panel">
          <h2>Games</h2>
          {games === null ? (
            <p className="muted">…</p>
          ) : (
            <ul className="games">
              {games.map((g) => (
                <li key={g.id}>
                  <span className="mono">{g.id}</span>
                  <span className="muted">{g.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
