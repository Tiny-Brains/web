# web

Web is the TinyBrains browser application. It is a React 19 and TypeScript SPA built with Vite 8,
serving the fourteen competitor-facing routes over Soma's `/v1` API: the ladder, the matches, the
version and match permalinks, profiles, submitting, and the seasons admin. The production image
serves the bundle through nginx and proxies API traffic to Soma.

## The name

**Web** is a descriptive name for the browser-facing part of the platform.

## Scope

**It owns**

- The fourteen routes, their loading, empty, refused and not-found states, and the words each uses.
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
| GET /v1/matches · /v1/matches/{id} | /matches, the match and replay permalinks, and every match list |
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
src/App.tsx              the fourteen routes
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
public/cartridges/       game viewers, from each cartridge's artifact image (gitignored)
cartridges.json          which games, and the artifact image each viewer comes from
scripts/vendor-viewers.sh  extracts each viewer from its image, for the local dev loop
vite.config.ts           development listener and API proxy
nginx.conf               image proxy, caching, /docs, and SPA fallback
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
