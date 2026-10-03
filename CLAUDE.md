# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`web/` is the TinyBrains browser application (React 19, TypeScript, Vite 8), the nginx image that
serves it, and **no compose file**: the local platform, and every other environment, comes up from `tinybrains/devops/`. `README.md` is the human guide: running
the stack, commands, configuration, releasing, layout and troubleshooting. `docs/` is the competitor
guide, an mdBook with its own [`docs/CLAUDE.md`](docs/CLAUDE.md): read that before changing anything
under it. The parent directory's `CLAUDE.md` covers the platform and the contracts that cross repos.

## Checks

```sh
npm run lint                  # oxlint; .oxlintrc.json adds no-shadow and react/jsx-no-comment-textnodes
npm test                      # vitest: src/**/*.test.tsx, rendered to static markup, no DOM
npm run build                 # tsc -b (strict) && vite build
scripts/check/configs.sh      # cross-repo values; reads ../soma, ../kalam and the local images
(cd docs && mdbook build)     # after touching docs/
npm run vendor:viewers        # fill public/cartridges/; an empty one is "viewer unavailable"
```

**Two servers want port 5173.** The compose `web` container publishes the baked image there and
`npm run dev` serves live edits there, so `docker compose stop web` first and leave the rest of the
stack up. `predev` runs both vendor scripts; `prebuild` runs `vendor:viewers`.

The unit tests are few and pin what no type states: `pages/Leaderboard.test.tsx` holds a format-1
leaderboard to the markup in `__snapshots__/leaderboard-format1.html`, written by the table before it
read `columns`, so a change there is `npx vitest -u` and a reviewed diff of that file. They render
with `react-dom/server` inside a `MemoryRouter` and a stub `PlatformContext`; there is no DOM
environment. CI (`.github/workflows/check.yml`) runs oxlint, the tests, `tsc -b`, `npx vite build`
(not `npm run build`, whose `prebuild` fetches the viewer from GitHub) and `nginx -t`.
Verification beyond that is reading routes against a running stack, at
desktop width and at a real 390px through CDP device emulation: headless Chrome's window will not
go that narrow on its own. A multi-seat or otherwise unreachable state is proved by rewriting the
API response over CDP and reading the page.

Two things catch what no test does, and neither is validation:

- `components/ErrorBoundary.tsx` is two boundaries. `RouteErrorBoundary`, inside the providers,
  replaces the page and keeps the shell; `AppErrorBoundary`, outside them, assumes nothing (no
  `Shell`, no `<Link>`), because a provider or the router is what threw. Both RESET on the location,
  and by a prop rather than a `key`: a `key` would remount the whole route subtree on every
  debounced keystroke an admin desk puts in the query string.
- `api/shape.ts` checks a few bodies (`Me`, a season, a ladder row) against the fields the pages
  read, under `import.meta.env.DEV` only, and logs a console error naming the route and the field.
  A shape lists only fields whose absence breaks a page; keep it from becoming a mirror of the type.

## Rules

### Selection and routing

- **Game and season are selection, not routes.** There is no `/games/ants/…` branch. The scope
  switcher puts both in the query string, and each is omitted when it is the default (the default
  game, its live season). A second game is a row in the switcher; a route branch for one undoes the
  design.
- The selection spans four files: `App.tsx` declares every route flat; `lib/selection.ts` reads and
  writes the query string and builds hrefs that **carry the selection across every link**;
  `providers/platform.tsx` resolves "no season parameter" to the game's featured season (the game's `season`), and reads the member seasons list when signed in;
  `Shell.tsx` draws the switcher.
- **Addresses are functions in `lib/paths.ts`**, never template literals spread through the pages.
  A model's path is its id (an entry's name is the competitor's own free text, and never in a URL),
  a version is a segment under the model, and `/versions/{id}` is the form any API response turns
  into without a lookup. **The game is not in these paths**: a model id names its game.
- On a list page (`/`, `/leaderboard`, `/matches`, `/maps`) a new selection keeps the page and its filters;
  on any other page it goes to that season's home, because a match, model or version belongs to one
  season. Such a page passes `season` to `Shell` so the switcher shows the season it belongs to.
- **A season is addressed by its slug** (`?season=<slug>`, every link and API call) and labelled by
  its name. Nothing shows the internal number.
- **A season's boards are its own**: they come from `GET /v1/games/{game}/seasons/{slug}/maps`,
  never from the cartridge, which ships only the basic boards.
- **What is personal draws for its owner alone, on the page it belongs to.** The profile is its
  owner's desk (in-flight versions, New model, Retire, queued pairings) and the model page is its
  owner's (the in-flight notice, rejected versions, the story editor, notes); home is the one page
  that changes by audience (a competitor's desk, or the visitor's ladder and matches). `/me` is an
  address, not a page: it opens your profile. `/me/notifications` and `/me/account` stay routes.
  The private rows come from the owner's own routes (`/v1/me/...`, `/v1/models`), never a flag on a
  public one.
