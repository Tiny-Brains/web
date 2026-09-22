# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`web/` is the TinyBrains browser application (React 19, TypeScript, Vite 8), the nginx image that
serves it, and the local platform's `docker-compose.yml`. `README.md` is the human guide: running
the stack, commands, configuration, releasing, layout and troubleshooting. `docs/` is the competitor
guide, an mdBook with its own [`docs/CLAUDE.md`](docs/CLAUDE.md): read that before changing anything
under it. The parent directory's `CLAUDE.md` covers the platform and the contracts that cross repos.

## Checks

```sh
npm run lint                  # oxlint; .oxlintrc.json adds no-shadow and react/jsx-no-comment-textnodes
npm run build                 # tsc -b (strict) && vite build
scripts/check/configs.sh      # cross-repo values; reads ../soma, ../kalam and the local images
(cd docs && mdbook build)     # after touching docs/
```

There is no test suite and no test runner to reach for. CI (`.github/workflows/check.yml`) runs
oxlint, `tsc -b`, `npx vite build` (not `npm run build`, whose `prebuild` fetches the viewer from
GitHub) and `nginx -t`. Verification beyond that is reading routes against a running stack, at
desktop width and at a real 390px through CDP device emulation: headless Chrome's window will not
go that narrow on its own. A multi-seat or otherwise unreachable state is proved by rewriting the
API response over CDP and reading the page.

Two things catch what no test does, and neither is validation:

- `components/ErrorBoundary.tsx` is two boundaries. `RouteErrorBoundary`, inside the providers,
  replaces the page and keeps the shell; `AppErrorBoundary`, outside them, assumes nothing (no
  `Shell`, no `<Link>`), because a provider or the router is what threw. Both are keyed by location.
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
  `providers/platform.tsx` resolves "no season parameter" to the live season, else the newest;
  `Shell.tsx` draws the switcher.
- On a list page (`/`, `/leaderboard`, `/matches`) a new selection keeps the page and its filters;
  on any other page it goes to that season's home, because a match, model or version belongs to one
  season. Such a page passes `season` to `Shell` so the switcher shows the season it belongs to.
- **A season is addressed by its slug** (`?season=<slug>`, every link and API call) and labelled by
  its name. Nothing shows the internal number.
- **A season's boards are its own**: they come from `GET /v1/games/{game}/seasons/{slug}/maps`,
  never from the cartridge, which ships only the basic boards.
- **What is personal lives under `/me`.** `/profile/:handle` is public-only and identical for its
  owner. `/me` (your models), `/me/notifications` and `/me/account` are the owner's routes. A
  private view is a route, never a flag on a public page.
- **Five ways around, each with one job**: the nav (sections), the scope switcher (game and
  season), breadcrumbs from every `PageHeader` (up a level; no hard-coded back links), the account
  menu (everything personal, and the only place admin pages are linked from), and the footer. Every
  popover opens and closes through `lib/usePopover.ts`: outside click, Escape returning focus, and
  navigation. Beside the nav, and not one of them, are the two ways off the site to a person:
  Discord and GitHub.
- **The community addresses live in `copy/common.json`'s `community`**, which the bar and
  `components/Help.tsx` read. The copies not on it are the footer's Project column (its own JSON
  array), the What's new entry, and the book: its bar (`docs/theme/index.hbs`), the Quickstart and
  Rejection reasons. A new invite is an edit to each (`grep -rn discord.gg`). The links open in a new
  tab, so the error being asked about stays on screen.
- **An error says where to ask.** A refusal, a failed upload, match or action, a rejected version,
  the API-down notice and every failure `Message` end with `AskForHelp`; a page that runs out of
  answers (`/start`, `/faq`) ends with `CommunityButtons`. A new error a competitor can be stuck on
  takes it too.
- `App.tsx` imports the browsing surface directly (home, the list pages, the permalinks) and
  `lazy()`s the rest; `vite.config.ts` splits React and the router into a `vendor` chunk.

### Data and the API client

