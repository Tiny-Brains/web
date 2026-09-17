# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The parent directory's `CLAUDE.md` covers the TinyBrains platform — the seven repos, the Orion
packages, the shared Postgres schema. This file is only about `web/`, and does not repeat it.

## Commands

Run from this repository's root. Node 22.12+ on the Node 22 line.

```sh
npm ci                    # locked install
npm run dev               # Vite on 5173, strictPort — fails if the port is taken
npm run lint              # oxlint
npm run build             # tsc -b && vite build
npm run vendor:viewers    # re-copy each game's replay viewer out of its artifact image
npm run vendor:book       # take the rendered book out of its artifact image, into docs/book
```

`predev`/`prebuild` run `vendor:viewers` automatically. That used to be a trap — `public/cartridges/`
was committed, so a plain `npm run dev` silently rewrote checked-in files from whatever sibling
checkout happened to be there. It is now **gitignored and comes from a named image**, so the
automatic run writes only ignored files and is inert. `ANTS_REF` overrides which image; a deployment
should pin a published tag.

`docker compose` in `devops/` publishes the built image on the same port 5173. Stop that one
container before `npm run dev`; leave the backend services running.

**There is no test suite, and no test runner to reach for.** A pass is clean oxlint plus a
successful `tsc -b && vite build`, and `.github/workflows/check.yml` now runs exactly that on
every push, plus `nginx -t` over `nginx.conf` — so the gate is a gate and not a habit. It runs
`npx vite build` rather than `npm run build`, because `prebuild` wants a docker socket and the
cartridge's image, and the viewer is proven by the image build instead.

Verification is still reading routes against a running stack. The states the local database
cannot reach — a rejected version, a cancelled or failed match, a season that is not open, a
non-participant, duplicate weights — are the ones most likely to be wrong.

**Two things now catch what no test does.** `components/ErrorBoundary.tsx` is **two** boundaries:
`RouteErrorBoundary` inside the providers, which replaces the page and keeps the bar, the strip
and the footer, and `AppErrorBoundary` outside them, whose fallback assumes nothing — no `Shell`
and no `<Link>`, because a provider or the router is what threw. Both are keyed by location, so
a reader can navigate away from a broken page instead of being held on it. And
`api/shape.ts` checks three bodies against the fields the pages read, **in the dev loop only**,
so a drifted `json_build_object` is a console error naming the field. Neither is validation and
neither changes what a competitor's browser does: the shape check is compiled out of the bundle.

TypeScript runs `strict`; `.oxlintrc.json` additionally turns on `no-shadow` and
`react/jsx-no-comment-textnodes`.

## Architecture

### Game and season are selection, not routes

There is no `/games/ants/…` branch. The **scope switcher** in the header puts the choice of game
and season in the **query string**, and both parameters are omitted when they are the default (the
default game, its live season) so the ordinary address stays clean and every other state is still
linkable.

This spans four files: `App.tsx` declares every route flat; `lib/selection.ts` reads and writes
the query string and builds hrefs that **carry the selection across every link** (picking season 1
on the home page and clicking Leaderboard has to stay in season 1); `providers/platform.tsx`
resolves "no season parameter" into the live season, else the highest-numbered one; `Shell.tsx`
draws the switcher. On a list page (`/`, `/leaderboard`, `/matches`) a new choice keeps the page and
its filters; on any other page it goes to that season's home, because a match, a model or a version
belongs to one season — and such a page passes `season` to `Shell` so the switcher shows the
season the thing belongs to rather than the selection. A second game is a row in the switcher —
adding a route branch for one would undo the whole design.

### Five ways around, each with one job

The header's nav gets you to a section (Leaderboard, Matches, and Get started ↗, which is the
book), each an icon over its word. The scope switcher — a game picker and a season picker joined
into one control beside the brand, the season's state in the same line — sets the game and season. **Breadcrumbs**, drawn by every page's `PageHeader`, take you up
a level — there are no hard-coded "← back" links, and a trail is built from the thing the page is
about: a match sits under its season, a model and a version under their owner. The **account
menu** holds everything personal (Your models, Notifications, Submit, Public profile, Account) and
is **the one place admin pages are linked from**, under an Admin group an administrator sees. The
footer holds the rest. Every popover — switcher, account menu, bell, phone menu — opens and closes
through `lib/usePopover.ts`: outside click, Escape returning focus to its button, and navigation.