- **Ways around, each with one job**: the guide (sections, Stories among them once the first story
  is published; below 1000px the drawer, below 760px its first four as the tab bar), the scope switcher (game and season), breadcrumbs from every
  `PageHeader` (up a level; no hard-coded back links), the account menu (profile, account, theme,
  the admin desk, sign out), the bell, and the one-line footer. Every popover opens and closes
  through `lib/usePopover.ts`: outside click, Escape returning focus, and navigation. Discord and
  GitHub, the two ways off the site to a person, close the guide.
- **The community addresses live in `copy/common.json`'s `community`**, which the guide and
  `components/Help.tsx` read. The copies not on it are the footer's GitHub link (its own JSON
  array), the What's new entry, and the book: its bar (`docs/theme/index.hbs`), the Quickstart and
  Rejection reasons. So does the organisation's `Tiny-Brains/.github` repository: the profile, its
  `SUPPORT.md` and the issue forms and chooser every repository inherits from it. A new invite is an
  edit to each (`grep -rn discord.gg` here and there). The links open in a new tab, so the error
  being asked about stays on screen.
- **An error says where to ask.** A refusal, a failed upload, match or action, a rejected version,
  the API-down notice and every failure `Message` end with `AskForHelp`; a page that runs out of
  answers (`/start`, `/faq`) ends with `CommunityButtons`. A new error a competitor can be stuck on
  takes it too.
- **The shell is mounted ONCE, above the router, and a page does not draw it.** `SiteChrome`
  (`components/Shell.tsx`) wraps `<Routes>` in `App.tsx`, so a navigation replaces what is inside
  `<main>` and nothing else: the bar, the guide, the announcements, the toasts and the icon sprite
  survive every link, with the reader's keyboard focus and the guide's fold. What a page renders is
  `Shell`, which DECLARES what the shell should say about it — `nav`, `title`, `scoped`, `season` —
  through `providers/chrome.tsx`. **It declares in a layout effect**, which React flushes before the
  next paint, so the tab never shows the previous page's words; declaring during render would be one
  component writing another's state, and a passive effect would be a painted frame late. An equal
  declaration is not a state change, or every keystroke an admin desk puts in the query string would
  re-render the bar. Putting the chrome back inside the route switch brings back the flicker, the
  lost focus and the height jump it was taken out of.
- **A navigation lands at the top of the page, and Back where the reader was** (`lib/useScrollReset.ts`).
  Nothing tears the document down any more, so nothing resets the offset for us. It moves on a change
  of PATHNAME only: the query string is selection and desk state, not a new page. It runs in a layout
  effect and takes `history.scrollRestoration` to `manual`, or the browser restores its own offset a
  frame later and the page jumps twice.
- **A route change is announced** by the polite live region in `SiteChrome`. While every page mounted
  its own shell a screen reader met a new document on each link; now it must be told.
- `App.tsx` imports the browsing surface directly (home, the list pages, the permalinks) and
  `lazy()`s the rest; `vite.config.ts` splits React and the router into a `vendor` chunk. React
  Router navigates in a transition, so a lazy page holds the page it is leaving until its chunk
  lands; `Pending`'s placeholder is what a COLD load of one draws.

### Data and the API client

- **Contexts hold what several pages need**: `providers/session*`, `providers/platform*` (games,
  selected game, seasons, resolved season, whether a story exists yet) and `providers/notifications*`. Each is split into a
  `-context.ts` and a `.tsx` provider so consumers import no component and fast refresh works.
- **`lib/useApi.ts` is per page and is not a cache.** Its `key` string alone decides when to
  re-fetch; the callback is deliberately not a dependency (pages build it inline) and is read
  through a ref. The third argument, `enabled`, declines a request the page will not draw.
  `reload` is `useCallback`-stable because `providers/platform.tsx` depends on it.
- **The types are assertions, not validation.** `src/api/types.ts` was read off the
  `json_build_object` in each Soma workflow's query; `soma/workflows/soma-*.json` is the authority.
  Compare it when editing, because TypeScript cannot notice a change.
- **A refusal is a string, not a code object.** Orion's own failures are `{error: {code, message}}`;
  Soma's refusals are `{error: "not_a_participant", detail: {…}}`. `ApiError` reads both. Render
  every refusal as a sentence naming what happened and what would change it.
- **A private season is read through `/v1/private`.** Every read that can name a season has a
  signed-in, uncached twin under `/v1/private/…` with the same body; the public routes never reveal a
  private season. `usePlatform().priv(season)` (and `scope` for the selected season) is the one place
  that picks the route: the member's only for a private season (or, for a read by id, when the viewer
  sees any private season), so every other read stays cached. The seasons themselves are the
  member's list once signed in, and a named season waits to resolve before anything is read for it.
  An unknown or invisible `?season=` is `useSeasonWall()`'s Not found, never a skeleton.