- **Contexts hold what several pages need**: `providers/session*`, `providers/platform*` (games,
  selected game, seasons, resolved season) and `providers/notifications*`. Each is split into a
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
- **An unknown model or match id answers 200 with a null body.** `components/Permalink.tsx` is the
  one gate: error is `FetchFailed`, loading is a skeleton, **null data is `NotFound`**. Reading only
  the status leaves the page loading for ever.
- **Notifications are polled.** `providers/notifications.tsx` reads the newest on sign-in, then
  polls with `since=` every 30 s while the tab is visible. A new item goes into the bell, arrives as
  a toast (a polite live region that never takes focus), and, with permission and that kind's push
  setting on, as a system notification while the tab is in the background. What is in progress is
  not a notification: the bell pins `me.candidates` above the feed. `data` carries the chips
  (`components/Notifications.tsx` reads them by key) and `actor` the avatar; renaming a key in
  Soma's writer silently drops a chip.
- **An upload hashes the buffer it sends.** `lib/upload.ts` reads a file once, hashes that buffer
  with `crypto.subtle` and PUTs the same buffer. `crypto.subtle` exists only in a secure context
  (https, or localhost), so the form says so where it is missing.
- **The runners page keeps authorisation and liveness apart.** `live` means the runner, its key
  and the key's owner are in good standing; calling in means `last_seen_at` moved within a lease.
  Authorised and silent is quiet; quiet while holding matches is wedged. Never collapse them into
  one badge.

### Sign-in and the proxy

- **Sign-in is browser navigation, not fetch.** `startGitHubSignIn` sets `window.location.href`, so
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
- **The module list is a contract with ants.** The browser fetches exactly these files: `viz.js`,
  `shell.js`, `render.js`, `engine.js`, `map.js` (the map visual, loaded on first use) and the
  transpiled component's `.js` and `.core.wasm`. The `Dockerfile` and `vendor-viewers.sh` copy them
  by name, so a new static import in `viz.js` is a change to both lists.
- `cartridges.json` lists the games and the repository each releases from. A Dockerfile cannot
  loop, so a second game is an entry there and a pair of stages in the Dockerfile.
- **The release must be the one the ladder plays.** A viewer built against another engine does not
  fail: it draws a plausible match that never happened.
- `components/Replay.tsx` loads `/cartridges/<game>/viz.js` and calls `mount()` (or `mountMap()` for
  a board on its own). It uses the framework-free entry, because the bundle's React wrapper imports
  the bare specifier `react`, which cannot resolve from `public/`.
- **No rule of any game lives here.** The viewer re-simulates through the component that recorded
  the match, so it and the referee cannot disagree. Ladders, outcomes and limits are the API's.
- **Nothing here styles the viewer.** No class in this application may start `tb-` (the viewer
  owns every `tb-` name in the stylesheet it injects), and no rule here reaches into it. The shell
  uses `site-`. If the viewer needs telling something, it is an option on `mount()`, not a selector.

### Layout and CSS

- **The bar is one row, its height is `--site-bar-h`** (72px; 96px below 760px). Toasts and the
  spanning panels place themselves from that variable, so a change to the row is a change to it.
  Below 760px the pickers take a second row.
- **The season's name is what gives way.** The pickers' track is `minmax(0, max-content)` and the
  nav's `1fr` cannot shrink below the nav, so a tight row, or a long season name, ellipsises the
  name rather than sliding the nav over it. At 1120px and below, Discord and GitHub are icons (their
  words stay their names and tooltips) and the sign-in button drops "with GitHub"; below 1080px
  Submit keeps only its +. **The logo keeps its word at every width**: a phone's first row drops the
  rule and the sign-in button's GitHub mark to make room, and below 360px Discord and GitHub leave
  the bar for the Menu, which lists them with their words. Measure the row at 1440, 1120, 1081,
  1001, 761, 430, 390, 360 and 320px, signed in and out, after changing anything in it.