### What is personal lives under /me

`/profile/:handle` is **public-only and identical for its owner**. What only the owner sees has its
own route: `/me` (Your models: what is in progress, every model, your own matches including trials),
`/me/notifications`, and `/me/account` (display name, notification settings, sessions, sign-out).
A private view is a route, never a flag on a public page — the same rule Soma keeps for its API.

### Two layers of data fetching, deliberately

- **Contexts above every page** hold what several pages need: `providers/session*` (who you are),
  `providers/platform*` (game list, selected game, seasons, resolved season) and
  `providers/notifications*` (the bell's newest items, the unread count, and what arrived while a
  page was open). Fetching these
  per page would make the strip flicker on navigation and let two components on one page disagree
  about which season is live. Each is split into a `-context.ts` and a `.tsx` provider so consumers
  import no component and fast refresh keeps working.
- **`lib/useApi.ts` per page** for everything else: a request, three states, a way to ask again. It
  is *not* a cache. Its `key` string is the only thing that decides when to re-fetch; the callback
  is deliberately **not** a dependency (pages build it inline, so depending on it would re-fetch
  forever) and is read through a ref written from an effect. Its third argument, `enabled`, is how
  a page declines to make a request it will not draw — the home page reads a class ladder only
  when the card is on one, and `Champions` reads nothing for a season with no classes. **`reload`
  is `useCallback`-stable**, because `providers/platform.tsx` lists it in a dependency array and a
  fresh closure there made the memo recompute on every render.

### The API client

`src/api/client.ts` is the calls, `src/api/types.ts` the response shapes. **The types are
assertions, not validation** — they were read off the `json_build_object` in each Soma workflow's
one query, and TypeScript cannot notice when one changes. `soma/workflows/soma-*.json` is the
authority; compare it when editing.

`src/api/shape.ts` is the tripwire that follows from that, and it is **not** a step towards
validation. Three bodies everything else is built on — `Me`, a season, a ladder row — are checked
against the fields the pages actually read, guarded by `import.meta.env.DEV`, and a drift is a
console error naming the route and the field. A shape lists only fields whose absence breaks a
page; it is not a mirror of the type, and keeping it from becoming one is the point.

Two API behaviours the client and pages must keep handling:

- **A refusal is a string, not a code object.** Orion's own failures are `{error: {code, message}}`;
  Soma's deliberate refusals are `{error: "not_a_participant", detail: {…}}`. `ApiError` reads both,
  because flattening the second is how a page loses the ability to say which of three refusals it
  hit. Every refusal is rendered as a sentence naming what happened and what would change it.
- **An unknown model or match id answers 200 with a null body.** `soma-models-get` and
  `soma-matches-get` have no `unknown` task, unlike `soma-profile-get`. `components/Permalink.tsx`
  is the one gate for this: error → `FetchFailed`, loading → skeleton, **null data → `NotFound`**.
  Reading only the status leaves the page loading for ever.

### Notifications are polled, and every event lands in one place

Soma records a notification where it makes the decision — admission, a trial, a rated match, a new
sign-in, a season closing — and `GET /v1/me/notifications` serves them. `providers/notifications.tsx`
reads the newest few on sign-in, then polls with `since=` every 30 seconds while the tab is visible.
Anything a later poll finds is new: it goes into the bell, arrives as a toast (`Toasts` in
`Shell.tsx`, a polite live region that never takes focus), and — when the browser has granted
permission on `/me/account` and that kind's push setting is on — as a system notification while the
tab is in the background. **Nothing reaches a closed browser**: that needs Web Push (a service
worker, VAPID keys, a stored subscription) and a sender Soma does not have. What is *in progress* is
not a notification: the bell pins `me.candidates` above the feed. A notification's `data` carries
structured extras (place, score, rating change, rank, class, size) that `components/Notifications.tsx`
draws as chips, and `actor` a handle drawn as an avatar; a kind is told apart by its icon's shape.

### Sign-in is browser navigation, not fetch

