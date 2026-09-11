// The fourteen routes, and a fallback for the book.
//
// Game and season are NOT routes — there is no /games/ants/… branch. They are two
// dropdowns in the context strip whose choice lives in the query string, so one
// home page serves every game and one leaderboard serves every game and every
// season. A second game adds a row to a dropdown and no routes at all.
//
// /docs is not this application's either: nginx and the Vite server answer it from the
// rendered book when one is mounted, and the request never reaches the SPA. The route
// below is what a deployment WITHOUT the book answers, and it sends the reader to the
// same chapter's source rather than calling a real page a typo.

import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { SessionProvider } from './providers/session'
import { PlatformProvider } from './providers/platform'
import { Shell } from './components/Shell'
import { NotFound } from './components/ErrorStates'

import Home from './pages/Home'
import Leaderboard from './pages/Leaderboard'
import Matches from './pages/Matches'
import MatchPage from './pages/Match'
import Version from './pages/Version'
import ModelPage from './pages/ModelPage'
import Models from './pages/Models'
import Profile from './pages/Profile'
import Submit from './pages/Submit'
import Start from './pages/Start'
import Status from './pages/Status'
import SignInCallback from './pages/SignInCallback'
import SeasonsAdmin from './pages/SeasonsAdmin'
import Docs from './pages/Docs'

export default function App() {
  return (
    <BrowserRouter>
      {/* Both providers read the selection, and the selection is the query string. */}
      <SessionProvider>
        <PlatformProvider>
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
            <Route path="/status" element={<Status />} />
            <Route path="/signin/callback" element={<SignInCallback />} />

            {/* admin: session-gated, and unlinked by design */}
            <Route path="/admin/seasons" element={<SeasonsAdmin />} />

            {/* the book, when the deployment has not mounted one */}
            <Route path="/docs" element={<Docs />} />
            <Route path="/docs/*" element={<Docs />} />

            <Route
              path="*"
              element={
                <Shell title="Not found">
                  <NotFound kind="route" />
                </Shell>
              }
            />
          </Routes>
        </PlatformProvider>
      </SessionProvider>
    </BrowserRouter>
  )
}
