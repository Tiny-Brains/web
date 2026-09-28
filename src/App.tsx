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
import { Suspense, lazy, useEffect } from 'react'
import { api } from './api'
import { SessionProvider } from './providers/session'
import { PlatformProvider } from './providers/platform'
import { NotificationsProvider } from './providers/notifications'
import { Shell } from './components/Shell'
import { NotFound } from './components/ErrorStates'
import { AppErrorBoundary, RouteErrorBoundary } from './components/ErrorBoundary'
import { Loading } from './components/ui'
import common from '../copy/common.json'

import Home from './pages/Home'
import Leaderboard from './pages/Leaderboard'
import Matches from './pages/Matches'
import MatchPage from './pages/Match'
import ModelPage from './pages/ModelPage'
import Profile from './pages/Profile'
import Me from './pages/Me'
import Stories from './pages/Stories'
import Post from './pages/Post'

const Submit = lazy(() => import('./pages/Submit'))
const Account = lazy(() => import('./pages/Account'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Start = lazy(() => import('./pages/Start'))
const Faq = lazy(() => import('./pages/Faq'))
const Changelog = lazy(() => import('./pages/Changelog'))
const Credits = lazy(() => import('./pages/Credits'))
const Status = lazy(() => import('./pages/Status'))
const SignIn = lazy(() => import('./pages/SignIn'))
const SignInCallback = lazy(() => import('./pages/SignInCallback'))
const SeasonsAdmin = lazy(() => import('./pages/SeasonsAdmin'))
const SeasonNew = lazy(() => import('./pages/SeasonNew'))
const SeasonRoundsAdmin = lazy(() => import('./pages/SeasonRoundsAdmin'))
const Maps = lazy(() => import('./pages/Maps'))
const RunnersAdmin = lazy(() => import('./pages/RunnersAdmin'))
const UsersAdmin = lazy(() => import('./pages/UsersAdmin'))
const UserDesk = lazy(() => import('./pages/UserDesk'))
const CommentsAdmin = lazy(() => import('./pages/CommentsAdmin'))
const AnnouncementsAdmin = lazy(() => import('./pages/AnnouncementsAdmin'))
const AnnouncementNew = lazy(() => import('./pages/AnnouncementNew'))
const NotifyAdmin = lazy(() => import('./pages/NotifyAdmin'))
const NotifyNew = lazy(() => import('./pages/NotifyNew'))
const PostsAdmin = lazy(() => import('./pages/PostsAdmin'))
const PostEdit = lazy(() => import('./pages/PostEdit'))
const StoriesAdmin = lazy(() => import('./pages/StoriesAdmin'))
const PicksAdmin = lazy(() => import('./pages/PicksAdmin'))
const AuditAdmin = lazy(() => import('./pages/AuditAdmin'))

/** A split route waits inside the shell it is becoming, so the bar and the footer never blink. */
function Pending() {
  return (
    <Shell>
      <section className="wrap page-head">
        <Loading rows={4} label={common.site.pageLoading} />
      </section>
    </Shell>
  )
}

/** A visit is one page load, whatever the route: posted once, and StrictMode's second run of the
 *  effect is not a second visit. The watch counter divides matches opened by it. */
let visited = false

export default function App() {
  useEffect(() => {
    if (visited) return
    visited = true
    api.recordEvent({ event: 'visit' }).catch(() => undefined)
  }, [])
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
                    {/* The selected season's boards, each drawn at turn zero by the cartridge's viewer. */}
                    <Route path="/maps" element={<Maps />} />
                    <Route path="/matches/:id" element={<MatchPage />} />
                    {/* The version page folds into the model page: both version routes land on it
                        with that version's row open. A param is a whole segment, so the page reads
                        the `v` off `v3`. */}
                    <Route path="/models/:id" element={<ModelPage />} />
                    <Route path="/models/:id/:version" element={<ModelPage />} />
                    <Route path="/versions/:versionId" element={<ModelPage />} />
                    <Route path="/profile/:username" element={<Profile />} />
                    <Route path="/blog" element={<Stories />} />
                    <Route path="/blog/:slug" element={<Post />} />

                    {/* learn */}
                    <Route path="/start" element={<Start />} />
                    <Route path="/faq" element={<Faq />} />
                    <Route path="/changelog" element={<Changelog />} />
                    <Route path="/credits" element={<Credits />} />
                    <Route path="/status" element={<Status />} />

                    {/* you: signed in. /me is an address, not a page: it opens your profile. */}
                    <Route path="/me" element={<Me />} />
                    <Route path="/me/notifications" element={<Notifications />} />
                    <Route path="/me/account" element={<Account />} />
                    <Route path="/submit" element={<Submit />} />
                    <Route path="/signin" element={<SignIn />} />
                    <Route path="/signin/callback" element={<SignInCallback />} />

                    {/* admin: linked from an administrator's account menu */}
                    <Route path="/admin" element={<Navigate to="/admin/seasons" replace />} />
                    <Route path="/admin/seasons" element={<SeasonsAdmin />} />
                    <Route path="/admin/seasons/new" element={<SeasonNew />} />
                    <Route path="/admin/seasons/rounds" element={<SeasonRoundsAdmin />} />
                    <Route path="/admin/runners" element={<RunnersAdmin />} />
                    <Route path="/admin/users" element={<UsersAdmin />} />
                    <Route path="/admin/users/:handle" element={<UserDesk />} />
                    <Route path="/admin/comments" element={<CommentsAdmin />} />
                    <Route path="/admin/announcements" element={<AnnouncementsAdmin />} />
                    <Route path="/admin/announcements/new" element={<AnnouncementNew />} />
                    <Route path="/admin/notify" element={<NotifyAdmin />} />
                    <Route path="/admin/notify/new" element={<NotifyNew />} />
                    <Route path="/admin/posts" element={<PostsAdmin />} />
                    <Route path="/admin/posts/new" element={<PostEdit />} />
                    <Route path="/admin/posts/:id" element={<PostEdit />} />
                    <Route path="/admin/stories" element={<StoriesAdmin />} />
                    <Route path="/admin/picks" element={<PicksAdmin />} />
                    <Route path="/admin/audit" element={<AuditAdmin />} />

                    <Route
                      path="*"
                      element={
                        <Shell title={common.errors.tabNotFound} reading>
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
