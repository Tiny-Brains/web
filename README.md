# web

Web is the TinyBrains browser application. It is a React 19 and TypeScript SPA built with Vite 8,
serving the twenty competitor-facing routes over Soma's `/v1` API: the ladder, the matches, the
version and match permalinks, profiles, submitting, and the admin pages. The production image
serves the bundle through nginx and proxies API traffic to Soma.

## The name

**Web** is a descriptive name for the browser-facing part of the platform.

## Scope

**It owns**

- The twenty routes, their loading, empty, refused and not-found states, and the words each uses.
- The shell: the bar, the game and season selectors, and the theme the tokens define.
- The typed Soma client in src/api/ and the shared session and platform contexts.
- Development and image-serving proxies for /v1, plus static asset and SPA serving.
- Taking each registered game's replay viewer from the cartridge's GitHub release at build time.
- **The competitor guide**, in `docs/` — thirty-six mdBook pages served at `/docs` and built into
  this repository's image. It has its own `README.md`, `CLAUDE.md`, toolchain and `Dockerfile`; read
  [docs/README.md](docs/README.md) before changing anything under it.

**It does not**

- Issue or validate sessions; [Soma](https://github.com/Tiny-Brains/soma) authenticates requests.
- Store OAuth credentials or read the HttpOnly session cookie.
- Decide admission or rankings; [Soma](https://github.com/Tiny-Brains/soma)'s clocks maintain that state.
- Run games or models; [Kalam](https://github.com/Tiny-Brains/kalam) plays the matches and Orion's `models` entity runs the graphs.
- Draw a replay or know a rule of one; [Ants](https://github.com/Tiny-Brains/ants) ships the viewer and this repository only mounts it.
- Define what a weight class is, or what a match counted on; both come from the API.

## Where it sits

```text
[Browser] --> [Vite or nginx: page origin] -- /v1 proxy --> [Soma]
    |
    +-- full-page OAuth navigation --> [GitHub] -- callback --> [page origin]
```

| Direction | Party | Over | What moves |
|---|---|---|---|
| calls | Soma | Same-origin /v1 requests | User, game, model, and leaderboard data; session revocation |
| calls | Soma sign-in route | Browser navigation | OAuth start and final callback |
| called by | Browser | Static HTTP | SPA HTML, JavaScript, styles, and assets; the rendered book at /docs |
| builds in | docs/ | Its own artifact image, `/artifacts/book` | The competitor guide, copied to /docs at image build |
| reads | Ants | its latest GitHub release, `viz/` | The replay viewer, for the browser and for the book |

The [system map](https://github.com/Tiny-Brains/devops#where-it-sits) covers the services behind Soma.
UI state lives in React; durable application data and session validity come from the API.

## Interface

This repository exposes no application API. [src/api/client.ts](src/api/client.ts) defines the calls it consumes,
the response types, and ApiError with HTTP status, error code, and optional request id.

The client covers all twenty-three of Soma's routes. Its TypeScript types were read off the
`json_build_object` in each workflow's one query and are compile-time assertions, not response
validation: `soma/workflows/soma-*.json` is the authority, and TypeScript cannot notice when one
changes.

| Route | Where it is drawn |
|---|---|
| GET /v1/status | /status, alongside a latency the page times itself |
| GET /v1/games · /v1/games/{game} | the game dropdown; the home page's provenance, presets and class caps |
| GET /v1/games/{game}/seasons | the season dropdown, and the seasons admin table |
| GET /v1/games/{game}/leaderboard | the home ladder card and /leaderboard |
| GET /v1/matches · /v1/matches/{id} | /matches, the match permalink (which is the replay screen), and every match list |
| GET /v1/models/{id} · /v1/versions/{id} | the model permalink and the version permalink under it |
| GET /v1/profiles/{username} | /profile/:username, the public half |
| GET /v1/me · /v1/models · /v1/me/matches · /v1/sessions | the account menu, the home page's strip, /me and /me/account |
| GET /v1/me/notifications · POST /v1/me/notifications/read | the bell (polled with `since=`), toasts, and /me/notifications |
| GET/PATCH /v1/me/notification-settings | the notification settings on /me/account |
| GET /v1/games/{game}/submission | /submit — whether the caller may submit, and why not |
| POST /v1/submissions · PATCH /v1/me · DELETE /v1/session[s] | the submit form, the display name and signing out on /me/account |
| POST/PATCH seasons, POST seasons/current/close | /admin/seasons |
| GET /v1/auth/github | full-page navigation rather than fetch |

Two behaviours of the API the client has to know about, both documented where they are handled:

- **A refusal is a string, not a code object.** Orion's own failures are `{error: {code, message}}`;
  Soma's deliberate refusals are `{error: "not_a_participant", detail: {…}}`. ApiError reads both,
  because flattening the second is how a page loses the ability to say which refusal it hit.
- **An unknown model or match id answers 200 with a null body.** `soma-models-get` and
  `soma-matches-get` have no `unknown` task, unlike `soma-profile-get` and `soma-games-get`. Those
  two permalinks treat a null body as absence; reading only the status leaves the page loading for
  ever.

### The design system

Cobalt. [`public/design-system/tokens.css`](public/design-system/tokens.css) is the source of truth
and the one stylesheet `index.html` loads directly. `data-theme` on `<html>` selects a palette and
[`lib/theme.ts`](src/lib/theme.ts) sets it before the first paint — from the reader's stored choice
if they have made one, and from `prefers-color-scheme` if they have not, which it then follows
until they do. Dark is the tokens' own default and therefore what stands with no JavaScript at
all; the stylesheet carries no media query, because two mechanisms choosing one palette is two
mechanisms that will eventually disagree. Every colour in this app is a role, never a literal:

- `bg`, `surface`, `surface-raised` — the page, its panels, and a surface nested on one.
- `ink`, `muted` — primary and supporting text.
- `accent`, `accent-ink` — links, focus and the primary button; the pair travels together.
- `success`, `warning`, `danger` — labelled outcomes. **Never the only carrier of meaning**: the
  pills and notes that use them say what they mean in words too, and an icon that stands in for a
  word in a row is told apart by its shape and carries the word as its accessible name and tooltip.
- `line` — decorative boundaries. An input's boundary uses `muted`, because it has to stay visible.
- `frontal`, `parietal`, `occipital`, `temporal`, `cerebellum`, `stem` — the logo's regions, and the
  weight-class hues drawn from them at the top of `base.css`. Not for ordinary text.

Sans for reading and navigation, mono for code, identifiers, scores and replay metadata; body text
is 15px/1.62 and metadata 12–14px. Spacing is a 4px base, radii are 6/10/18px for small elements,
controls and feature cards. Focus is a 2px accent ring with an offset, and a disabled control is
actually `disabled`. `components.css` holds anything a second page would want and `pages.css` holds what
belongs to exactly one.

Both logo variants — [dark](public/logo-circuit.svg), [light](public/logo-circuit-light.svg) — are
the same `0 0 100 100` geometry as [`src/components/Logo.tsx`](src/components/Logo.tsx), which draws
it from the tokens instead and so wears whichever theme is on. Keep the full viewBox for clear
space, preserve the aspect ratio, don't go below about 32px wide, and edit the three together: a
standalone SVG is its own document and cannot read a custom property, which is the only reason a
file per theme exists.

### The replay viewer

The viewer is [Ants'](https://github.com/Tiny-Brains/ants), not this repository's, and it comes from
the cartridge's own **GitHub release** — never a checkout, and it is not committed here. The image
build fetches the latest release (`ARG ANTS_RELEASE` names a tag instead) with curl, which is how it
gets outside a build context that is `web/` alone, and `--build-context ants=../ants/dist` swaps in a
local build of an engine not released yet; `scripts/vendor-viewers.sh` fetches the same files from
the same release for the local Vite loop, and `npm run dev` / `npm run build` run it first. Either
way it is the six files the browser actually fetches: `viz.js` and its closed module graph down to
the transpiled component and its `.wasm`. `cartridges.json` lists the games and the repository each
releases from, so this repository reads neither `devops/games/registry.toml` nor an ants image.

`src/components/Replay.tsx` loads `/cartridges/<game>/viz.js` and calls `mount()`. It uses the
framework-free entry rather than the bundle's React wrapper, which imports the bare specifier
`react` and cannot resolve when served from `public/`. There is no rule of any game in this
repository and there must never be one: the viewer re-simulates through the same component digest
that recorded the match, so it and the referee cannot disagree.

**Nothing here styles it.** The viewer reads this application's own tokens for its chrome —
`var(--ink, …)`, `var(--accent, …)` and the rest, with its own copy of the same palette as the
fallback — so it is the colour of the card it sits in and follows the theme switch on its own. Its
board keeps a fixed palette in both themes, because a match has to look like itself. Everything but
its transport bar is a tray over the board that appears on hover, so the frame is the board's.
`layout.css` held fourteen rules reaching into it to get that second thing before the viewer did it
itself; the note where they were says why they are not coming back.

### The book at /docs

The competitor guide is `docs/`, an mdBook, and `/docs` is **not a route** — nginx and the Vite dev
server answer it from the rendered book and the request never reaches the router, which is why every
Docs link in the application is a plain `<a>`.

It was `Tiny-Brains/docs`, a repository of its own, until 16 September 2026. The book is served at
`tinybrains.dev/docs` and nowhere else, so the boundary bought nothing and cost three couplings: a
`../docs/book` path in `vite.config.ts`, a GitHub URL in a page that apologised for deployments with
no book mounted, and a hand-copy of `public/design-system/tokens.css` that had already drifted. All
three are gone. `pages/Docs.tsx` and `lib/book.ts` are deleted; `docs/theme/tokens.css` imports
`/design-system/tokens.css` off this application's own origin instead of restating it.

**One repository, two artifacts.** The book's build wants mdBook, python3 and the `tinybrains`
binary out of DevOps' CLI image; `docs/Dockerfile` does that and publishes the rendered book, and
this repository's `Dockerfile` copies it in from `DOCS_REF`, beside the viewer it fetches from the
cartridge's release. Inlining those stages would make `docker compose build web` a Rust build, so it does
not: `.dockerignore` excludes `docs/` and `.oxlintrc.json` does too.

`npm run dev` is also the book's real preview — `docs/book.toml` sets `site-url = "/docs/"` and the
theme links this origin's stylesheet, both of which `mdbook serve` cannot provide. Read it at
`localhost:5173/docs/`.

What the dev server serves is `docs/book`, and a fresh checkout has none: `mdbook build` needs
`src/viz/` and `src/tutorials/`, which are generated and gitignored. `scripts/vendor-book.sh` takes
the rendered book out of `DOCS_REF` instead, and `predev` runs it — writing only when `docs/book` is
absent, so a real local build is never overwritten (`npm run vendor:book -- --force` replaces it).

### The /v1 proxy and the session cookie

The cookie belongs to the browser-facing host because Soma does not set a Domain attribute.
Both proxies preserve /v1, redirects, and Set-Cookie so the browser uses the same origin throughout.

| Proxy contract | Development | Built image |
|---|---|---|
| Configuration | vite.config.ts | nginx.conf |
| Upstream | Configured target http://127.0.0.1:8080 | Configured service http://soma:8080 |
| Redirect handling | followRedirects: false | proxy_redirect off; proxy_intercept_errors off |
| Address resolution | Vite proxy target | Docker DNS resolver with a variable upstream |
| Static serving | Vite development server | SPA fallback; immutable hashed assets; uncached index.html |

With either server running and Soma reachable, check the proxy from a terminal:

```sh
curl --fail --silent --show-error http://localhost:5173/v1/games
```

## Run it, test it

The page can start alone, but API and sign-in behavior require Soma. Follow the
[DevOps setup](https://github.com/Tiny-Brains/devops#run-it-test-it) to provision its dependencies.
All commands here run from this repository's root.

- Node 22.12 or newer on the Node 22 line and npm; the image uses Node 22.
- A Soma instance available at the target configured in vite.config.ts.
- A GitHub OAuth App configured on Soma for the browser origin.

Install the locked dependencies and start the development server:

```sh
npm ci
npm run dev
```

Vite's configured port is 5173 with strictPort enabled, so it fails if that port is occupied.
If the DevOps web container already uses it, stop that container from the DevOps checkout before
starting Vite; leave the backend services running.

Check the source and build the production bundle:

```sh
npm run lint
npm run build
```

A pass is clean oxlint output and a successful TypeScript/Vite build. There is no automated test
suite; the production Dockerfile runs the same build, but build success does not validate OAuth.
Read the pages against a running stack instead: every route renders its own loading, empty and
refused states, and the states the local database cannot reach — a rejected version, a cancelled
or failed match, a season that is not open — are the ones most likely to be wrong.

The viewer is copied in before either command, so a checkout with no `ants/` beside it still
builds and keeps whatever is committed. To refresh it after rebuilding the cartridge:

```sh
npm run vendor:viewers
```

## What a deployment owes it

The bundle has no runtime environment-variable interface. Set infrastructure values around it,
and keep the two proxy configurations aligned when changing the API location.

| Setting | Owner | Missing or inconsistent value |
|---|---|---|
| /v1 upstream | vite.config.ts or nginx.conf | API requests fail, commonly with a proxy 502 |
| Browser origin | Deployment listener or ingress | OAuth may return to a different page or host |
| app_url and oauth_redirect_uri | Soma's Orion vars | Redirects do not complete the intended browser flow |
| GitHub callback registration | OAuth App | Must exactly match Soma's redirect URI |
| cookie_secure | Soma's Orion vars | Use false for local HTTP and true for HTTPS deployment |
| Docker DNS resolver | nginx.conf | The shipped image assumes Docker's resolver; other environments need a matching resolver |
| public/cartridges/ | `COPY --from=ants` in the Dockerfile, or scripts/vendor-viewers.sh locally; gitignored | A stale or missing viewer; the replay panel says the viewer is not available and every other part of the page still renders |
| application/wasm for .wasm | The serving layer's MIME table | WebAssembly.compileStreaming refuses the response and no replay draws; nginx's own mime.types already maps it |

For the shipped local setup, the OAuth homepage is `http://localhost:5173` and its callback is
`http://localhost:5173/v1/auth/github/callback`. GITHUB_CLIENT_ID and the secret
GITHUB_CLIENT_SECRET belong to Soma's environment, never to a Vite build variable.
There are no browser-side secrets. Ports, origins, DNS, and upstreams are deployment settings.

## Layout

```text
src/main.tsx             React entry point
src/App.tsx              the twenty routes and the split points
src/lib/match.ts         a seat's shape, when a match happened and its state, and a rating move
src/components/SizeRatingPlot.tsx  the ladder as a picture: bytes across, rating up, class bands
src/api/client.ts        typed same-origin client for every Soma route
src/api/types.ts         the response shapes those routes return
src/pages/               one file per route
src/components/          the shell and everything drawn on more than one page
src/components/ui/       layout (Panel, PageHeader, Breadcrumbs, Section), data, nav, form, feedback, icons
src/providers/           the session, platform and notifications contexts, and their providers
src/lib/                 selection, formatting, theme, useApi, usePopover, useLadderHeads
src/styles/base.css      element defaults, layout primitives, buttons, inputs
src/styles/shell.css     the header, its popovers, the footer, the toasts (site-)
src/styles/components.css anything two pages draw
src/styles/pages.css     what belongs to exactly one page
public/design-system/    tokens.css — the palette, spacing and radii, loaded by index.html
public/og.png            the card a pasted link unfurls to; rendered by scripts/og-image.sh, committed
public/cartridges/       game viewers, from each cartridge's release (gitignored)
scripts/og-image.html    the card's source; og-image.sh renders it at 1200 × 630 with headless Chrome
cartridges.json          which games, and the repository each viewer is released from
scripts/vendor-viewers.sh  fetches each viewer from its release, for the local dev loop
scripts/vendor-book.sh   extracts the rendered book into docs/book, for the local dev loop
vite.config.ts           development listener, API proxy, and the book at /docs from docs/book
nginx.conf               image proxy, caching, /docs from the book baked in, and SPA fallback
Dockerfile               Node build stage and nginx serving stage; takes the book from DOCS_REF
docs/                    THE COMPETITOR GUIDE, an mdBook with its own README, CLAUDE.md,
                         toolchain and Dockerfile. Served at /docs and built into this image.
package.json             dependencies and lint/build commands
```

## What must stay true

- **API calls use the page's /v1 origin.** src/api/client.ts and both proxies define this contract; there is no automated proxy regression test yet.
- **Soma decides whether the session is valid.** The session context queries /v1/me rather than treating a stored client token as authority.
- **Sign-in is browser navigation.** startGitHubSignIn lets the OAuth redirect reach the browser and its cookie jar.
- **Secrets never enter the bundle.** Build-time values are public to the browser, so credential handling belongs on Soma.
- **Both proxies preserve the OAuth response.** Redirect and Set-Cookie behavior must be checked when either proxy changes.
- **API types track the server.** TypeScript alone cannot detect a stale response declaration; compare Soma's contract when expanding the client.
- **Game and season are selection, not routes.** They live in the query string and are omitted when they are the default. A second game adds a row to a dropdown; adding a route branch for one would undo that.
- **The weight classes are the season's.** Every cap this app draws comes from the season it belongs to — `class_max_bytes` on a version, `weight_classes` on a season — never from a table in this repository. A class result is comparable within its season and not across seasons.
- **A game introduces itself.** The provenance copy, the presets and the limits come from the cartridge manifest, as plain text that is never inserted as markup.
- **No rule of any game lives here.** Ladders, outcomes and what a match counted on are the API's answers; the replay is the cartridge's viewer. A re-implementation of either would be a second engine.
- **public/cartridges/ comes from the cartridge's release and is not committed.** It must be the engine the ladder plays: kalam's package and this image both take the latest release when they build, or the one `ANTS_RELEASE` names, and compose passes one value to both. A viewer built against a different engine does not fail; it draws a plausible match that never happened.
- **No class in this application may start `tb-`, and no rule here reaches into one.** The viewer injects one global stylesheet when it mounts and owns every `tb-` name in it; its own build now checks that every rule is scoped to `.tb-viz`, but the guarantee lives in another repository. The shell uses `site-`; the header's header comment in shell.css says what the collision looked like, and the rule above `.replay` in components.css for why this side styles nothing inside the viewer.
- **A placeholder is the shape of what replaces it.** Tables load as the same table, match lists as the same rows, the replay frame is drawn empty at its final height, and the home page's top panel holds one height across all three of its states. A skeleton that is not the size of its content is a page that jumps when the data lands.

## Status

**17 September 2026 (night) — `/start` installs the CLI with Homebrew.** `tinybrains` is its own
repository and ships binaries now, so the first step's code block is `brew tap` + `brew install`
rather than a `cargo install` from devops.

**17 September 2026 (latest) — the site is rebuilt on one component kit, one navigation model and a
notification area.** From the reviewed site blueprint:

- **Navigation.** A one-row header (72px): the brand, and beside it the **scope switcher** — a game
  picker and a season picker with the season's state, each with its icon (the context strip is
  gone); on the right the nav, an icon over each word (Leaderboard, Matches, and Get started, which
  opens the book — there is no separate Docs link), and — signed in — Submit, the **notifications
  bell** and an **account menu**. The leaderboard is a podium and a match crossed swords everywhere
  the site names either. The account menu is now the one place admin pages are linked from. Every page below the top level has
  **breadcrumbs** instead of a hard-coded back link. Popovers share `lib/usePopover.ts`.
- **Routes.** `/models` (yours) is `/me`; the account half of your profile is `/me/account`;
  `/me/notifications` is new; `/admin` goes to `/admin/seasons`, and the admin pages share tabs. The
  profile is public-only and identical for its owner. No redirects: nothing is released.
- **Components.** `components/ui` is the kit — `Panel`, `PageHeader`, `Breadcrumbs`, `Section`,
  `StatGrid`, `KeyValueList`, `DataTable`, `StepTracker`, `Tabs`, `Segmented`, `Select`, `Pagination`,
  `Badge`, `Notice`, `EmptyState`, `Switch`, `CopyField`, `ConfirmAction` — and every page is drawn
  from it. `Card`, `Pill`, `SeasonPill`, `StatusPill`, `Facts`, `LadderCard`, `LadderSwitch` and
  `Seats.tsx` are deleted; one badge table per kind of thing lives in `components/Model.tsx`, and a
  404, a sign-in wall, an admin wall and a failed sign-in are one `Message` template.
- **Matches.** A match of 2 to 8 players is one row layout: a tinted row-header column (time, state,
  player count, map), then up to four players in finishing order with place, score, model and owner,
  then "+N more"; day headings are full-width rows. The match page's result is a places table with a
  rating-change column per ladder. `/matches` gains a Players filter (Soma's new `players_min` /
  `players_max`), an All/Mine switch, and narrowing to one model, version or owner from their pages.
- **Notifications.** `providers/notifications.tsx` polls `/v1/me/notifications?since=` every 30s while
  visible; new items land in the bell, as a toast, and — with browser permission and the kind's push
  setting on — as a system notification while the tab is in the background. Settings are on
  `/me/account`. **Nothing reaches a closed browser yet**: Web Push needs a service worker, VAPID keys
  and a sender.
- **Styles.** `layout.css` is replaced by `base.css`, `shell.css` and `components.css`; `pages.css`
  is rewritten. Tokens are unchanged.

Verified: `tsc -b`, oxlint (clean, no warnings) and `vite build`; then on the dev server against the
local stack with a minted admin session (revoked after), read through CDP at 1440 and a real 390px:
`/`, `/leaderboard`, `/matches`, a match, `/me`, `/me/notifications` with the bell open on real
notification rows, `/me/account`, `/submit`, `/admin/seasons`, `/admin/runners`, `/profile/<you>`,
and the phone menu. **Not read:** a multi-seat match row against real data (every local map seats
two), a closed season's home and champions, the submit form's upload path, a toast arriving live,
and the system notification in a background tab.

**17 September 2026 (later) — the rating and the score are the largest type in their rows.** Both
pages read as empty after the 16 September rework: every value on a row was the same 13–15px mono,
so a wide card was a thin line of type. On `/leaderboard` the rating is 22px (15px) and its
provisional mark grows with it; the home card's compact ladder is unchanged. On `/matches` the score
is 34px on a desktop row (24px) and 26px stacked on a phone (20px), and the dash between two scores
sits on the middle of the digits rather than their baseline, where it read as an underscore.

**Every Ants map seats two today, and a map will decide how many play**, so the score is one size
whatever the seat count, and a narrow row now stacks three or four seats one a line exactly as it
stacks two. The columns they drew before cut every name on a phone to four letters, and on
`/matches` they were also placed in the phone grid's first column only, beside the flask's. A seat
column no longer prints the version, as a scoreline never did. In a stacked row the owner takes only
the room the model's name leaves (`flex: 1 1 0`): a shrink weighting of 1000 still took 0.016px from
the name, and that ellipsised `micro-percell`. The loading row draws two scores and a dash, as a
played scoreline does, and is now within 1.4px of one (a phone's was 4px short before and would have
been 17px short after).

Read on the dev server at 1440 and a real 390px, with `/v1/matches` rewritten over CDP so rows two
and four were three- and four-seat matches (the local database has none): no horizontal overflow
on `/leaderboard`, `/matches` or `/`, and the home page's recent-matches card stacks its multi-seat
row too. Not read: a queued or cancelled multi-seat row, whose score is an em dash.

**17 September 2026 — the admin pages are linked, from an administrator's own profile.**
`/admin/seasons` and `/admin/runners` were unlinked by design and reachable only by typing the
address. `/profile/<you>` now draws an **Admin** section above *Your account* — a row a page, an
icon and its path — when `me.role` is `admin`; it is not drawn for anyone else, and not on anyone
else's profile, an admin's included. It stays a courtesy: Soma's 403 is what protects both pages.
A new admin page is a route in `App.tsx` and a row in `ADMIN_PAGES` in `pages/Profile.tsx`. Both
pages dropped the *unlinked* strip marker and the sentence saying nothing linked them.

Verified on the dev server against the local stack over CDP, with minted sessions revoked after: the
section appears for the admin on their own page at 1440 and a real 390px (no horizontal overflow),
is absent for the admin on a competitor's page, for that competitor on either page and for a
visitor, and its Runners row navigates to `/admin/runners`. The Orion console (`CONSOLE_URL`, :8081
locally) is **not** linked: its address is Soma's configuration, and this bundle has no runtime
environment to learn it from.

**16 September 2026 (latest) — `/leaderboard` and `/matches` are the data, and a match is its
scores.** Feedback on both pages was that they carried too much text, too densely; that labels
should be icons; and that a match should show its scores rather than explain them. Measured on the
dev server against the local stack before and after, at 1440 × 900 and a real 390px through CDP:

| | before | after |
|---|---|---|
| `/leaderboard` first row, laptop / phone | 1001px / 1604px | 347px / 439px |
| `/leaderboard` words / API requests | 622 / 20 | 281 / 10 |
| `/matches` first row, laptop / phone | 903px / 1742px | 350px / 451px |
| `/matches` row height, laptop / phone | 115px / 180px | 58px / 87px |
| `/matches` words / API requests | 756 / 14 | 243 / 10 |
| a match page's words | 136 | 44 |

Request counts are the dev loop's, where React's strict mode doubles every effect; the ratio holds.

- **Labels are icons.** The weight class is a meter (`ClassIcon`): the season's classes as rising
  bars, filled to this one, so it is told apart by shape and reads to a colour-blind reader, which
  the coloured square did not. A baseline is an anchor, a provisional rating a half circle, a match
  that is counting, playing, cancelled or failed an icon beside its time, a trial a flask. Each
  carries its word as its accessible name and tooltip. "by" before every owner is gone.
- **`/leaderboard`** is the title and the ladder card. The page's sentence, the ladder's caption,
  the five class-champion cards (and their five requests), the Version and Class columns, the size
  bars and the rating's footnote are gone; what a rating means is an ⓘ on its header that opens
  `competing/ranking`. Hiding baselines is an anchor toggle in the card's head, and the plot is a
  second view of the same rows (`?view=plot`) rather than a card above them. Its labels no longer
  print over each other. On a phone the table is rank, model and rating.
- **`/matches`** is the title and one card: four selects on its head, then the rows by day. The
  season-counts strip and "worth watching" went, and with them four of the page's five reads. A row
  is when and a `Scoreline` — `name 0 – 3 name` — with no end reason, turn, preset or ladder tag.
- **A match page** is the head, the board and one scoreboard: a row a seat with its mark, score and
  Open move, and every ladder and the strikes folded under it. The sentence under the title, the
  finished-match note, the second card and the key hint (now behind a keyboard icon) went; the
  preset and the seed are two icons in the head. `outcomeSaid()` is deleted.

**Not verified:** a cancelled, failed, queued or playing match, and a trial, in a row or on the
match page — the local database has none, so their icons and notes are written and unread, as the
states below always were. Home, a version, a model and a profile were re-read, because they draw
the same rows and the same class icon.

**16 September 2026 (merge) — Jodi is Soma.** The admin season page says the *closure clock*
settles a requested close rather than Jodi's, and two comments name Soma's clocks. No behaviour
changed. The book's half is in `docs/README.md`.

**16 September 2026 (later) — `/admin/runners`, the answer to "which machine".** Unlinked like
`/admin/seasons`. It lists every machine playing the ladder, mints runner keys (**shown once**;
the row stores a sha256 and an eight-character prefix) and revokes both keys and runners, each
behind a type-the-name confirmation because the two look alike in a table and revoking a *key*
stops every machine on it.

**It separates two questions the API returns as one.** `live` means the runner row, its key and the
key's **owner** are all in good standing — authorisation. **Calling in** means `last_seen_at` has
moved within a lease. The first version printed one `LIVE` badge for both and cheerfully described a
machine last seen two hours ago as live, which is what makes a fleet list worth nothing. A runner
that is authorised and silent is **quiet**; one that is also still holding matches is **wedged**.
That distinction is not cosmetic: a runner refused on the token route goes quiet and nothing else
reports it, because the token exchange is what stamps `last_seen_at`.

It also warns when the machines that are *calling in* disagree about the engine digest or the Orion
version — two disagreements that are silent everywhere else, the first claiming nothing for ever
while looking healthy.

**16 September 2026 (later) — `/submit` takes the files, not their hashes.** `lib/upload.ts` reads
each file once, hashes that buffer with `crypto.subtle`, and `PUT`s **that same buffer** to the
presigned URL, so the digest and the bytes cannot disagree — the failure the old form invited was
hashing one copy and uploading another. The two SHA-256 text inputs are file pickers; both digests
are still shown as you pick, because they are the contract and what a rejection names.

**An upload that fails is not a refused submission.** The row is written before the first byte
moves, so `Uploaded` has two faces: both-files-up, and version-recorded-but-transfer-failed, which
keeps the `curl` commands on screen. Resubmitting is described as the second-best recovery on
purpose — it re-mints only while the version is still `testing`, and the admit clock rejects an
empty one within about a minute, after which submitting again spends a version number. Both paths
were driven through CDP, the second by blocking the store with `Network.setBlockedURLs`.

`crypto.subtle` exists only in a secure context (https, or localhost/127.0.0.1); where it does not,
the form says so and points at the API flow rather than offering a button that cannot work.

**Two layout bugs this turned up, both the documented `auto`-track trap.** `.field` was
`display: grid` with an implicit `auto` column, which sizes to its widest child's max-content — a
file input's is its button plus the file name, so the submit form stood 513px wide inside a 390px
phone and took the page into horizontal scroll. It is `minmax(0, 1fr)` now, like `.stack`. The
71-character digest then did the same thing until it used `.hash`, which already breaks. Re-measured
at 390 and 1280 across seven routes, including the 12-field admin form.

**16 September 2026 — GitHub leaves the submission path, and the model permalink is an id.**
`/{game}/models/{owner}/{repo}` becomes **`/models/{id}`**, with `/models/{id}/v{n}` under it; the
API routes moved the same way. `paths.ts` no longer takes a game at all — a model id names its game,
and selection was always query-string rather than route.

Entry creation is **one field**: the Repository input, its five `repo_*` refusals and the ownership
copy are gone, and so is the release-tag field on `/submit`, which now asks for a model and two
hashes. `ModelLink` takes a `modelId`; the `game` prop it forced onto `LadderTable`, `Seats`,
`Champions`, `SizeRatingPlot` and four call sites in `Match.tsx` went with it, because building a
model path was the only thing any of them used it for.

The Version page loses its **GitHub release** and **Commit** rows and gains an **Artifact** row —
`models/<version_id>/model.onnx`, the generated key. That is the audit trail now: a release could be
retagged or deleted, and this key cannot. `ErrorStates`' model 404 stops talking about repositories.

**Two coupled edits worth knowing about.** `nginx.conf`'s unfurl maps keyed off `$o/$r`, which a
uuid cannot replace — the model and version pages now unfurl generically, as the match page already
did. And `index.html`'s three description tags are matched by `sub_filter` **on their exact static
text**, so the default description changed in both files together; changing one alone silently gives
every page the default.

The book followed in the same pass: `competing/models.md` is why an entry is a name,
`submitting.md` drops "Prepare the release" for "Prepare the two files" and gives the artifact key
in place of the release, and `reference/rejection-reasons.md` loses seven `repo_*` codes and the
duplicate-release row.

**16 September 2026 — the book moved in, and `/docs` is part of this image.** `Tiny-Brains/docs` is
now `docs/` here, with its own README, CLAUDE.md, toolchain and Dockerfile; the repository is
history only. The book was always going to be served at `tinybrains.dev/docs` and never at a host of
its own, which is what the separate repository was for.

Four things the boundary was costing, all now closed:

- **`site-url` was `/`**, written for the host that never arrived, so mdBook put `<base href="/">`
  in `404.html` and every not-found page under `/docs/` looked for its stylesheets one level too
  high and rendered as bare markup — on every deployment there has been, not just in preview. It is
  `/docs/`, and the 404 page's four stylesheets now answer 200.
- **`theme/tokens.css` was a hand-copy** of `public/design-system/tokens.css` that had drifted,
  carrying `--panel`, `--warn`, `--bad` and `--mono` after the application deleted them. It imports
  `/design-system/tokens.css` off this origin now. Measured through CDP, the book and the
  application compute the same `--bg`, `--ink` and `--accent` in both themes.
- **The two halves disagreed about the theme.** The book defaulted to dark whatever the reader's
  system said, and its switch stored a key nothing else read. Both now go through the application's
  `tb.theme`, so one stored choice serves the whole site and an unchosen one follows the system.
- **`pages/Docs.tsx`, `lib/book.ts` and nginx's `@docs_missing`** existed for a deployment with no
  book mounted. The book is baked into the image, so there is no such deployment; all three are
  deleted, along with the last bind mount in `devops/docker-compose.yml`.

Verified by building both images from clean, serving the result, and reading `/docs/`,
`/docs/quickstart`, `/docs/models/adapters`, `/docs/models/adapters/dialect` (200), `/docs` (301)
and a missing chapter (404, the book's own page) — plus `mdbook build` clean with twelve replays
agreeing with the viewer on `sha256:185a2845…`. **Not run against a live stack**: the book needs no
API, but the routes beside it have not been re-read since.

**Verified.** `.github/workflows/check.yml` runs the pass this file defines — oxlint, `tsc -b`,
`vite build`, and `nginx -t` over `nginx.conf` — on every push. All sixteen routes render against a
running local stack, signed out and through sessions minted the way `soma/scripts/smoke.sh` mints
them, read at 1440px and at a real 390px through CDP device emulation. The security headers, the
per-request title rewrite, `/robots.txt`, the sitemap and the feed were checked against a real
nginx serving a real `dist/`.

**Not verified.** There is no automated test suite, and a green build proves no browser behaviour.
The seasons admin card and the rest of what needs Soma answering have not been read since the
headers pass. The sign-in callback's **failure** page — nginx's `?error=incomplete` redirect — and
the submit form's success path have never run. These states are written and unreachable from the
local database, so they are the least likely to be right: a rejected version, a cancelled match, a
failed match, a season that is not open, a non-participant, and duplicate weights.

**Open.**

- `components/Champions.tsx` fans out one `limit=1` leaderboard read per weight class — five
  requests for one row each. It is drawn only on a closed season's home page now, where it is the
  podium; `/leaderboard` no longer draws it. It is correct, because a class ladder ranks its own
  field and cannot be sliced out of Open, so the fix is a Soma route that answers every ladder's
  top row at once. Not fixable here.
- `pages/ModelPage.tsx` passes `<h2>Versions</h2>` as a `CardHead` title, which renders it inside
  the head's `<h3>`; React warns about the nesting in the dev console. Older than the pass below.
- `--stem` is declared in `tokens.css` and used by nothing since the mark changed. It was the old
  mark's brainstem and it is not one of the five weight-class hues.
- The viewer's transport bar clips its turn counter at 390px. That is the cartridge's to fix.
- `docs/theme/favicon.svg` is still a copy of the retired `logo-network.svg`, and the book serves
  under `/docs` on this same origin, so the tab icon changes when a reader crosses into it. mdBook
  emits one favicon, so it cannot take the `media` pair `index.html` uses and has to commit to one
  ground.

Dated history is in the git log. The entries a competitor can see the effect of are
`src/changelog.ts`, drawn by `/changelog` and built into `/feed.xml`.

## More

- Local references: [API client](src/api/client.ts), [development proxy](vite.config.ts), and [image proxy](nginx.conf).
- [The competitor guide](https://github.com/Tiny-Brains/web/tree/main/docs) — the reader-facing half: the rules, the model format, the manifest, submitting, ranking and seasons. The platform section is the high-level design for someone new to the codebase.
- Related repositories: [Soma](https://github.com/Tiny-Brains/soma), [Kalam](https://github.com/Tiny-Brains/kalam), [DevOps](https://github.com/Tiny-Brains/devops).
- Apache-2.0: see [LICENSE](LICENSE).
