# web

The TinyBrains browser application: a React 19 / TypeScript SPA built with Vite 8, drawing the
ladder, matches, models, profiles, submission and the admin pages over Soma's `/v1` API. It ships
as one nginx image, `ghcr.io/tiny-brains/web`, that serves the bundle, proxies `/v1` to Soma and
serves the competitor guide at `/docs`. The guide is [`docs/`](docs/README.md), an mdBook with its
own toolchain. It holds no compose file and no deployment settings:
those are in `tinybrains/devops/`, which runs every environment.

## Quick start

The site needs a platform behind it, and **the platform comes up from `tinybrains/devops/`**, which
holds every compose file, every environment's settings and the setup scripts:

```sh
cd ../devops
scripts/setup/init.sh          # writes dev/web/.env, mints this machine's secrets
scripts/setup/trust-keygen.sh  # the Ed25519 trust root plugins are signed with
scripts/setup/sign-plugins.sh
./tb dev web up -d --build     # Postgres, Redis, MinIO, Soma, orion-ui and this site
```

`devops/README.md` is the guide to all of it. Then, for the live-reload loop on this repository:

```sh
npm install
../devops/tb dev web stop web   # free port 5173; leave the rest of the stack up
npm run dev
```

**Two servers want port 5173.** The compose `web` container publishes the baked image there and
`npm run dev` serves live edits there, so stop one before starting the other.


## Development

Node 22.12 or newer on the Node 22 line, and npm.

| Command | What it does | Needs |
|---|---|---|
| `npm ci` | locked install | |
| `npm run dev` | Vite on 5173 (`strictPort`); `predev` runs both vendor scripts first | Soma at `127.0.0.1:8080` |
| `npm run lint` | oxlint | |
| `npm run build` | `tsc -b && vite build`; `prebuild` runs `vendor:viewers` | |
| `npm run vendor:viewers` | fetch each game's replay viewer into `public/cartridges/` | GitHub; offline it keeps what is on disk |
| `npm run vendor:book` | extract the rendered book into `docs/book` if absent (`-- --force` replaces it) | Docker and the `tinybrains/docs:dev` image (`DOCS_REF`); `docker compose build docs` makes it |
| `scripts/og-image.sh` | render `public/og.png` from `scripts/og-image.html` | Chrome |
| `scripts/dev/submission-storm.py` | many competitors submitting end to end against the local stack | the stack, a runner and an admitting runner |

`ANTS_RELEASE` names an ants release tag, or a directory laid out as an ants `dist/`, for
`vendor:viewers`; unset is the latest release.

**Two servers want port 5173.** The compose `web` container publishes the baked image there, and
`npm run dev` serves live edits there. Run `docker compose stop web` before `npm run dev` and leave
the rest of the stack up; both use the same OAuth App.

`npm run dev` is also the book's real preview, at `localhost:5173/docs/`: it serves `docs/book`,
which `mdbook build` in `docs/` (see [docs/README.md](docs/README.md)) or `vendor:book` provides.

**Every word the site shows is in [`copy/`](copy/)**: `common.json` for the header, footer, error
pages and what several pages draw, and one file per page (`home.json`, `submit.json`,
`admin-runners.json`, …). Rewording is an edit there and nothing else; `npm run dev` reloads it.
Keep each `{placeholder}` a text carries, and its light markup: `*italic*`, `**bold**`, `` `code` ``
and `[words](target)`. A misspelt key fails `tsc -b`, and `npm run lint` fails on words typed
straight into a page. What is not in `copy/`: the link-preview title and description (`index.html`
and `nginx.conf`, together), the unfurl image's words (`scripts/og-image.html`), and what the API
or the cartridge sends — notifications, rejection reasons, the game's own story.

**A new public route is three edits, not one.** `App.tsx` routes it; `scripts/sitemap.mjs` offers it
to a search engine; `nginx.conf` gives it an unfurl title and description, and — if it is a new
first path segment — a line in `$spa_unknown`, without which it answers 404 to every crawler while
rendering perfectly for you. `CLAUDE.md`'s *What a crawler gets* is the whole of it.

## Checks

```sh
npm run lint                  # clean oxlint
npm run build                 # type-check and bundle
scripts/check/configs.sh      # values that must agree across soma, kalam and this compose file
(cd docs && mdbook build)     # the book: a SUMMARY entry without a file fails
```

`.github/workflows/check.yml` runs oxlint, `tsc -b`, `vite build` and `nginx -t` over `nginx.conf`
on every push. `configs.sh` reads `../soma` and `../kalam`, and the engine out of the images the
stacks run (`SOMA_IMAGE` and `WEB_IMAGE` from this `.env`, `KALAM_IMAGE` from kalam's, or the
environment) and out of `../ants-starter/games.toml`, and fails when they are not one engine.

