// Not found, and something went wrong.
//
// One component, because the design problem is telling the two apart. A
// well-formed id we do not have is a fact about the world: the record is not
// there, and reloading will not change that. An API we cannot reach is a fact
// about us: the record probably exists and the page is worth reloading. Saying
// "something went wrong" to both is what makes an error page useless.
//
// Every page that fetches a permalink ends here when the fetch fails, so the
// distinction is drawn from the status rather than re-decided per page.

import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { ApiError } from '../api'
import { KeyValues } from './ui'

export type MissingKind = 'model' | 'match' | 'profile' | 'route'

function Mid({ children }: { children: ReactNode }) {
  return <section className="mid">{children}</section>
}

function What({ items }: { items: [string, ReactNode][] }) {
  return <KeyValues className="what" items={items.map(([key, value]) => ({ key, value }))} />
}

export function NotFound({ kind = 'route', what }: { kind?: MissingKind; what?: string }) {
  const location = useLocation()
  const path = what ?? `${location.pathname}${location.search}`

  if (kind === 'model') {
    return (
      <Mid>
        <div className="code">404 · not found</div>
        <h1>There is no version with that id.</h1>
        <code className="badurl">{path}</code>
        <p>
          The id is the right shape, so this is not a typo we can spot for you — it simply names no version
          we hold. A version id is a permalink: once one exists it does not move and it does not expire, so
          an id that resolves to nothing has never existed here.
        </p>
        <div className="acts">
          <Link className="btn primary lg" to="/leaderboard">
            Browse the leaderboard
          </Link>
          <Link className="btn lg" to="/">
            Home
          </Link>
        </div>
        <What
          items={[
            ['Most likely', 'The link was written by hand, or a character was dropped copying it.'],
            ['Also possible', 'It belongs to a different deployment of TinyBrains.'],
          ]}
        />
      </Mid>
    )
  }

  if (kind === 'match') {
    return (
      <Mid>
        <div className="code">404 · not found</div>
        <h1>There is no match with that id.</h1>
        <code className="badurl">{path}</code>
        <p>
          Every match that has been played keeps its id forever, and a match that was cancelled before it
          started keeps its id too. So this one was never scheduled.
        </p>
        <div className="acts">
          <Link className="btn primary lg" to="/matches">
            Every match played
          </Link>
          <Link className="btn lg" to="/">
            Home
          </Link>
        </div>
        <What
          items={[
            ['Most likely', 'A mistyped or truncated link.'],
            ['Worth trying', 'Open the version you were reading about and use its list of matches.'],
          ]}
        />
      </Mid>
    )
  }

  if (kind === 'profile') {
    return (
      <Mid>
        <div className="code">404 · not found</div>
        <h1>Nobody here goes by that name.</h1>
        <code className="badurl">{path}</code>
        <p>
          A profile exists once somebody has signed in, whether or not they have entered anything. This
          handle has not, or it is spelled differently — handles are GitHub's, so they are exact.
        </p>
        <div className="acts">
          <Link className="btn primary lg" to="/leaderboard">
            Browse the leaderboard
          </Link>
          <Link className="btn lg" to="/">
            Home
          </Link>
        </div>
      </Mid>
    )
  }

  return (
    <Mid>
      <div className="code">404 · not found</div>
      <h1>That page is not part of this site.</h1>
      <code className="badurl">{path}</code>
      <p>
        Some early links pointed at pages that no longer exist as pages. Games and seasons are chosen in
        the strip at the top, not walked to: the home page in season 2 is <code>/?season=2</code>, and the
        leaderboard for one game is <code>/leaderboard?game=ants</code>.
      </p>
      <div className="acts">
        <Link className="btn primary lg" to="/">
          Home
        </Link>
        <Link className="btn lg" to="/leaderboard">
          Leaderboard
        </Link>
      </div>
      <What
        items={[
          [
            'If you saved a link',
            'Open the home page and pick the game and season you wanted; the address you land on is the one to keep.',
          ],
          ['If we sent you here', 'That is our bug, not yours.'],
        ]}
      />
    </Mid>
  )
}

/** Not a 404. Something exists; we cannot reach it. */
export function Unreachable({ error }: { error?: ApiError }) {
  return (
    <Mid>
      <div className="code">{error?.status ? `${error.status} · something went wrong` : 'something went wrong'}</div>
      <h1>We could not reach the API.</h1>
      <p>
        This is not a missing page. Whatever you asked for is very probably there — the part of TinyBrains
        that answers questions did not answer this one. Nothing you did caused it and nothing has been
        lost: versions, ratings and finished matches are stored, not held in this page.
      </p>
      <div className="acts">
        <button className="btn primary lg" type="button" onClick={() => window.location.reload()}>
          Reload the page
        </button>
        <Link className="btn lg" to="/status">
          System status
        </Link>
      </div>
      <What
        items={[
          ['Worth doing', 'Reload. A single failed read is common and a reload usually gets a good one.'],
          ['If it keeps failing', 'The status page says whether this is us or your connection.'],
        ]}
      />
      {error?.requestId ? (
        <div className="fine">
          <b>Request id</b> <span className="mono">{error.requestId}</span>
        </div>
      ) : null}
    </Mid>
  )
}

/**
 * What a permalink renders when its own fetch failed. A 404 is the record's
 * absence and gets the page written for it; anything else is ours.
 */
export function FetchFailed({ error, kind }: { error: ApiError; kind: MissingKind }) {
  if (error.status === 404) return <NotFound kind={kind} />
  return <Unreachable error={error} />
}

/** The same distinction, inside a card, where the rest of the page is fine. */
export function InlineError({ error, what }: { error: ApiError; what: string }) {
  return (
    <div className="empty">
      {error.status === 0
        ? `${what} could not be loaded — the API did not answer. This is not an empty list.`
        : `${what} could not be loaded (${error.status} ${error.code}).`}
    </div>
  )
}