- **"No such thing" has two answers.** An unknown model id answers 200 with a null body; an
  unknown or private match or version answers 404. `components/Permalink.tsx` is the one gate: a
  404 or null data is `NotFound`, any other error `FetchFailed`, loading a skeleton. Reading only
  the status leaves a model page loading for ever.
- **Notifications are polled.** `providers/notifications.tsx` reads the newest on sign-in, then
  polls with `since=` every 30 s while the tab is visible. A new item goes into the bell, arrives as
  a toast (a polite live region that never takes focus), and, with permission and that kind's push
  setting on, as a system notification while the tab is in the background. What is in progress is
  not a notification: the bell pins the candidates above the feed, read from `/v1/me/candidates`
  on the same poll (Soma serves `/v1/me` from a cached session entry, so they are not on it).
  `data` carries the chips (`components/Notifications.tsx` reads them by key) and `actor` the
  avatar; renaming a key in
  Soma's writer silently drops a chip.
- **An account's picture comes from the API and is NEVER derived from its handle.** Soma caches the
  provider's own `picture` on the account (`users.avatar_url`, refreshed at every sign-in) and
  answers it on `/v1/me` and the profile; `components/Avatar.tsx` draws the initials and lays the
  picture over them, so no `src`, a broken one and a provider that serves none all end at one
  circle. It was once `github.com/<handle>.png`, which became a stranger's face the moment a second
  provider could sign somebody in: a handle is seeded once and never synced. A call site with no
  avatar in its body passes none — do not reach for the handle to fill it in.
- **An upload hashes the buffer it sends.** `lib/upload.ts` reads a file once, hashes that buffer
  with `crypto.subtle` and PUTs the same buffer. `crypto.subtle` exists only in a secure context
  (https, or localhost), so the form says so where it is missing.
- **The runners page keeps authorisation and liveness apart.** `live` means the runner, its key
  and the key's owner are in good standing; calling in means `last_seen_at` moved within a lease.
  Authorised and silent is quiet; quiet while holding matches is wedged. Never collapse them into
  one badge.
- **`/status` reports the arena and the API apart, never as one light.** `GET /v1/status` is the
  arena half alone, deliberately: a route cannot measure itself, because when the API is
  down the numbers saying so are the numbers that do not arrive. The page times its own calls for
  the other half. Running, behind and down are this page's reading of those numbers and its own
  thresholds; Soma names no state.

### Sign-in and the proxy

- **Sign-in is browser navigation, not fetch.** `startSignIn` sets `window.location.href`, so
  the OAuth redirect reaches the browser's cookie jar. Signed-in is answered by `/v1/me`: 200
  against 401, and a 401 is the ordinary answer for a visitor, not an error.
- **The `/v1` proxy is the whole auth flow.** Soma sets `soma_session` with no Domain attribute, so
  the browser must only ever see one origin. `vite.config.ts` and `nginx.conf` are two
  implementations of one contract: change them together and re-check redirects and `Set-Cookie`.
- `nginx.conf` turns Soma's fixed 401 at the callback path into `/signin/callback?error=incomplete`,
  which is why that page leads with the missing state cookie (a sign-in begun on `127.0.0.1` and
  finished on `localhost`).
- Secrets never enter the bundle, and there is no runtime environment-variable interface. The
  bundle knows no host: the feed, sitemap and unfurl image carry paths, and nginx makes them
  absolute per request.

### The book at `/docs`

- **`/docs` is not a route and must never become one.** nginx's `location /docs/` and the `book()`
  plugin in `vite.config.ts` answer it, with the same `$uri.html`-first rule; every Docs link in the
  app is a plain `<a>`. Without a `docs/book`, the dev server falls through to the SPA's not-found
  page.
- **One repository, two artifacts.** `docs/Dockerfile` renders the book (mdBook, python3, the
  `tinybrains` release); this `Dockerfile` copies it in with `COPY --from=book`, a build context
  compose fills with `service:docs` and the release workflow with the rendered tree. Inlining those
  stages would make `docker compose build web` a Rust build, so `.dockerignore` and `.oxlintrc.json`
  exclude `docs/`.
- `npm run dev` is the book's real preview (`site-url = "/docs/"`, and the theme imports this
  origin's `/design-system/tokens.css`). `scripts/vendor-book.sh` fills `docs/book` from `DOCS_REF`
  only when it is absent, so a real local build is never overwritten.

### The replay viewer

- **The viewer is the cartridge's, from its GitHub release**, never a checkout and never committed.
  The image build fetches it with curl (`ARG ANTS_RELEASE`, or `--build-context ants=../ants/dist`)
  and runs `npm run build --ignore-scripts`; `scripts/vendor-viewers.sh` does the same for the dev
  loop into gitignored `public/cartridges/`.
