# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The parent directory's `CLAUDE.md` covers the TinyBrains platform — the ten repos, the Orion
packages, the shared Postgres schema. This file is only about `web/`, and does not repeat it.

## Commands

Run from this repository's root. Node 22.12+ on the Node 22 line.

```sh
npm ci                    # locked install
npm run dev               # Vite on 5173, strictPort — fails if the port is taken
npm run lint              # oxlint
npm run build             # tsc -b && vite build
npm run vendor:viewers    # re-copy each game's replay viewer out of its artifact image
```

`predev`/`prebuild` run `vendor:viewers` automatically. That used to be a trap — `public/cartridges/`
was committed, so a plain `npm run dev` silently rewrote checked-in files from whatever sibling
checkout happened to be there. It is now **gitignored and comes from a named image**, so the
automatic run writes only ignored files and is inert. `ANTS_REF` overrides which image; a deployment
should pin a published tag.

`docker compose` in `devops/` publishes the built image on the same port 5173. Stop that one
container before `npm run dev`; leave the backend services running.

**There is no test suite, and no test runner to reach for.** A pass is clean oxlint plus a
successful `tsc -b && vite build`. Verification is reading routes against a running stack. The
states the local database cannot reach — a rejected version, a cancelled or failed match, a season
that is not open, a non-participant, duplicate weights — are the ones most likely to be wrong.

TypeScript runs `strict`; `.oxlintrc.json` additionally turns on `no-shadow` and
`react/jsx-no-comment-textnodes`.

## Architecture

### Game and season are selection, not routes

There is no `/games/ants/…` branch. The two dropdowns in the context strip put their choice in the
**query string**, and both parameters are omitted when they are the default (the default game, its
live season) so the ordinary address stays clean and every other state is still linkable.

This spans four files: `App.tsx` declares every route flat; `lib/selection.ts` reads and writes
the query string and builds hrefs that **carry the selection across every link** (picking season 1
on the home page and clicking Leaderboard has to stay in season 1); `providers/platform.tsx`
resolves "no season parameter" into the live season, else the highest-numbered one; `Shell.tsx`
draws the strip. A second game is a row in a dropdown — adding a route branch for one would undo
the whole design.

### Two layers of data fetching, deliberately

- **Contexts above every page** hold what several pages need: `providers/session*` (who you are)
  and `providers/platform*` (game list, selected game, seasons, resolved season). Fetching these
  per page would make the strip flicker on navigation and let two components on one page disagree
  about which season is live. Each is split into a `-context.ts` and a `.tsx` provider so consumers
  import no component and fast refresh keeps working.
- **`lib/useApi.ts` per page** for everything else: a request, three states, a way to ask again. It
  is *not* a cache. Its `key` string is the only thing that decides when to re-fetch; the callback
  is deliberately **not** a dependency (pages build it inline, so depending on it would re-fetch
  forever) and is read through a ref written from an effect.

### The API client

`src/api/client.ts` is the calls, `src/api/types.ts` the response shapes. **The types are
assertions, not validation** — they were read off the `json_build_object` in each Soma workflow's
one query, and TypeScript cannot notice when one changes. `soma/workflows/soma-*.json` is the
authority; compare it when editing.

Two API behaviours the client and pages must keep handling:

- **A refusal is a string, not a code object.** Orion's own failures are `{error: {code, message}}`;
  Soma's deliberate refusals are `{error: "not_a_participant", detail: {…}}`. `ApiError` reads both,
  because flattening the second is how a page loses the ability to say which of three refusals it
  hit. Every refusal is rendered as a sentence naming what happened and what would change it.
- **An unknown model or match id answers 200 with a null body.** `soma-models-get` and
  `soma-matches-get` have no `unknown` task, unlike `soma-profile-get`. `components/Permalink.tsx`
  is the one gate for this: error → `FetchFailed`, loading → skeleton, **null data → `NotFound`**.
  Reading only the status leaves the page loading for ever.

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
- **The weight classes are the season's.** Every cap drawn comes from the season it belongs to —
  `class_max_bytes` on a version, `weight_classes` on a season — never a table in this repository.
  `useWeightClasses()` in `providers/platform-context.ts` is the accessor. A class result is
  comparable within its season and not across seasons.
- **A game introduces itself.** Provenance copy, presets and limits come from the cartridge
  manifest, as plain text that is never inserted as markup.
- **A placeholder is the shape of what replaces it.** Tables load as the same table with the same
  columns, match lists as the same rows, the replay frame is drawn empty at its final height, and
  the home page's top panel holds one height across all three of its states. A skeleton that is not
  the size of its content is a page that jumps when the data lands.

## Styling

`public/design-system/tokens.css` is the source of truth and the one stylesheet `index.html` loads
directly. Dark is the default; `data-theme="light"` on `<html>` swaps the palette, set by
`lib/theme.ts` before first paint.

Every colour is a role, never a literal: `bg`/`surface`/`surface-raised`, `ink`/`muted`,
`accent`/`accent-ink` (the pair travels together), `success`/`warning`/`danger`, `line` for
decorative boundaries (an input's boundary uses `muted`, because it has to stay visible). The
logo's region tokens — `frontal`, `parietal`, `occipital`, `temporal`, `cerebellum`, `stem` — are
also the weight-class hues, mapped at the top of `layout.css`; not for ordinary text.

**Never colour alone**: pills and notes say their state in words, and the colour agrees.

`src/styles/layout.css` holds anything a second page would want; `src/styles/pages.css` holds what
exactly one route draws. A rule that a second route needs moves up. Prefer a named class over an
inline `style` object.

**No native `<select>`.** Its open list is the operating system's menu, in the system's type and
colours whatever the theme. `Select` and `LabelledSelect` in `components/ui/Form.tsx` draw the button
and the listbox from the tokens; a text, number or date field and a textarea take `.input`.

## Where new code goes

`src/lib/` is pure helpers only — anything holding React context belongs in `src/providers/`.
A component drawn on one page stays in that page; one drawn on three or more moves to
`src/components/`, and if it carries no domain meaning, to `components/ui/` (exported through its
barrel, so call sites keep importing from `../components/ui`).