The session cookie is HttpOnly, so "are we signed in?" is answered by calling `/v1/me` and reading
200 against 401 — a 401 is the ordinary answer for a visitor, not an error. `startGitHubSignIn`
sets `window.location.href` rather than fetching, so the OAuth redirect reaches the browser and its
cookie jar.

**The `/v1` proxy is what makes the whole flow work.** Soma sets `soma_session` with no Domain
attribute, so the cookie belongs to whichever host the browser thinks answered; proxying `/v1`
means the browser only ever sees one origin, no CORS, and one host that GitHub's registered
callback and the cookie can agree on. `vite.config.ts` and `nginx.conf` are two implementations of
one contract — **change them together**, and check redirect and `Set-Cookie` behaviour when either
moves. `nginx.conf` additionally turns Soma's fixed 401 at the callback path into
`/signin/callback?error=incomplete`, which is why that page leads with the missing state cookie.

Secrets never enter the bundle; there is no runtime environment-variable interface. Credential
handling belongs on Soma.

### Routes are flat, and the long ones are split

`App.tsx` imports the browsing surface directly — the home page, the two selector pages and the
four permalinks — and `lazy()`s the rest. A reader lands on one of the first set and moves
between them, so a suspense fallback there would be a flash bought with nothing; the second set
is reached once or never (the editorial pages, the submit form, the status page, the sign-in
callback, the two admin pages) and is most of the words in this repository. `vite.config.ts`
additionally splits React and the router into a `vendor` chunk, so rewording a paragraph does not
invalidate the framework for a returning reader.

### The book is in this repository, and it is not the SPA

`/docs` is the competitor guide: `docs/`, an mdBook, with its own `CLAUDE.md` and `README.md` —
**read those before changing anything under it**. It was `Tiny-Brains/docs` until 16 September 2026;
it is here because the book is served at `tinybrains.dev/docs` and nowhere else, so the thing that
serves it and the thing that writes it now ship together.

**One repository, two artifacts, and that boundary is deliberate.** The book's build wants mdBook,
python3 and the `tinybrains` binary out of devops' CLI image; `docs/Dockerfile` does it and
publishes the rendered book as `DOCS_REF`, and this repository's `Dockerfile` copies it in with
`COPY --from=book` the same way it takes the viewer from `ANTS_REF`. Inlining those stages would
make `docker compose build web` a Rust compile. `.dockerignore` excludes `docs/` for that reason.

Two servers answer `/docs` and they must agree: `nginx.conf`'s `location /docs/` serves what the
image baked in, and the `book()` plugin in `vite.config.ts` serves `docs/book` for the dev loop,
with the same `$uri.html`-first rule. **There is no SPA route for it and there must not be one** —
the request must never reach the router, which is why every Docs link is a plain `<a>`. `pages/Docs.tsx`
and `lib/book.ts` are gone: they existed for a deployment that had no book mounted, and there is
no such deployment now.

**`npm run dev` is also the book's true preview.** `docs/book.toml` sets `site-url = "/docs/"` and
the theme links this application's `/design-system/tokens.css`, both of which assume this origin —
so `mdbook serve` shows the chapters in mdBook's own palette and the dev server shows them the way
a reader gets them, at `localhost:5173/docs/`.

**`docs/book` is what the dev server serves, and a fresh checkout has none.** `mdbook build` cannot
make one either: `create-missing = false`, and `src/viz/` and `src/tutorials/` are generated,
gitignored, and come from the ants and CLI artifact images. So `scripts/vendor-book.sh` takes the
rendered book out of `DOCS_REF` — the same trick `vendor-viewers.sh` plays for the viewer — and
`predev` runs it. **It only writes when `docs/book` is absent**, so an author who has just run the
real build keeps it; `npm run vendor:book -- --force` replaces it. Without a book the `/docs` request
falls through to the SPA, and since there is no route for it any more, that is the not-found page.

### The replay viewer is the cartridge's

The viewer is a build artifact of the cartridge, and it comes from **the cartridge's own artifact
image** — never a checkout, and never committed here. Two paths, one source:

- the image build has `COPY --from=ants` against a named build context (`ARG ANTS_REF`), which is
  how it reaches outside a build context that is `web/` alone;