- **A replay is drawn by the engine that played it.** It is re-simulated from its actions, so a
  viewer on another engine draws a plausible match that never happened, with no error. The image
  keeps the CURRENT viewer (the latest release, or `ANTS_RELEASE`) at `/cartridges/<game>/` and
  every release in `cartridges.json`'s `engines` at `/cartridges/<game>/engines/<hex>/`, and
  `scripts/engines-index.mjs` writes `engines.json`, which says which is which. `loadVizFor()` in
  `lib/viz.ts` picks by the match's `engine_digest` and throws `EngineNotBundled` for any other, which
  `Replay` draws as a refusal; it never falls back to another engine. A match with no digest (only an
  API from before the field) takes the current viewer.
- **`engines` only ever grows, and a release the ladder plays goes in BEFORE the next one is
  published**: the current engine draws its matches from the root without an entry, until the day
  it is not current. `scripts/check/configs.sh` fails while an engine the stacks carry is unlisted.
- **The module list is a contract with ants.** The browser fetches exactly these files: `viz.js`,
  `shell.js`, `render.js`, `engine.js`, `map.js` (the map visual) and `graph.js` (the match graph),
  the last two loaded on first use, and the transpiled component's `.js` and `.core.wasm`. The
  `Dockerfile` and `vendor-viewers.sh` copy them by name, so a new import in `viz.js`, static or
  on first use, is a change to both lists. The current viewer must have all of them; an older
  release may lack a later one (`engine-cd656bc84c1a` has no `graph.js`, so its matches draw no
  graph) only while none of its modules imports it.
- **Every release's viewer injects its stylesheet under one id (`tb-viz-style`), first in wins.** So
  `mountPoint()` puts the current viewer's stylesheet in the document before an older engine's viewer
  mounts, and mounts that one in a shadow root of the host holding its own stylesheet, written there
  by its own `injectCss`. Without it a season-1 match page draws its rail's tiles, or its stage, with
  the other engine's rules.
- `cartridges.json` lists the games and the repository each releases from. A Dockerfile cannot
  loop, so a second game is an entry there and its stages in the Dockerfile.
- `components/Replay.tsx` loads the match's viewer and calls `mount()`; `BoardPreview` loads the
  current one's `mountMap()` for a board on its own. Both use the framework-free entry, because the
  bundle's React wrapper imports the bare specifier `react`, which cannot resolve from `public/`.
  **Keep the `/cartridges/` prefix inside the import's template literal**: Vite's dev server tags a
  bare-variable specifier with `?import`, and `public/` answers that with a 500.
- **A card is the current viewer.** Its Tile and Thumb draw a stored frame or a board, data the
  viewer draws without the component; its hover plays the replay only when the current engine played
  the match (`onCurrentEngine`), and otherwise rests on the frame. The graph and the seat colours come
  from the module that mounted the match.
- **`mount()` takes a `tier`**, and the tier is the viewer's, not a size this application styles:
  `stage` (the default: the match page), `player`, `tile` and `thumb`. **A card mounts the Tile**
  from the last frame `GET /v1/matches/{id}/frame` serves (`frame`, with `labels` from its `seats`),
  so a list decodes no replay at rest; a hover hands `preview()` the replay and leaving it calls
  `stop()`. A frame alone is `drawFrame()` (the Thumb), and the graph is `mountGraph()` beside a
  mounted viewer, never a chart drawn here.
- **A Tile lives while its card is near the window.** `useNear` (`components/Viewer.tsx`) mounts a
  Tile or Thumb once its card comes within 300px of the viewport and destroys it once it is 1500px
  out: two thresholds, so a card at the edge does not flap. A long grid holds only the boards
  around the reader, and a card that comes back redraws from the frame `lib/viz.ts` still holds.
- **No rule of any game lives here.** The viewer re-simulates through the component that recorded
  the match, so it and the referee cannot disagree. Ladders, outcomes and limits are the API's.
- **Nothing here styles the viewer.** No class in this application may start `tb-` (the viewer
  owns every `tb-` name in the stylesheet it injects), and no rule here reaches into it. The shell
  uses `site-`. If the viewer needs telling something, it is an option on `mount()`, not a selector.

### Posts, stories and comments

- **Two kinds of writing, one list.** `/blog` is the team's posts and the model stories an admin
  featured, newest first, the kind in the query string (`?kind=team|model`). A post opens at
  `/blog/:slug`; **a model story opens on its model page, where it lives**, so the list is a door to
  it and never a copy. Twenty a page on Soma's cursor, and a new kind starts over.