- **Below 1000px the nav is the Menu panel** (`PhoneMenu` in `Shell.tsx`), holding the nav and the
  same personal and admin links as the account menu. Submit folds away below 640px (`on-tablet`). A
  new control in the bar takes `on-wide` or `on-tablet`, and a row in `PhoneMenu` if a phone needs it.
- **A `.stack`'s track is `minmax(0, 1fr)`, never `auto`**, and so is any grid holding a scrolling
  table or a file input: an `auto` track grows to its widest child's max-content and scrolls the
  page sideways on a phone.
- **Stacked blocks sit in a `.stack`, and nothing carries its own bottom margin.** The gap is the
  stack's; a block that renders nothing adds none. A new `margin-bottom` on a card is a bug.
- **`PageHeader` is a `.wrap`; never nest it in another.** Draw the header, then the body in its own
  `div.wrap.page-body`. A width limit goes on a child of that `.wrap`, not the `.wrap`.
- **A placeholder is the shape of what replaces it**: the same table and columns, the same rows,
  the replay frame at its final height, the home page's top panel one height across its states.
- **A match is its scores, and every match row has one layout.** `components/MatchRow.tsx` draws 2
  to 8 players the same way: a row-header column (time, state, player count, map), then up to four
  players in finishing order (place, score, model, owner), then "+N more". A two-player match fills
  two of the four columns. No per-seat-count variant, no end-reason sentence, no turn, no ladder tag.
  A narrow list puts the row header on top and shows two players.
- **A map decides how many play**, 2 to 8. Seats are numbered from 0 in the API and drawn from
  "seat 1". The match page's result is a places table for any count ("=1st" when shared, DQ last),
  with one rating-change column per ladder the match counted on.
- **A row's primary number is its largest type**: the rating on `/leaderboard` (`.lead`), the score
  in a match row, one size whatever the seat count.
- **The weight classes are the season's.** Caps come from `class_max_bytes` on a version and
  `weight_classes` on a season, through `useWeightClasses()`; never a table here. The class icon is a
  meter of the season's classes (`classStep()` in `lib/weight-classes.ts`), so its bar count is the
  season's too.
- **A game introduces itself.** Provenance copy and limits (`limits.boards` among them) come from
  the cartridge manifest, as plain text, never inserted as markup.
- **`/admin/seasons` is a fixed-height desk** for one season (the switcher picks it): a strip (state,
  window, Move dates, Close season) over its maps and baselines side by side, each list scrolling
  under pinned heads with its upload at the panel's foot. Lists re-read without blanking (`useKept`);
  the baselines list polls while an upload is being admitted. Below 1100px the panels stack. Creating
  a season is its own page, `/admin/seasons/new`.

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
  the title and description per request from two `map`s over the path, using the site's own words,
  never the API's. The `sub_filter` lines match the tags' exact static text, so `index.html`'s
  title, description and Open Graph tags change together with them. `public/og.png` is rendered from
  `scripts/og-image.html` and committed.
- **The skip link is first in the tab order, and `<main>` takes `tabIndex={-1}`**, or the focus is
  left behind in the bar. `.skip` is moved off-screen, never `display: none`.
- **Never colour alone.** A label in a row is an icon told apart by its shape, carrying its word as
  its accessible name and tooltip (`Icon`'s `label`, `ClassIcon`'s name). Badges and notices say
  their state in words.
- **The size/rating plot never relies on colour.** `SizeRatingPlot` carries a dot's class by its
  labelled band and the name beside it, and draws a name only where it covers none already placed.
  Its root is a `<figure>` with a `.vis-hidden` caption, and its `<svg>` carries no `role="img"`,
  which would hide every focusable mark from a screen reader.

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
accent ring with an offset, and a disabled control is actually `disabled`.

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

A new admin page is a route in `App.tsx`, a tab in `components/AdminTabs.tsx`, and a link in
`AdminLinks` in `components/Shell.tsx`. Soma's 403 is what protects it; the links are a courtesy.

A change a competitor can see gets an entry in `copy/changelog.json`'s `entries` (drawn by
`/changelog`, built into `/feed.xml`).