- `scripts/vendor-viewers.sh` extracts the same files from the same image for the local Vite loop.

Either way it is the six files the browser actually fetches: `viz.js` and its closed module graph
down to the transpiled component and its `.wasm`. `cartridges.json` lists the games and their
images — **this repository no longer reads `devops/games/registry.toml`**, so devops is not part of
this build. A Dockerfile cannot loop, so a second game is an entry there *and* a `FROM` line in the
Dockerfile.

**`ANTS_REF` must be the one the ladder plays.** Compose passes the same variable to kalam's package,
the loader and this image for exactly that reason: a viewer built against a different engine does
not fail, it draws a plausible match that never happened.

`components/Replay.tsx` loads `/cartridges/<game>/viz.js` and calls `mount()`. It uses the
framework-free entry, not the bundle's React wrapper, which imports the bare specifier `react` and
cannot resolve when served from `public/`. **There is no rule of any game in this repository and
there must never be one** — the viewer re-simulates through the same component digest that recorded
the match, so it and the referee cannot disagree.

### Constraints that are easy to break

- **No class in this application may start `tb-`, and no rule here may reach into the viewer.** The
  viewer injects one global stylesheet when it mounts and owns every `tb-` name in it. The shell
  uses `site-`. The note above `.site-bar` in `layout.css` records what the collision looked like;
  the one above `.replay` records why nothing here styles the viewer. If the viewer needs telling
  something, the answer is an option on `mount()`, not a selector.
- **A page that failed still names itself.** `Permalink`'s error and loading branches, and the
  same branches on `/profile`, `/models`, `/admin/seasons` and the sign-in callback, all pass a
  `title` — a 404 whose tab reads the bare site name is the bug `title` exists to stop, and it is
  the error paths that quietly reintroduce it.
- **The skip link is the first thing in the tab order, and `<main>` takes `tabIndex={-1}`.**
  Without the second the jump scrolls and leaves the focus behind in the bar. `.skip` is moved
  off-screen and never `display: none`, because a hidden element is not in the tab order at all.
- **Every page names itself.** `Shell` takes `title`, the page's own part of the document title,
  and appends the game and season when a strip is drawn, then the site. A page rendered without
  one reads as the bare site name in the tab, which is what every tab used to read. What a
  pasted link unfurls to comes from `index.html`, because crawlers do not run the app — and
  `nginx.conf` rewrites its title and description per request from two `map`s over the path, so
  a profile, a model, a version or a match unfurls by name. The words there are the site's own,
  never the API's, and the three `sub_filter` lines match the tags' exact static text: change
  `index.html`'s title, description or Open Graph tags and those lines together. The card is
  `public/og.png`, rendered from `scripts/og-image.html` and committed, and nginx makes its URL
  absolute per request, as it does the feed's links. Do not put a host into the bundle for any
  of it.
- **The bar is one row, and its height is `--site-bar-h`** (72px; 96px below 760px). The brand,
  then the game and season pickers beside it; then the nav, an icon over each word, underlined on
  the bar's edge for the current section; then Submit, the bell and the avatar (or Sign in). Between
  761 and 1120px the season reads "S1" (`site-long`), and below 760px the pickers take a second row
  under the brand. The days left are in the season picker's panel and its tooltip, not the bar. The
  toasts and the spanning panels place themselves from that height, so a change to the row is a
  change to the variable.
- **Below 1000px the nav is the Menu panel.** The bar keeps the brand, the scope switcher, the
  bell, the avatar and a Menu button (an icon alone); `PhoneMenu` in `Shell.tsx` holds
  the nav links and then the same personal and admin links the account menu does. Submit folds away
  below 640px (`on-tablet`), and the bell's and the menu's panels span the screen under the bar. A
  new control in the bar takes `on-wide` or `on-tablet` so the phone bar does not overflow, and gets
  a row in `PhoneMenu` if a phone needs it. Read every page at a real 390px through CDP device
  emulation before calling a layout done: headless Chrome's window will not go that narrow on its
  own.
