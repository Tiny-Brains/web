// The routes.
//
// Game and season are NOT routes — there is no /games/ants/… branch. They are chosen in the
// header's scope switcher and live in the query string, so one home page serves every game and
// one leaderboard every season. A second game is a row in the switcher and no routes at all.
//
// /docs is not this application's either: nginx and the Vite server answer it from the rendered
// book, and there is no route for it — a route would only ever shadow the book.
//
// WHAT IS SPLIT OUT. The browsing surface — home, the two list pages and the entity pages — is
// imported directly: that is where a reader lands and moves between, and a suspense fallback on
// every step would be a flash bought with nothing. Pages a reader reaches once or never are lazy.

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { SessionProvider } from './providers/session'
import { PlatformProvider } from './providers/platform'
import { NotificationsProvider } from './providers/notifications'
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
import Profile from './pages/Profile'
import Me from './pages/Me'

const Submit = lazy(() => import('./pages/Submit'))
const Account = lazy(() => import('./pages/Account'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Start = lazy(() => import('./pages/Start'))
const Faq = lazy(() => import('./pages/Faq'))
const Changelog = lazy(() => import('./pages/Changelog'))
const Status = lazy(() => import('./pages/Status'))
const SignInCallback = lazy(() => import('./pages/SignInCallback'))
const SeasonsAdmin = lazy(() => import('./pages/SeasonsAdmin'))
const RunnersAdmin = lazy(() => import('./pages/RunnersAdmin'))

/** A split route waits inside the shell it is becoming, so the bar and the footer never blink. */
function Pending() {
  return (
    <Shell>
      <section className="wrap page-head">
        <Loading rows={4} label="Loading the page" />
      </section>
    </Shell>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      {/* TWO BOUNDARIES: the outer one for a provider that threw, where nothing of the shell can be
          assumed, and the inner one for a page that threw, where all of it can. */}
      <AppErrorBoundary>
        <SessionProvider>
          <PlatformProvider>
            <NotificationsProvider>
              <RouteErrorBoundary>
                <Suspense fallback={<Pending />}>
                  <Routes>
                    {/* watch */}
                    <Route path="/" element={<Home />} />
                    <Route path="/leaderboard" element={<Leaderboard />} />
                    <Route path="/matches" element={<Matches />} />
                    <Route path="/matches/:id" element={<MatchPage />} />
                    <Route path="/models/:id" element={<ModelPage />} />
                    {/* A param has to be a whole segment, so Version reads the `v` off `v3`. */}
                    <Route path="/models/:modelId/:version" element={<Version />} />
                    <Route path="/versions/:id" element={<Version />} />
                    <Route path="/profile/:username" element={<Profile />} />

                    {/* learn */}
                    <Route path="/start" element={<Start />} />
                    <Route path="/faq" element={<Faq />} />
                    <Route path="/changelog" element={<Changelog />} />
                    <Route path="/status" element={<Status />} />

                    {/* you: signed in */}
                    <Route path="/me" element={<Me />} />
                    <Route path="/me/notifications" element={<Notifications />} />
                    <Route path="/me/account" element={<Account />} />
                    <Route path="/submit" element={<Submit />} />
                    <Route path="/signin/callback" element={<SignInCallback />} />

                    {/* admin: linked from an administrator's account menu */}
                    <Route path="/admin" element={<Navigate to="/admin/seasons" replace />} />
                    <Route path="/admin/seasons" element={<SeasonsAdmin />} />
                    <Route path="/admin/runners" element={<RunnersAdmin />} />

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
            </NotificationsProvider>
          </PlatformProvider>
        </SessionProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  )
}
