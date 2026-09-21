// The last thing between a thrown render and a white page.
//
// THIS APPLICATION EXPECTS SHAPE DRIFT. `api/types.ts` says so in its first paragraph: the
// declarations were read off each Soma workflow's `json_build_object` and TypeScript cannot notice
// when one changes, and there is no test suite to notice either. So the one failure the
// architecture openly admits to is a page reading a field that is no longer there -- and without a
// boundary that blanks the whole document: no bar, no footer, no message, and no way back.
//
// TWO LEVELS, BECAUSE THE TWO FAILURES ARE NOT THE SAME SIZE.
//
//   RouteErrorBoundary  inside the providers, around the routes. A page threw and nothing else
//                       did, so the bar, the strip and the footer are all still drawable and the
//                       reader keeps every way out of the page they are on. This is the common
//                       case by far.
//   AppErrorBoundary    outside them, around everything. A provider threw, so `Shell` cannot be
//                       rendered -- it calls `usePlatform` and `useSession` and one of those is
//                       the casualty -- and nor can `<Link>`, since the router may be. The
//                       fallback is the plainest page this repository can draw and still be
//                       itself: plain anchors, and no hook but the tokens `index.html` loads.
//
// BOTH RESET ON NAVIGATION. A class component cannot read the location, so the wrappers key the
// class by one: a new location is a new boundary, which is what lets a reader walk away from a
// broken page instead of being held on it.

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Shell } from './Shell'
import common from '../../copy/common.json'

const E = common.errors.crash

type BoundaryProps = { children: ReactNode; render: (error: Error) => ReactNode }
type State = { error: Error | null }

class Boundary extends Component<BoundaryProps, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The console is the only reporter here: this application ships no telemetry and must not
    // start shipping any from an error path.
    console.error('TinyBrains: a page failed to render.', error, info.componentStack)
  }

  render() {
    return this.state.error ? this.props.render(this.state.error) : this.props.children
  }
}

/** The words, which are the same either way: it is our bug, nothing is lost, and here are the
 *  ways on. The actions are plain anchors in both, because the outer one cannot route and a
 *  reload is what the inner one most often wants anyway. */
function Said({ error }: { error: Error }) {
  // No <Link> and no provider: the outer boundary draws this when a provider or the router threw.
  return (
    <section className="wrap">
      <div className="message">
        <div className="code">{E.code}</div>
        <h1>{E.title}</h1>
        <p>{E.body}</p>
        <div className="acts">
          <button className="btn primary lg" type="button" onClick={() => window.location.reload()}>
            {E.reload}
          </button>
          <a className="btn lg" href="/">
            {E.home}
          </a>
          <a className="btn lg" href="/status">
            {E.status}
          </a>
        </div>
        <div className="fine">
          <b>{E.moreHeading}</b>
          <ul>
            {E.more.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mono">{error.message}</p>
        </div>
      </div>
    </section>
  )
}

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <Boundary
      key={`${location.pathname}${location.search}`}
      render={(error) => (
        <Shell title={E.tab}>
          <Said error={error} />
        </Shell>
      )}
    >
      {children}
    </Boundary>
  )
}

/** Around everything, outside the providers: nothing of the shell is assumed to work. */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <Boundary key={`${location.pathname}${location.search}`} render={(error) => <Said error={error} />}>
      {children}
    </Boundary>
  )
}