- **A `.stack`'s track is `minmax(0, 1fr)`, never `auto`.** An auto track grows to its widest
  child's max-content, and a scrolling table's is the whole table: the leaderboard's section
  became 936px wide on a phone and the browser zoomed the page out to fit it.
- **Stacked blocks sit in a `.stack`, and nothing carries its own bottom margin.** The gap between
  blocks that follow one another in a section is `.stack`'s 20px, the same 20px `.arena`,
  `.split` and `.two` put between columns. A strip, a plot and a ladder; a note, a
  facts row and a split; the account cards — each is a child of one `.stack`. A block that
  renders nothing adds no gap, so a conditional note can sit in the stack. The plot card on
  `/leaderboard` once sat flush on the ladder because it carried no margin and the stack was not
  there to give it one; a new margin-bottom on a card is that bug coming back.
- **`PageHeader` is a `.wrap`; never put it inside another.** The inline padding doubles and the
  title stands in from its own panels and every other page. Draw the header first, then the body in
  its own `div.wrap.page-body`. A width limit on the body goes on a child of that `.wrap`, never on
  the `.wrap` itself, or its auto margins re-centre it away from the header.
- **The weight classes are the season's.** Every cap drawn comes from the season it belongs to —
  `class_max_bytes` on a version, `weight_classes` on a season — never a table in this repository.
  `useWeightClasses()` in `providers/platform-context.ts` is the accessor. A class result is
  comparable within its season and not across seasons. The class icon is a meter of the season's
  classes filled up to this one (`classStep()` in `lib/weight-classes.ts`), so its bar count is the
  season's too: a season of three classes draws three bars.
- **A match is its scores, and every match row has one layout.** `components/MatchRow.tsx` draws a
  match of 2 to 8 players the same way, left-aligned: a side column that is a **row header** (time,
  any state worth reading, player count and map — told apart by a tint, a divider and monospace
  time), then **up to four players in finishing order**, each with the same four things — place,
  score, model and owner — then "+N more". A two-player match fills two of the four columns so rows
  line up. There is no scoreline variant and there must not be one: a different shape per seat count
  is what read as messy. Day headings ("Live now", "Today · 17 Sep") are full-width rows a step darker
  than the side column. A narrow list (`narrow`, and every list below 1000px) keeps the order, puts
  the row header on top as a strip and shows two players, and its "+N" counts the hidden ones. No
  sentence for the referee's end reason, no turn, no ladder tag on a row.
- **A map decides how many play**, from 2 to 8, and seats are numbered from 0 in the API (drawn
  "seat 1" to "seat 8"). The match page's result is a places table for any count — place ("=1st"
  when shared, DQ last), seat, model, score, strikes, and one rating-change column per ladder the
  match counted on. Every Ants map in the local stack seats two, so a multi-seat shape is proved by
  rewriting the `/v1/matches` response over CDP (`Fetch.requestPaused`) and reading 1440 and 390px.
- **A row's primary number is its largest type.** On `/leaderboard` that is the rating (`lead`,
  17px; the home page's compact ladder keeps it at its neighbours' size); in a match row it is the
  score, **one size whatever the seat count** (20px), so a score never shrinks because more seats
  share the row.
- **The plot never relies on colour alone.** The five class hues are the tokens and, read as a
  categorical palette, fail the colour-vision check; `SizeRatingPlot` carries a dot's class by
  the labelled band it sits in and the name beside it. Keep it that way if you add a series. A
  name is drawn only where it covers no name already placed, best-rated first: a field sharing one
  size put every label in its column on top of the one above.
  Its root is a `<figure>` with a `.vis-hidden` caption and the `<svg>` carries **no**
  `role="img"`: that role makes the whole subtree presentational, which left every focusable
  mark — each one a link to a version — reachable by Tab and invisible to a screen reader.
- **A game introduces itself.** Provenance copy, presets and limits come from the cartridge
  manifest, as plain text that is never inserted as markup.
- **A placeholder is the shape of what replaces it.** Tables load as the same table with the same
  columns, match lists as the same rows, the replay frame is drawn empty at its final height, and
  the home page's top panel holds one height across all three of its states. A skeleton that is not
  the size of its content is a page that jumps when the data lands.

## Styling