- **`components/Prose.tsx` draws text a person wrote, as elements and never as HTML.** A small
  closed markdown — headings, paragraphs, lists, quotes, fenced code, tables, and inside a line
  `**bold**`, `*italic*`, `` `code` `` and `[words](link)` — and anything else is text as typed. A
  link is followed only for an app path (`/…`), `https://` or `mailto:`, so `javascript:` never
  reaches an href. **A line that is a match's address alone is an embed**: the host draws it (a post
  draws a paused `player`, never autoplay) and without a host it stays a link.
- **A new post becomes a draft on its first save**, and its address moves to its id, which never
  changes however often the slug does. Publish saves the fields and publishes in one write; Unpublish
  only unpublishes, so unsaved edits stay in the form rather than going quietly live or quietly lost.
- **A model's story edit is held for review.** `/admin/stories` shows the held edit beside the
  approved text the public still reads — Soma's desk list carries the held edit whole and only the
  approved text's opening, so the approved text is read from the model's public story route.
- **A comment stores what was typed.** `#126` is drawn as a link that moves the player to that turn,
  on the watch page alone and only up to the match's last turn, and is never saved, so the comment
  reads the same in the bell or a paste; a URL is text. The public thread is cached with no caller in
  its key, so the author's own held comments come from `/v1/me/comments` and are placed in, marked as
  waiting for review. Posts have no comments: comments are a match's and a model's.

### Layout and CSS

- **The bar is one 78px row, `--site-bar-h`, and the only thing that sticks.** It holds the guide's
  toggle, the logo, the scope switcher, Submit, the bell and the avatar (Sign in for a visitor).
  The guide, the toasts, the bell's spanning panel and every sticky filter row place themselves
  from that variable. The announcements sit under it and scroll with the page.
- **The announcement stack is one line per live announcement**, newest at the top, its kind picking
  the colour and icon from a closed four; a dismissable one has a close the browser remembers, a
  sticky one stays until an admin disables it. It is part of the shell, so it mounts once for the
  tab; `lib/announcements.ts` still reads the list once and keeps it a minute, which is what a
  reload and a second tab go through, and an admin who publishes or disables one calls
  `forgetAnnouncements()`. A round's countdown is Soma's own line, its `at` drawn live after the
  body.
- **The season's name is what gives way.** The scope's track is `minmax(0, max-content)`, so a tight
  row or a long season name ellipsises the name. Below 760px the scope leaves the bar for the
  drawer's top; below 640px Submit folds away and the You tab carries it.
- **The guide is 240px from 1280px up and a 72px icon rail below**, until the reader presses the
  toggle; from then on their choice wins (`tb.guide` in localStorage). The watch page takes the rail
  whatever was chosen (`lib/layout.ts`). Below 1000px the guide is the drawer; below 760px the tab bar
  (Home, Matches, Leaderboard, You) is fixed at the foot and `.site-main` pads for it.
- **Browse pages run fluid to `--content-max` (1800px).** The Learn pages (Get started, the FAQ,
  the changelog, credits) share one 1320px column (`--learn-max`), with room for an "On this page"
  column beside the text, and a post keeps a 72ch measure. **Which measure is the ROUTE's, not a
  prop on the page**: `lib/layout.ts` reads it off the address, so a loading branch, a not-found
  branch and a lazy chunk's placeholder are all drawn at the width the page itself will be. A
  pattern there is `App.tsx`'s own spelling of that route; renaming one is a rename in both.
- **A `.stack`'s track is `minmax(0, 1fr)`, never `auto`**, and so is any grid holding a scrolling
  table or a file input: an `auto` track grows to its widest child's max-content and scrolls the
  page sideways on a phone.
- **Stacked blocks sit in a `.stack`, and nothing carries its own bottom margin.** The gap is the
  stack's; a block that renders nothing adds none. A new `margin-bottom` on a card is a bug.
- **`PageHeader` is a `.wrap`; never nest it in another.** Draw the header, then the body in its own
  `div.wrap.page-body`. A width limit goes on a child of that `.wrap`, not the `.wrap`.
- **A placeholder is the shape of what replaces it**: the same table and columns, the same rows,
  the replay frame at its final height, the home page's top panel one height across its states.
  `components/ui/Skeleton.tsx` is the kit — `Skeleton`, `SkeletonText`, `SkeletonPageHeader`,
  `PagePlaceholder` for a whole page and `Loading` for a block inside one that is already drawn, and
  `Skel` for a placeholder inline in a line. A whole page waiting draws `PagePlaceholder`, never a
  box of grey lines in the middle of an empty page.
- **The watch page's board is sized to the viewport** (`sizeFor()` in `pages/Match.tsx`): the seat
  bar, the board and the transport fit under the site bar and the announcements, the board between
  300px and 1200px tall on a desktop and `clamp(160px, 32svh, 360px)` on a phone. The bars' height
  is estimated once, when the match opens, from the seat count and the width by the viewer's own
  seat-card rule (`seatColumns`), and never re-read: a new height remounts the viewer and loses the
  reader's turn.