There is no test suite. Read the routes against a running stack, at desktop width and at a real
390px. The states the local database cannot reach (a rejected version, a cancelled or failed match,
a season that is not open, a non-participant) are the ones most likely to be wrong.

## Configuration

**This repository configures an image, not a deployment.** What the image takes at build time is
`Dockerfile`'s `ARG`s (`ANTS_RELEASE`, the book context); what it takes at run time is nothing —
the bundle knows no host, and there is no runtime environment-variable interface. `nginx.conf` is
the one piece of configuration that ships inside it, and it is the `/v1` proxy contract with
`vite.config.ts`: change them together and re-check redirects and `Set-Cookie`.

**Everything else — compose files, the Caddy edge, the console's nginx template, every `.env`, the
setup scripts, production and the QA stack beside it — is in `tinybrains/devops/`**, with the
environments it belongs to. It left this repository because it is deployment: it is never released,
never committed, and one copy of it serves three environments.

| To | Read |
|---|---|
| run anything, anywhere | `devops/README.md` |
| bring up production | `devops/README.md`, and `devops/examples/web.prod.env.example` |
| stand up a QA stack beside it | the same, plus `devops/examples/web.qa.env.example` |
| point a runner at either | `kalam/README.md`, *Run a runner* |


## Releasing

Push a `v<major>.<minor>.<patch>` tag on main. `.github/workflows/release.yml` resolves one ants
release (the latest, or the repository variable `ANTS_RELEASE`), builds the book from `docs/` with
it, builds the application for linux/amd64 and linux/arm64, checks both platforms serve identical
files, and publishes `ghcr.io/tiny-brains/web` labelled with the ants release.
`gh workflow run release.yml` rehearses it without pushing.

The book's lessons are played by the `tinybrains` release pinned as `CLI_VERSION` in
`docs/Dockerfile`, not the latest CLI. Changes a competitor can see get an entry in
`copy/changelog.json`'s `entries`, which `/changelog` draws and `/feed.xml` is built from.

## Layout

```text
src/main.tsx, src/App.tsx   entry point; every route, flat, and the lazy split
src/api/                    client.ts (every Soma call), types.ts (response shapes), shape.ts (dev-only drift check)
src/pages/                  one file per route
src/components/             the shell and anything two or more pages draw
src/components/ui/          the kit: layout, data, nav, form, feedback, icons
src/providers/              session, platform (game and season) and notifications contexts
src/lib/                    pure helpers: selection, formatting, theme, useApi, usePopover, upload
src/styles/                 base.css, shell.css, components.css, pages.css
copy/                       every word the site shows: common.json, and one file per page
copy/changelog.json         what's new, for /changelog and /feed.xml
public/design-system/       tokens.css, the palette and scale, loaded by index.html
public/logo-circuit*.svg    the logo, dark and light; also the favicons
public/og.png               the link-unfurl card, rendered by scripts/og-image.sh
public/cartridges/          replay viewers from each game's release (gitignored)
cartridges.json             which games' viewers to serve, and the repository each releases from
vite.config.ts              dev server, /v1 proxy, /docs from docs/book, feed and sitemap
scripts/sitemap.mjs         the sitemap's one generator: routes here, chapters from the book
nginx.conf                  image serving, /v1 proxy, unfurl and canonical rewrites, CSP; nginx-security.conf headers
public/robots.txt           what to crawl, and where the sitemap is
Dockerfile                  ants release -> node build -> nginx, with the book from the `book` context
scripts/setup/              init.sh and the admin key, trust key and signatures it makes; admin-user.sh
scripts/dev/                resync-dev-schema, submission-storm, registry.toml
scripts/check/configs.sh    cross-repo value checks
scripts/vendor-*.sh         the viewer and the rendered book, for the dev loop
docs/                       the competitor guide (mdBook); see docs/README.md
.github/workflows/          check.yml on every push, release.yml on a v* tag
```

## Invariants

- **API calls use the page's own `/v1` origin.** Anything else needs CORS with credentials, which
  Orion's `access-control-allow-origin: *` rules out, and the session cookie is lost.
- **`vite.config.ts` and `nginx.conf` are one contract.** Change them together and re-check the
  OAuth redirect and `Set-Cookie`, or sign-in breaks in one server only.
- **Soma decides whether a session is valid.** The app asks `/v1/me`; it stores no token.
- **Sign-in is a full-page navigation**, never a fetch, so the OAuth redirect reaches the cookie jar.
- **No secret enters the bundle.** Every build-time value is public.
- **`/docs` is never an SPA route.** nginx and the dev server answer it; every link to it is a plain `<a>`.
- **No rule of any game lives here.** The replay is the cartridge's viewer; a re-implemented rule is
  a second engine that disagrees silently.
