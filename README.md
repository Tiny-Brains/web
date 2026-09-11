# web

Web is the TinyBrains browser application. It is a React 19 and TypeScript SPA built with Vite 8,
serving the fifteen competitor-facing routes over Soma's `/v1` API: the ladder, the matches, the
version and match permalinks, profiles, submitting, and the seasons admin. The production image
serves the bundle through nginx and proxies API traffic to Soma.

## The name

**Web** is a descriptive name for the browser-facing part of the platform.

## Scope

**It owns**

- The fifteen routes, their loading, empty, refused and not-found states, and the words each uses.
- The shell: the bar, the game and season selectors, and the theme the tokens define.
- The typed Soma client in src/api/ and the shared session and platform contexts.
- Development and image-serving proxies for /v1, plus static asset and SPA serving.
- Taking each registered game's replay viewer from the cartridge's artifact image at build time.

**It does not**

- Issue or validate sessions; [Soma](https://github.com/Tiny-Brains/soma) authenticates requests.
- Store OAuth credentials or read the HttpOnly session cookie.
- Decide admission or rankings; [Jodi](https://github.com/Tiny-Brains/jodi) maintains that state.
- Run games or models; [Kalam](https://github.com/Tiny-Brains/kalam) and [Axon](https://github.com/Tiny-Brains/axon) do that work.
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
| called by | Browser | Static HTTP | SPA HTML, JavaScript, styles, and assets |

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
| GET /v1/models/{id} | /models/:id |
| GET /v1/profiles/{username} | /profile/:username, the public half |
| GET /v1/me · /v1/models · /v1/me/matches · /v1/sessions | the bar, the signed-in home panel, and a profile's own view |
| GET /v1/games/{game}/submission | /submit — whether the caller may submit, and why not |
| POST /v1/submissions · PATCH /v1/me · DELETE /v1/session[s] | the submit form, the display name, signing out |
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
and the one stylesheet `index.html` loads directly; dark is the default and `data-theme="light"` on
`<html>` swaps the palette. Every colour in this app is a role, never a literal:

- `bg`, `surface`, `surface-raised` — the page, its panels, and a surface nested on one.
- `ink`, `muted` — primary and supporting text.
- `accent`, `accent-ink` — links, focus and the primary button; the pair travels together.
- `success`, `warning`, `danger` — labelled outcomes. **Never the only carrier of meaning**: the
  pills and notes that use them say what they mean in words too.
- `line` — decorative boundaries. An input's boundary uses `muted`, because it has to stay visible.
- `frontal`, `parietal`, `occipital`, `temporal`, `cerebellum`, `stem` — the logo's regions, and the
  weight-class hues drawn from them at the top of `layout.css`. Not for ordinary text.

Sans for reading and navigation, mono for code, identifiers, scores and replay metadata; body text
is 15px/1.62 and metadata 12–14px. Spacing is a 4px base, radii are 6/10/18px for small elements,
controls and feature cards. Focus is a 2px accent ring with an offset, and a disabled control is
actually `disabled`. `layout.css` holds anything a second page would want and `pages.css` holds what
belongs to exactly one.

Both logo variants — [dark](public/logo-network.svg), [light](public/logo-network-light.svg) — share
one 512×512 geometry: keep the full viewBox for clear space, preserve the aspect ratio, don't go
below about 40px wide, and edit the two files together, because their region colours are the two
themes' tokens.

### The replay viewer

The viewer is [Ants'](https://github.com/Tiny-Brains/ants), not this repository's, and it comes from
the cartridge's own **artifact image** — never a checkout, and it is not committed here. The image
build reaches it with `COPY --from=ants` against a named build context (`ARG ANTS_REF`), which is
how it gets outside a build context that is `web/` alone; `scripts/vendor-viewers.sh` extracts the
same files from the same image for the local Vite loop, and `npm run dev` / `npm run build` run it
first. Either way it is the six files the browser actually fetches: `viz.js` and its closed module
graph down to the transpiled component and its `.wasm`. `cartridges.json` lists the games and their
images, so this repository no longer reads `devops/games/registry.toml`.

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
src/App.tsx              the fifteen routes, and the book's fallback
src/lib/book.ts          a book path to its source file on GitHub
src/lib/match.ts         a seat's shape, when a match happened, and what came of it in words
src/components/SizeRatingPlot.tsx  the ladder as a picture: bytes across, rating up, class bands
src/api/client.ts        typed same-origin client for every Soma route
src/api/types.ts         the response shapes those routes return
src/pages/               one file per route
src/components/          the shell and everything drawn on more than one page
src/components/ui/       card, table, form, feedback and icon primitives
src/providers/           the session and platform contexts, and their providers
src/lib/                 selection, formatting, theme, useApi
src/styles/layout.css    the shell and the shared components
src/styles/pages.css     what belongs to exactly one page
public/design-system/    tokens.css — the palette, spacing and radii, loaded by index.html
public/og.png            the card a pasted link unfurls to; rendered by scripts/og-image.sh, committed
public/cartridges/       game viewers, from each cartridge's artifact image (gitignored)
scripts/og-image.html    the card's source; og-image.sh renders it at 1200 × 630 with headless Chrome
cartridges.json          which games, and the artifact image each viewer comes from
scripts/vendor-viewers.sh  extracts each viewer from its image, for the local dev loop
vite.config.ts           development listener, API proxy, and the book at /docs from ../docs/book
nginx.conf               image proxy, caching, /docs from the mounted book, and SPA fallback
Dockerfile               Node build stage and nginx serving stage
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
- **public/cartridges/ comes from the cartridge's image and is not committed.** `ANTS_REF` must be the engine the ladder plays — compose passes one variable to kalam's package, the loader and this image for that reason. A viewer built against a different engine does not fail; it draws a plausible match that never happened.
- **No class in this application may start `tb-`, and no rule here reaches into one.** The viewer injects one global stylesheet when it mounts and owns every `tb-` name in it; its own build now checks that every rule is scoped to `.tb-viz`, but the guarantee lives in another repository. The shell uses `site-`; see the note above `.site-bar` in layout.css for what the collision looked like, and the one above `.replay` for why this side styles nothing inside the viewer.
- **A placeholder is the shape of what replaces it.** Tables load as the same table, match lists as the same rows, the replay frame is drawn empty at its final height, and the home page's top panel holds one height across all three of its states. A skeleton that is not the size of its content is a page that jumps when the data lands.

## Status

**11 September 2026 — the third pass: the items that needed something outside this repository.**
A shared profile, model, version or match now unfurls by name: `nginx.conf` maps the request path
to a title and a description and substitutes them into `index.html`'s tags per request, the site's
own words and never the API's, so there is no server rendering and nothing user-written reaches a
scraper. Every ladder row draws a sparkline of its last dozen ratings, which Soma's leaderboard now
carries as `history` (the same day, in `soma`). A closed season's home page is its results page —
`/?season=N`, with the class podium (`components/Champions.tsx`, shared with `/leaderboard`), the
plot of where every version finished, and the rules — written against the API's shape and not
seen, since the local stack's one season is open. `/matches` picks three matches worth watching
from the newest hundred by what happened. `/changelog` lists seasons from the API beside the dated
entries in `src/changelog.ts`, and `/feed.xml` is the same entries as RSS, built by a plugin in
`vite.config.ts` and typed and absolutised by nginx. The signed-in pages were read through a minted
session, which found `/submit` offering to submit "version undefined" to an account with no
models; it now asks which model, or says to make one. A starter repository is prepared beside this
one at `../ants-starter`, trained here, and waits to be created on GitHub.

**11 September 2026 — the second pass over `suggestions.md`.** Seven more lines, one commit each.
The home card shows decided matches first, so the hero's replay is a decided one; the match
headline ends with each seat's move on Open (`lib/match.ts`'s `ratingMove()`, which the rating
card now shares); `/matches` counts the season above its filters — decided, drawn, disqualified,
from three one-row reads — and sits its rows under their day; `/start` shows one turn end to end,
the observation and the action from the book's worked example and the tensor shapes from the
baselines' adapter; the signed-out `/models` draws the table sign-in fills, empty; `/faq` answers
thirteen questions in a few lines each and hands every one to its chapter, a fifteenth route,
linked from the footer and the Start page. And nginx compresses what it serves — it compressed
nothing: the viewer's wasm went out at 272 KB and goes out at 83, the app's script at 382 and
goes out at about 112. Read at 1440 and at a real 400px.

**11 September 2026 — the site starts arguing for itself.** `suggestions.md` §1–§6 and §8, one
commit each. The home page says why (a stake in the lede, stats a developer weighs, a third door
straight to drill), the nav gets Get started, and the footer a Project column. A match is said in
words — `lib/match.ts`'s `outcomeSaid()` turns the referee's reason and the seats' outcomes into a
row's few words and a page's sentence, a dictionary rather than a rule — on every row, the match
page, and a caption under the home replay. A moment in a match is an address: `?turn=` opens the
viewer there and the hint links the turn showing. The ladder carries a headroom bar in every size
cell, steps baselines back and can hide them, turns an empty class into an invitation, names the
top of each class above Open, and draws the thesis: `components/SizeRatingPlot.tsx`, bytes across
on a log scale and rating up over the season's class bands, on `/leaderboard` and the home page.
Colour is never the only carrier there — the class hues fail the colour-vision check as a
categorical palette, so the band and the label carry identity. The version page leads with its
numbers and folds its hashes under Provenance, a baseline links how it was trained; the profile
leads with a trophy line and links every entry's repository. `/start` opens with the hook, lists
what you need, tags each step's weight and says what each prints. Read at 1440 and, through CDP
device emulation, at a real 400px: nothing scrolls sideways.

**11 September 2026 — the site stops telling a newcomer things that are not true.** The five
"fix first" items in `suggestions.md`. `/start` cloned a repository that does not exist and ran a
`drill` command nothing ships; every block on it is now something that was run before it was
written down — drill's four-clone quickstart, ants-baselines' own training commands, the book's
minimal adapter, `tinybrains check`, `gh release` and `shasum`. The submit form and the footer say
`shasum`/`sha256sum` and link chapters the book has. `/docs` no longer dead-ends: the Vite server
serves `../docs/book` with nginx's own `$uri.html` rule, so localhost and the container agree, and
when no book is mounted at all both fall through to a `/docs/*` page that links the chapter's
source on GitHub instead of calling it a typo. The nginx side was driven by running the image with
no mount; the Vite side by moving the built book aside.

A pasted link now unfurls: `index.html` carries a description, Open Graph and Twitter cards and a
theme colour, and `public/og.png` is the card, rendered from `scripts/og-image.html` by
`scripts/og-image.sh` and committed. An unfurler needs an absolute image URL and the image has to
serve on any host, so `nginx.conf` rewrites the path to the host each request arrived on
(`X-Forwarded-Proto` respected), inside the one location every route is served through. Every tab
used to read `tinybrains`; `Shell` now takes a `title` and sets the document's — the page's part,
then the game and season when the strip is drawn, then the site: `nano-bc v1 · Ants season 1 ·
TinyBrains`. Read on fourteen routes by dumping each page's DOM in headless Chrome.

**11 September 2026 — a replay's owner is the handle alone.** `components/Replay.tsx` stops
appending `· baseline` to the owner it hands the viewer: a baseline's handle is in the reserved
`baseline.` namespace, so `@baseline.nano-bc` already says so, and the viewer's title bar is where
eleven more characters cost a seat its owner altogether — the home page's 505-pixel replay showed a
lone `@`. The tag stays beside the handle everywhere else. The title bar itself changed in the ants
image (ants README Status, the same day) and reaches this site with it.

**11 September 2026 — every page starts on one line, `/models` loads, and version links resolve.**
Four faults, found by measuring where each route's bar, title and first card start in headless
Chrome against the running stack:

- A page short enough to fit the window — `/leaderboard` on a thin ladder, `/status`, the 404 — has
  no scrollbar, so it was centred in a window 15px wider than a long page is, and the bar, the strip
  and the content all stood 7.5px right of every other page. `html { scrollbar-gutter: stable }`
  holds the gutter either way; where scrollbars overlay the page it reserves nothing.
- `/models` asked for `GET /v1/games/{game}/models?mine=1` — a route the book's API reference lists
  and Soma never shipped — and printed "Your models could not be loaded (404 NOT_FOUND)". It now
  calls `GET /v1/models?game=`, the caller's own list on its own path, which answers the same shape.
  `api.models` and `api.myGameModels` are deleted rather than left naming a route nobody serves.
- `/models` and the model page drew `PageHead`, itself a `.wrap`, inside a second `.wrap`: their
  titles stood 24px in from their own cards and 76px lower than any other page's head. Both now take
  the Submit and Version shape, the head and then a `section.wrap.sec.tight`.
- Every version link, `/{game}/models/{owner}/{repo}/v{n}`, drew the not-found page. React Router
  takes a param only as a whole segment, so the route `v:version` matched that literal text. The
  route is `:version` now and Version reads the `v` off; any other segment is the version not-found.

Read anonymous and signed in (a session minted the way `soma/scripts/smoke.sh` mints one), at
1440×900 and 1440×1400. `npm run lint` and `npm run build` pass.

**11 September 2026 — no select opens the system's menu.** The strip's game and season, the four
`/matches` filters and the admin form's duplicate-weights field all opened the operating system's
own list — a white panel in system type, whatever the theme. `Select` in `components/ui/Form.tsx`
draws the button and the listbox from the tokens instead, with a select's keys, and turns upward
when the window has no room below; the season list names each season's state beside its number.
The two fields on `/models` had no class at all and now take `.input`, and a number field loses the
browser's stepper. The date fields on `/admin/seasons` still open the browser's calendar, which
follows `color-scheme`. Read in both themes against the running stack; `/models` and
`/admin/seasons` need a session that check did not have, so their markup was read on another page.

**11 September 2026 — the match page is the replay screen.** `/matches/:id` is rebuilt around the
board: a one-line head that names the match by its seats — each model and `by @owner` — then the
viewer at the page's full width and as tall as the window leaves room for, autoplaying, then the
result and how the rating moved. The record card is gone (preset, seed, turns, timings, the engine
and evaluator digests, the id), and so is the id as the page's title; all of it is still on
`GET /v1/matches/{id}`, which is where the book sends a reader who wants to reproduce a match.
`/matches/:id/replay` and `pages/Replay.tsx` are deleted rather than redirected, so an old link to
one gets the not-found page.

The leaderboard is the home card. `components/LadderCard.tsx` draws the ladder switch in the card's
head for both pages, and the page-size switch that sat above the table (`LadderSwitch`'s `lg`,
`.ladders`) is gone. Picking a ladder now also resets the page cursor — before, page two of Open
opened page two of nano. `/leaderboard` and `/matches` lose their "Every match played →" and
"Leaderboard →" buttons, which repeated the bar's own links.

**11 September 2026 — the home page gives the replay room.** The top panel's replay is 460px tall
where it was 290 (250 signed in), and its column takes a little more of the row: `.95fr` of a
48px-gapped grid rather than `.85fr` of a 56px one. The section is still 572px — the hero's padding
came down to 52px, so the replay grows into space the section already held and nothing below it
moves. `TOP_REPLAY_HEIGHT` in `Home.tsx` is sized against that min-height, and the notes on both say
so. The cartridge's story is one full-width column with 120px of air on either side, instead of an
auto-fit grid of ragged columns. The strip, on every page that draws it, no longer ends in a version
count and a "Season rules" button that only ever went to the home page, and the hero's eyebrow is the
game and season alone. Read at 1440, 1060 and 400 wide against the running stack.

**11 September 2026 — the replay names its seats.** The viewer's tray said eight characters of a
weights hash, because that is all a replay envelope knows a seat by, while every other panel on the
same page said the model's name and `by @owner`. `components/Replay.tsx` now hands the viewer those
names through `mount()`'s `labels` option — the model, and `@owner`, with `· baseline` where it is
one — rather than reaching into the viewer to change them. It takes effect with a viewer from an
ants image that knows the option (ants README Status, the same day); an older viewer ignores it.

**11 September 2026 — a baseline is an entry with a tag.** Its pages show what any entry's do — its
status, its version number, its owner — with `BaselineTag` beside them, rather than "a platform
baseline" in place of the owner, "—" for the version and a "Baseline" pill for the status. A release
is linked only once admission has resolved its commit and printed until then, which is what a
baseline's never-published tag and a version still in admission both need.

**10 September 2026 — the viewer comes from the cartridge's image, and is no longer committed.**
`public/cartridges/` is gitignored. The image build takes it with `COPY --from=ants` against a named
build context, which is how it reaches outside a build context that is `web/` alone;
`scripts/vendor-viewers.sh` extracts the same six files from the same image for the local Vite loop.

That ends the trap in `predev`/`prebuild`: the automatic run used to rewrite *committed* files from
whatever sibling checkout happened to be there, so a plain `npm run dev` was a change nobody asked
for. It now writes only ignored files, from a named image, and is inert.

`cartridges.json` lists the games and their images, so this repository no longer reads
`devops/games/registry.toml` — devops is out of this build entirely. `ANTS_REF` overrides the image,
and compose passes the same variable to kalam's package, the loader and this image, because a viewer
built against a different engine does not fail: it draws a plausible match that never happened. The
served viewer moved to the current engine, `sha256:0807b641…`, with that cutover.

**Decision 46, 10 September 2026 — no compute cap.** The version page shows measured inference time
per turn where it showed estimated FLOPs; `format.ts`'s `flops()` became `micros()`;
`GameWeightClass` is now just `SeasonWeightClass`, since there is no cap to join to.

**10 September 2026 — cleanup.** No behaviour changed and no route moved; the tree did. `src/api.ts`
split into `src/api/client.ts` and `src/api/types.ts`; the two contexts moved out of `lib/` into
`src/providers/`, leaving `lib/` pure helpers; `ui.tsx`, `Table.tsx` and `Icon.tsx` became
`components/ui/` behind one barrel, so `from '../components/ui'` still reads the same. TypeScript
now runs `strict`, and `no-shadow` is on — it caught a `const api` in `/status` shadowing the client
import. The duplication that is gone: one `ladderColumns()` for the home card and `/leaderboard`
instead of two column lists, one `<Permalink>` for the load/404/null-body gate the three permalinks
each wrote out, one `StatusPill` instead of two status maps that disagreed on wording, one `cx()`
for the class-name joins, and `useWeightClasses()` — which already existed, unused — instead of six
copies of `season?.weight_classes ?? []`. `lib/match.ts` lost its three seat converters: both API
shapes already satisfy `Seat`, so they mapped each field to itself. Inline styles moved into named
classes, and the dead rules (`.num`, `pre.code .p`, `h1.mono`, `.lb-head`) went. All sixteen
addressable routes were rendered headless against the running stack and read back — tables,
seats, refusals, the 404 permalink and the mounted viewer.

**9 September 2026.** All fourteen routes are built and were read against the running local stack:
the shell and both selectors, Leaderboard, Matches, Version, Match, Replay, Profile, Submit, Start,
Status, the sign-in callback, 404/error, and the seasons admin. The client covers every Soma route,
and the Ants viewer is vendored and decodes a real replay in the browser. `npm run lint` and
`npm run build` pass.

The signed-in surfaces were read too, against sessions minted the way `soma/scripts/smoke.sh`
mints them: the entry panel, the hero a competitor with nothing entered gets, a profile's own view
with its private rejected version, and the seasons admin as an `admin`.

The viewer was re-vendored the same day against an `ants/viz` that follows this application's design
tokens and hides everything but its transport under a hover tray. The fourteen `.replay-host .tb-*`
rules that used to float its seat row over the board are gone with it; Match and Replay were read
again in both themes.

Browser OAuth is no longer untested: a `users` row and its `sessions` row were written together by
the callback during this work, from a real GitHub sign-in in Chrome, which is the leg the 1.7.0
upgrade had landed without. What has still never run is the callback's **failure** page — nginx's
`?error=incomplete` redirect — and the submit form's success path. Five states are
written and unreachable from the current database — a cancelled match, a failed match, a season
that is not open, a non-participant, and duplicate weights — so they are the least likely to be
right. There is still no automated test suite. The layout studies the pages were built from are
deleted, read alongside the built pages first, and the structure document with them: the routes are
`src/App.tsx`, what each page is is the page, and the design language is the section above.

## More

- Local references: [API client](src/api/client.ts), [development proxy](vite.config.ts), and [image proxy](nginx.conf).
- [The competitor guide](https://github.com/Tiny-Brains/docs) — the reader-facing half: the rules, the model format, the adapter dialect, submitting, ranking and seasons. The platform section is the high-level design for someone new to the codebase.
- Related repositories: [Soma](https://github.com/Tiny-Brains/soma), [Jodi](https://github.com/Tiny-Brains/jodi), [Kalam](https://github.com/Tiny-Brains/kalam), [Axon](https://github.com/Tiny-Brains/axon), [DevOps](https://github.com/Tiny-Brains/devops).
- Apache-2.0: see [LICENSE](LICENSE).