- **A match has two layouts, the card and the row.** `components/MatchCard.tsx` is the card: the
  viewer's Tile over the title, owners, board and time, used by every grid, the watch page's rail
  (`layout="row"`) and a ladder row opened inline. **Every match row has one layout**:
  `components/MatchRow.tsx`, the list view and dense tables, draws 2 to 8 players the same way: a row-header column (time, state, player count, map), then up to four
  players in finishing order (place, score, model, owner), then "+N more". A two-player match fills
  two of the four columns. No per-seat-count variant, no end-reason sentence, no turn, no ladder tag.
  A narrow list puts the row header on top and shows two players.
- **A map decides how many play**, 2 to 8. Seats are numbered from 0 in the API and drawn from
  "seat 1". The watch page's result is a strip in finishing order ("=1st" when shared, DQ last),
  with the rating change on each ladder the match counted on; two players draw as one scoreline.
- **A row's primary number is its largest type**: on `/leaderboard` the record's `primary` column
  (`.lead`; the rating in format 1), the score in a match row, one size whatever the seat count.
- **`/leaderboard`'s table is drawn from the record's `columns`**, because a closed season is served
  from a record frozen in its own format. A column's `type` picks its cell (`KINDS` in
  `pages/Leaderboard.tsx`); a type it does not know is its value as text under its key, never dropped;
  the rank, the model and the primary column are the cells a phone keeps. Format 1 draws some fields
  inside another's cell (`INSIDE`: the version, owner and baseline in the model cell, `provisional`
  on the rating, `round_matches` in the matches) and must keep drawing the pinned markup. A body with
  no `columns` is format 1. The charts, the plot and Movers read the rating series and are not
  column-driven.
- **The weight classes are the season's.** Caps come from `class_max_bytes` on a version and
  `weight_classes` on a season, through `useWeightClasses()`; never a table here. The class icon is a
  meter of the season's classes (`classStep()` in `lib/weight-classes.ts`), so its bar count is the
  season's too. A class's memory is two more numbers on the same entry, read through `memoryOf()`
  (absent is 0), and the season forms send the whole table back with only those two changed.
- **A season's ladders are Open and one per weight class.** `components/LadderTabs.tsx` draws them,
  as tabs with each ladder's size or as a segment (`look="seg"`) where the ladder is one filter
  among several, and `ladderEmpty()` in `components/LadderTable.tsx` is what an empty one says on
  every page that has one. `lib/useLadderHeads.ts` reads every head — the size and the first row —
  under one key, because the tabs print the sizes and `/leaderboard`'s podium crowns each ladder:
  one read, two consumers.
- **A game introduces itself.** Provenance copy and limits (`limits.boards` among them) come from
  the cartridge manifest, as plain text, never inserted as markup.
- **`/season-admin` is a season's own desk**, for its admins (`admin_of` on `/v1/me`) and platform
  admins: the same strip, with tabs choosing which pair of lists sits under it (people, boards and
  baselines, runners, notify and log). The boards and baselines panels and the strip's sheets are
  `components/SeasonPanels.tsx`, which `/admin/seasons` draws too.