- **The viewer must be the engine the ladder plays.** Kalam, Soma and this image each take the latest
  ants release or `ANTS_RELEASE`; a viewer on another engine draws a plausible match that never happened.
- **Game and season are query-string selection, not routes**, and a season is addressed by its slug.
- **Weight-class caps and board limits come from the API** (the season, the cartridge manifest),
  never from a table here.
- **`index.html`'s title and description tags and nginx's `sub_filter` lines match on exact text.**
  Change one without the other and every page unfurls with the default text.

## Troubleshooting

| Symptom | Check |
|---|---|
| Sign-in loops or returns signed out | you began on `127.0.0.1` and finished on `localhost` (use `localhost`); the OAuth callback; `SOMA_COOKIE_SECURE`; the session secret |
| Edits do not show on 5173 | the compose `web` container is answering: `docker compose stop web`, then `npm run dev` |
| `/docs` is the not-found page in the dev loop | no `docs/book`: `npm run vendor:book`, or `mdbook build` in `docs/` |
| A replay says the viewer is unavailable | `public/cartridges/` is empty: `npm run vendor:viewers` |
| Candidate stays `testing` | an admitting runner is up (`--profile admit` in `kalam/`) and its log has no `orion_version_differs`; both objects are in the models bucket; the reference observations are registered; the admit clock |
| Rejected `ARTIFACT_MISSING` | the upload step: nothing is fetched from a release, the competitor PUTs to a presigned URL |
| Candidate stays `verified` | the season has a board in play that its enabled baselines can seat; the trial; the pair clock |
| Pending matches never run | a runner is up with a live key, and its engine digest equals the one `soma-bootstrap` declared |
| The runner logs `invalid_key` | the key was minted on another database: mint one on this one |
| Every match is released unplayed | the runner's `kalam-roster` clock, and whether its node has the seat's model `active` |
| Models cannot load | the bucket's addresses: uploads are signed for the public one, Soma dials the internal one, a runner uses `host.docker.internal`; and the read key |
| Matches play but never finish | the runner's `RUNNER_BLOB_ENDPOINT` must equal Soma's, character for character |
| Results exist, ratings do not move | the count clock; whether the match was an unrated trial |
| A node stops on a quarantined channel | a stale plugin signature: re-run `devops/scripts/setup/sign-plugins.sh` after any new image |

## Known gaps

- There is no automated test suite, and the states the local database cannot reach (see Checks) have not been read against real data.
- Notifications never reach a closed browser: that needs Web Push (a service worker, VAPID keys and a sender).
- `lib/useLadderHeads.ts` reads each ladder's head with its own `limit=1` request; a Soma route answering every head at once would replace them.
- The sign-in failure page cannot say which failure happened: nginx sees only Soma's fixed 401.
- `docs/tutorials/replays/real-match.json` is on engine `engine-cd656bc84c1a`, and the published
  images now carry `engine-819166e79181`, so the book's digest check fails its build until someone
  re-captures the file. Capturing it needs a stack on the current images and a minted session.
- `nginx.conf` assumes Docker's resolver, so the site runs under Compose only.
- A newly named season admin's menu and guide links appear after a session refresh; the season
  desk itself re-reads `/v1/me` on entry.
- Re-entry is offered on the model page only, not on the profile desk.
- **Every replay is drawn by the one viewer the image vendors**, the latest ants release's, whatever
  engine played it. Replays are kept for ever, and a match on an older engine decodes identically
  only while no release changes what a replay means: season 1's (`engine-cd656bc84c1a`) do under
  `engine-819166e79181`, checked frame by frame. Before the next engine release reaches production,
  the site must keep each engine's viewer and pick it by the match's `engine_digest`, or old
  replays draw plausible matches that never happened, with no error.

## Credits

The mark is **derived from “Ai Brain” by Rizqi Auliya, from
[The Noun Project](https://thenounproject.com/icon/ai-brain-7276116/), under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)**, so the attribution is a licence term,
not a courtesy. It is carried in three places, and all three move together:
[`src/pages/Credits.tsx`](src/pages/Credits.tsx), which serves it at `/credits`, and a comment in
each standalone SVG, which travel alone as the favicons and would otherwise reach a reader with no
attribution at all.

Both logo variants, [dark](public/logo-circuit.svg) and [light](public/logo-circuit-light.svg), are
the same `0 0 100 100` geometry as [`src/components/Logo.tsx`](src/components/Logo.tsx), which draws
it from the tokens and so follows the theme. A standalone SVG is its own document and cannot read a
custom property, which is the only reason a file per theme exists; edit the three together. Keep
the full viewBox for clear space, preserve the aspect ratio, and don't go below about 32px wide. The
file names are linked from outside this repository, so don't rename them.

## License

Apache-2.0: see [LICENSE](LICENSE).