`public/design-system/tokens.css` is the source of truth and the one stylesheet `index.html` loads
directly. `data-theme` on `<html>` selects a palette and `lib/theme.ts` sets it before the first
paint: a stored choice if there is one, else `prefers-color-scheme`, which it follows until a
choice is made and never after. Dark is the tokens' default and so the no-JavaScript fallback.
**The stylesheet carries no `prefers-color-scheme` block of its own** — one mechanism decides the
palette, because two would eventually disagree.

Every colour is a role, never a literal: `bg`/`surface`/`surface-raised`, `ink`/`muted`,
`accent`/`accent-ink` (the pair travels together), `success`/`warning`/`danger`, `line` for
decorative boundaries (an input's boundary uses `muted`, because it has to stay visible). The
logo's region tokens — `frontal`, `parietal`, `occipital`, `temporal`, `cerebellum`, `stem` — are
also the weight-class hues, mapped at the top of `layout.css`; not for ordinary text.

**The leaderboard is a podium (`i-leaderboard`) and a match is crossed swords (`i-matches`)**,
wherever the site names either: the nav, the phone menu, the footer, a page title, a crumb, a
section or panel heading, a "see all" link, a stat, a table column and a way out of an error page.
`PageHeader`, `Section` (and its `more`), `PanelHead`, a `Crumb` and a `Stat` take an `icon`, and
`IconLabel` puts one in front of any other word. A new place that names either takes its icon too,
and neither icon means anything else. Prose that happens to mention a leaderboard stays prose.

**Never colour alone.** Pills and notes say their state in words, and the colour agrees. **In a row,
a label is an icon, not a word** — the class meter, a baseline's anchor, a provisional rating's half
circle, a match's state, a trial's flask — and that is only allowed because each one is told apart
by its shape, not its hue, and carries its word as its accessible name and its tooltip
(`Icon`'s `label`, `ClassIcon`'s name). An icon with neither is colour alone again. What a column
or a filter *means* is an `a.info` icon that opens the book's chapter, never a caption under it.

Four stylesheets, by reach: `src/styles/base.css` (element defaults, layout primitives, buttons,
inputs), `shell.css` (the header, its popovers, the footer, the toasts — every class `site-`),
`components.css` (anything two pages draw) and `pages.css` (what exactly one route draws). A rule
that a second route needs moves up. Prefer a named class over an inline `style` object.

**A bordered box is a `Panel`**; stats, prose and forms sit on the page. **A state word is a
`Badge`**, through one table per kind of thing in `components/Model.tsx` (`VersionBadge`,
`SeasonBadge`, `MatchBadge`) — no page picks a tone. **A notice is a `Notice`**, told apart by its
icon's shape. A 404, a sign-in wall, an admin wall and a failed sign-in are all `Message`
(`components/ErrorStates.tsx`), and a signed-in page's wall is `AuthGate`.

**No native `<select>`.** Its open list is the operating system's menu, in the system's type and
colours whatever the theme. `Select` and `LabelledSelect` in `components/ui/Form.tsx` draw the button
and the listbox from the tokens; a text, number or date field and a textarea take `.input`.

## Where new code goes

`src/lib/` is pure helpers only — anything holding React context belongs in `src/providers/`.
A component drawn on one page stays in that page; one drawn on three or more moves to
`src/components/`, and if it carries no domain meaning, to `components/ui/` (exported through its
barrel, so call sites keep importing from `../components/ui`).

A new page picks a layout that already exists — overview (Home), list (Leaderboard, Matches),
entity (Match, Model, Version, Profile), workspace (Your models, Notifications), form (Submit),
settings (Account), editorial (Get started, Questions, What's new), admin, or message — and draws it
from the `components/ui` kit: `PageHeader` with its breadcrumbs, `Section`, `Panel`, `StatGrid`,
`KeyValueList`, `DataTable`, `Tabs`, `Segmented`, `Select`, `Pagination`, `Notice`, `Badge`,
`StepTracker`, `Switch`, `CopyField`, `ConfirmAction`.

A new admin page is a route in `App.tsx`, a tab in `components/AdminTabs.tsx`, and a link in
`AdminLinks` in `components/Shell.tsx`: the account menu's Admin group is the one place the site
links admin pages from.