- **`/admin/seasons` is a fixed-height desk** for one season (the switcher picks it): a strip (state,
  window, Move dates, Close season) over its maps and baselines side by side, each list scrolling
  under pinned heads with its upload at the panel's foot. Lists re-read without blanking (`useKept`);
  the baselines list polls while an upload is being admitted. Below 1100px the panels stack. Creating
  a season is its own page, `/admin/seasons/new`, and so is running its fairness controls,
  `/admin/seasons/rounds` (the strip's Rounds and finals): the finals on the left, the score resets
  over the idle fill on the right, re-read every ten seconds while a round waits or the finals run.
- **An admin desk keeps its state in the address** — the list shown, the filter, the row picked
  (`?list=`, `?show=`, `?model=`, `?admin=`, `?action=`, `?q=`) — so a desk can be sent to another
  admin as a link. Lists re-read through `useKept`, which holds the rows while it asks again. **A
  write answers the whole list, and that answer replaces what is drawn**; a 409 naming the
  precondition (`story_state` on a story, `order_incomplete` on the picks) means another admin got
  there first, so re-read rather than retry. Only the actions whose precondition holds are drawn.
- **`/admin/audit` is read-only**: every admin action, newest first, on Soma's own filters, and each
  undo is a line of its own — so a row links to where its thing lives and to the acting admin's
  desk, and an action the page has no words for draws as its code rather than vanishing.
  `/admin/users/:handle` is one account's desk, opened from the Users list and from any comment on
  the comments desk; the commenting switch takes a term and a reason, and the reason is required
  because the user reads it in the composer's place.

### Words

- **Every word the site shows lives in `copy/*.json`**, never in a `.tsx`: text, headings, buttons,
  tab titles, breadcrumbs, `aria-label`, `title`, `placeholder`, empty states, refusals as
  sentences, table heads, option labels. `copy/common.json` holds what the shell, `components/`,
  `lib/format.ts` and `api/client.ts` draw; each page has its own file (`copy/<page>.json`, the
  admin pages `admin-*.json`), even for words another file also has. A page imports its file as
  `T` and `common` beside it; lazy pages carry their words in their own chunk.
- **Keys are nested camelCase, in page order; values are whole display strings.** One full string
  per variant beats fragments joined in code. A value may carry `{placeholders}` (filled with
  values the page formats: `date`, `num`, `bytes`) and light markup: `*italic*` (`<i>`),
  `**bold**`, `` `code` ``, `[words](target)`. Singular and plural are `{ "one", "other" }`. A table
  of API codes to sentences is an object keyed by the code.
- `fill()` in `lib/copy.ts` fills a string for an attribute or a string prop; `count()` picks a
  plural form; `<Rich>` (components/ui) draws markup, and a `{placeholder}` whose value is an
  element (a badge, a built link, a styled span). Markup becomes elements, never HTML. Lists of
  content (the FAQ, /start's steps, credits, the footer's columns) are arrays in the JSON, so adding
  one is a JSON edit.
- **`react/jsx-no-literals` fails the lint on words typed into JSX** and in the attributes and
  props `.oxlintrc.json` names. Typography is allowed (`@` `v` `·` `→` `#` and the like). The rule
  cannot see a string in plain TypeScript — a constant, a column `head:`, a ternary — so review
  those. A misspelt key fails `tsc -b`.
- Not in `copy/`: the link-preview title and description in `index.html`, which `nginx.conf`'s
  `sub_filter` lines match byte for byte (change them together); `scripts/og-image.html`; and text
  the API or the cartridge sends (notification subjects, reject reasons, the game's `about`).

### Accessibility and the document title

- **Every page names itself.** `Shell` takes `title`, the page's own part of the document title, and
  appends the game and season when the page is `scoped`. Error and loading branches pass a `title`
  too (`Permalink`, `/profile`, `/me`, `/admin/seasons`, the sign-in callback): those are the paths
  that quietly reintroduce a tab reading the bare site name.
- **Unfurls come from `index.html` plus nginx.** Crawlers do not run the app; `nginx.conf` rewrites
  the title, the description and the canonical per request from `map`s over the path, using the
  site's own words, never the API's. The `sub_filter` lines match the tags' exact static text, so
  `index.html`'s title, description, canonical and Open Graph tags change together with them.
  `public/og.png` is rendered from `scripts/og-image.html` and committed.
- **The skip link is first in the tab order, and `<main>` takes `tabIndex={-1}`**, or the focus is
  left behind in the bar. `.skip` is moved off-screen, never `display: none`.
- **Never colour alone.** A label in a row is an icon told apart by its shape, carrying its word as
  its accessible name and tooltip (`Icon`'s `label`, `ClassIcon`'s name). Badges and notices say
  their state in words.
- **The size/rating plot never relies on colour.** `SizeRatingPlot` carries a dot's class by its
  labelled band and the name beside it, and draws a name only where it covers none already placed.
  Its root is a `<figure>` with a `.vis-hidden` caption, and its `<svg>` carries no `role="img"`,
  which would hide every focusable mark from a screen reader.

### What a crawler gets

Every route is one file with an empty `<body>`, so a search engine is told which address is which
by `nginx.conf` alone. Four things there move together, and three of them track `App.tsx`.

- **A page's canonical is its path, and a query string is never part of it.** `$canonical_path`
  strips the query, because a query here is selection — game, season, ladder, view, an admin desk's
  open row — and never a different page. Its character class is a guard, not decoration:
  `$request_uri` is the client's bytes and the value lands in an attribute inside the page.
  `index.html` carries `href="#"` as the placeholder; `/` fails the Vite build (a `<link href>` is
  resolved as an asset) and would claim every page is the home page if a rewrite were ever missed.
- **An address the application does not route answers 404**, through `location @spa`, which serves
  the same bundle and lets the app draw its own not-found page. `$spa_unknown` is `App.tsx`'s route
  table BY FIRST SEGMENT — a new page under `/admin` or `/models` needs nothing, a new top-level
  section needs a line, and forgetting one is a page that reads perfectly and 404s to a crawler.
- **A chapter of the book answers at two addresses and declares one.** `try_files $uri.html` is what
  resolves the app's extensionless Docs links, so `/docs/models/format` and `…/format.html` are the
  same bytes; `$docs_canonical` picks the `.html` form (`/docs/` for the root). The placeholder is in
  `docs/theme/index.hbs`, marked `TINYBRAINS`, and skipped on the print page, which is already
  `noindex` — it is the whole book at one address.
- **`/sitemap.xml` is generated, by `scripts/sitemap.mjs` and nothing else.** It holds the public
  route list and walks the rendered book for the rest. `vite build` writes the application's half
  (`docs/` is out of the image's node context on purpose); the `Dockerfile` runs the same generator
  again after `COPY --from=book`, so the shipped file has both. It carries no `lastmod`: the image
  builds with no `.git`, and a date that is really the build's is one Google learns to ignore.
  A new public route is a line there AND, if it is a new first segment, in `$spa_unknown`.

Adding a page and stopping at `App.tsx` is the failure mode to watch for: it will render, and it
will be a 404 with no unfurl and no place in the sitemap.

## Styling rules

`public/design-system/tokens.css` is the source of truth and the one stylesheet `index.html` loads
directly. `data-theme` on `<html>` selects a palette, and `lib/theme.ts` sets it before first paint:
the stored choice, else `prefers-color-scheme`, which it follows until a choice is made. Dark is the
tokens' default and so the no-JavaScript fallback. **The stylesheet carries no
`prefers-color-scheme` block**: one mechanism decides the palette.

Every colour is a role, never a literal: `bg`/`surface`/`surface-raised`, `ink`/`muted`,
`accent`/`accent-ink` (they travel together), `success`/`warning`/`danger`, and `line` for
decorative boundaries (an input's boundary uses `muted`, to stay visible). The logo's region tokens
(`frontal`, `parietal`, `occipital`, `temporal`, `cerebellum`, `stem`) are the weight-class hues,
mapped at the top of `base.css`, and are not for ordinary text.

Sans for reading and navigation, mono for code, identifiers, scores and replay metadata. Spacing is
a 4px base; radii are 6/10/18px for small elements, controls and feature cards. Focus is a 2px
accent ring with an offset, and a disabled control carries the `disabled` attribute.

**The leaderboard is a podium (`i-leaderboard`) and a match is crossed swords (`i-matches`)**
wherever the site names either: nav, menus, titles, crumbs, headings, "see all" links, stats, table
columns, error pages. `PageHeader`, `Section` (and its `more`), `PanelHead`, a `Crumb` and a `Stat`
take an `icon`; `IconLabel` puts one before any other word. Neither icon means anything else. Prose
that mentions a leaderboard stays prose.

What a column or a filter means links to the book's chapter; it is not a caption under the column.

Four stylesheets, by reach: `src/styles/base.css` (element defaults, layout primitives, buttons,
inputs), `shell.css` (the header, its popovers, the footer, the toasts; every class `site-`),
`components.css` (anything two pages draw) and `pages.css` (what exactly one route draws). A rule a
second route needs moves up. Prefer a named class over an inline `style` object.

**A bordered box is a `Panel`**; stats, prose and forms sit on the page. **A state word is a
`Badge`**, through one table per kind of thing in `components/Model.tsx` (`VersionBadge`,
`SeasonBadge`, `MatchBadge`); no page picks a tone. **A notice is a `Notice`**, told apart by its
icon's shape. A 404, a sign-in wall, an admin wall and a failed sign-in are all `Message`
(`components/ErrorStates.tsx`), and a signed-in page's wall is `AuthGate`.

**No native `<select>`**: its open list is the operating system's menu, whatever the theme. Use
`Select` and `LabelledSelect` in `components/ui/Form.tsx`; text, number and date fields and
textareas take `.input`.

## Where new code goes

`src/lib/` is pure helpers only; anything holding React context belongs in `src/providers/`. A
component drawn on one page stays in that page; one drawn on three or more moves to
`src/components/`, and if it carries no domain meaning, to `components/ui/` (exported through its
barrel, so call sites import from `../components/ui`).

A new page gets its words in a new `copy/<page>.json`, picks a layout that already exists
(overview, list, entity, workspace, form, settings, editorial, admin, or message) and draws it from
the `components/ui` kit: `PageHeader` with its breadcrumbs, `Section`, `Panel`, `StatGrid`,
`KeyValueList`, `DataTable`, `Tabs`, `Segmented`, `Select`, `Pagination`, `Notice`, `Badge`,
`StepTracker`, `Switch`, `CopyField`, `ConfirmAction`, `Rich`.

**Every module opens with a comment saying what it is for and the rule the code cannot state** —
the constraint, the precondition, the thing that breaks when it is changed — with that rule in caps.
It is how a page explains itself to the next reader; keep it current when you edit the file.

A new admin page is a route in `App.tsx` and a tab in `components/AdminTabs.tsx` (ten in one row
that scrolls sideways); the guide's Admin desk line and the account menu land on the first. Soma's
403 is what protects it; the links are a courtesy.

A change a competitor can see gets an entry in `copy/changelog.json`'s `entries` (drawn by
`/changelog`, built into `/feed.xml`).
