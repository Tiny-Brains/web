// The sixteen routes.
//
// Game and season are NOT routes — there is no /games/ants/… branch. They are two
// dropdowns in the context strip whose choice lives in the query string, so one
// home page serves every game and one leaderboard serves every game and every
// season. A second game adds a row to a dropdown and no routes at all.
//
// /docs is not this application's either: the book lives in docs/ and is built into the
// image at that path, so nginx and the Vite server answer it and the request never
// reaches the SPA. There is no route for it and there must not be one -- a route would
// only ever shadow the book.
//
// WHAT IS SPLIT OUT, AND WHY NOT ALL OF IT. The browsing surface — the home page, the two
// selector pages and the four permalinks — is imported directly: those are where a reader lands
// and where they move between, and a suspense fallback on every step would be a flash bought with
// nothing. The pages a reader reaches once or never — the long editorial ones, the submit form,
// the status page, the sign-in callback, the unlinked admin page — are lazy, so the first paint
// does not carry them. They are the bulk of the words in this repository and none of them is the
// first page anybody sees.

import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { SessionProvider } from './providers/session'
import { PlatformProvider } from './providers/platform'
import { Shell } from './components/Shell'
import { NotFound } from './components/ErrorStates'
import { AppErrorBoundary, RouteErrorBoundary } from './components/ErrorBoundary'
import { Loading } from './components/ui'

import Home from './pages/Home'
import Leaderboard from './pages/Leaderboard'
import Matches from './pages/Matches'
import MatchPage from './pages/Match'
import Version from './pages/Version'
import ModelPage from './pages/ModelPage'
import Models from './pages/Models'
import Profile from './pages/Profile'

const Submit = lazy(() => import('./pages/Submit'))
const Start = lazy(() => import('./pages/Start'))
const Status = lazy(() => import('./pages/Status'))
const SignInCallback = lazy(() => import('./pages/SignInCallback'))
const SeasonsAdmin = lazy(() => import('./pages/SeasonsAdmin'))
const Faq = lazy(() => import('./pages/Faq'))
const Changelog = lazy(() => import('./pages/Changelog'))

/** The shell with a loading body: a split route waits inside the page it is becoming, not in
 *  place of it, so the bar and the footer never blink. */
function Pending() {
  return (
    <Shell>
      <section className="wrap sec tight">
        <Loading rows={4} label="Loading the page" />
      </section>
    </Shell>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Both providers read the selection, and the selection is the query string. */}
      {/* TWO BOUNDARIES: the outer one for a provider that threw, where nothing of the shell can
          be assumed to render, and the inner one for a page that threw, where all of it can and
          the reader should keep every way out of the page they are on. */}
      <AppErrorBoundary>
        <SessionProvider>
          <PlatformProvider>
            <RouteErrorBoundary>
              <Suspense fallback={<Pending />}>
                <Routes>
                  {/* the three selector pages */}
                  <Route path="/" element={<Home />} />
                  <Route path="/leaderboard" element={<Leaderboard />} />
                  <Route path="/matches" element={<Matches />} />

                  {/* permalinks. A model is addressed by the repository it is published from -- the
                      entry's own key -- and a version is a segment under it. `/versions/:id` stays as
                      the uuid form every API response can be turned into without a lookup. The version
                      segment is `v3`, but a param has to be a whole segment -- `v:version` is matched as
                      literal text and sent every version link to the 404 -- so Version reads the `v` off. */}
                  <Route path="/:game/models/:owner/:repo" element={<ModelPage />} />
                  <Route path="/:game/models/:owner/:repo/:version" element={<Version />} />
                  <Route path="/versions/:id" element={<Version />} />
                  {/* The match page is the replay screen; there is no /matches/:id/replay. */}
                  <Route path="/matches/:id" element={<MatchPage />} />
                  <Route path="/profile/:username" element={<Profile />} />

                  {/* competing, and the utility pages */}
                  <Route path="/models" element={<Models />} />
                  <Route path="/submit" element={<Submit />} />
                  <Route path="/start" element={<Start />} />
                  <Route path="/faq" element={<Faq />} />
                  <Route path="/changelog" element={<Changelog />} />
                  <Route path="/status" element={<Status />} />
                  <Route path="/signin/callback" element={<SignInCallback />} />

                  {/* admin: session-gated, and unlinked by design */}
                  <Route path="/admin/seasons" element={<SeasonsAdmin />} />

                  <Route
                    path="*"
                    element={
                      <Shell title="Not found">
                        <NotFound kind="route" />
                      </Shell>
                    }
                  />
                </Routes>
              </Suspense>
            </RouteErrorBoundary>
          </PlatformProvider>
        </SessionProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  )
}
