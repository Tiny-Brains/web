# web

The TinyBrains browser application: a React 19 / TypeScript SPA built with Vite 8, drawing the
ladder, matches, models, profiles, submission and the admin pages over Soma's `/v1` API. It ships
as one nginx image, `ghcr.io/tiny-brains/web`, that serves the bundle, proxies `/v1` to Soma and
serves the competitor guide at `/docs`. The guide is [`docs/`](docs/README.md), an mdBook with its
own toolchain. This repository also holds the local platform's `docker-compose.yml`.

## Quick start: the local platform

You need Docker Engine with Compose v2.21 or newer, a POSIX shell and `openssl`. Everything runs
from this repository's root; a runner comes from a [Kalam](https://github.com/Tiny-Brains/kalam)
checkout beside it.

```sh
./scripts/setup/init.sh               # .env, every secret it can mint, the trust key, signatures
docker compose up -d --build          # the stack
docker compose logs soma-bootstrap soma
```

`init.sh` is idempotent, so it is also the repair command after a new image. It:

- creates `.env` from `.env.example`;
- mints `POSTGRES_PASSWORD`, `SOMA_SESSION_SECRET`, `RUNNER_TOKEN_SECRET` and
  `MODELS_READ_SECRET_KEY`;
- pins `SOMA_IMAGE` to the newest published Soma release, and prints the Kalam and web releases to
  pin beside it (compose refuses to start without `SOMA_IMAGE`: `:latest` is whatever this machine
  pulled last);
- mints `ORION_ADMIN_KEY` (`scripts/setup/admin-key.sh`);
- generates the Ed25519 plugin trust root, `keys/tinybrains-dev.pem`, and writes its public half as
  `TB_TRUST_PUBLIC_KEY` (`scripts/setup/trust-keygen.sh`);
- signs every plugin in the Soma image, and in a Kalam image if one is present, into
  `keys/signatures/` (`scripts/setup/sign-plugins.sh`).

**The GitHub OAuth App is the one thing it cannot mint.** Register one with homepage
`http://localhost:5173` and callback `http://localhost:5173/v1/auth/github/callback`, then put
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`. Compose refuses to start without them.

| Service | Port (loopback) | What it is |
|---|---|---|
| `web` | 5173 | this image: the SPA, the `/v1` proxy and the book at `/docs` |
| `soma` | 8080 | the Soma node image (`SOMA_IMAGE`, pinned by `init.sh`) |
| `orion-ui` | 8081 | the Orion console, gated on Soma's `/v1/admin-check` |
| `minio` | 9000, 9001 | the replay and models buckets |
| `db`, `redis` | none | Postgres 16 and Redis |
| `buckets`, `soma-bootstrap` | none | one-shots: the buckets and read key; the schema, game and cartridge |
| `docs` | none | never started: built so `web` can copy the rendered book in |

Open `http://localhost:5173` (not `127.0.0.1`: the session cookie is host-only), sign in once,
then:

```sh
scripts/setup/admin-user.sh <github-login>   # SOMA_ADMIN_GITHUB_IDS in .env: an admin at every sign-in
```

It looks the login up once and keeps only the numeric GitHub id, which never changes hands the way a
login can. Everyone else is made an admin, or stops being one, on the **Users** admin page.

The stack starts with no season. Everything else an admin makes is made on the admin pages, as in
production: create a season, upload its boards and baselines and switch them on, and mint a runner
key on the Runners page. Nothing is paired until the season has a board and a baseline in play. Any
board files will do: `tinybrains maps export ants <dir>` writes the five basic boards, and
`../ants-starter/models` holds three baselines.

**Start a runner.** No match is played inside this stack. In `kalam/`, copy `.env.example` to
`.env`, uncomment its local block (every address is `host.docker.internal`), and fill in
`RUNNER_KEY`, `TB_TRUST_PUBLIC_KEY` and the `MODELS_READ_*` pair from this `.env`, with
`RUNNER_SIG_DIR=../web/keys/signatures`, and `KALAM_IMAGE` with the release `init.sh` printed.
Then, in `kalam/`:

```sh
docker compose up -d
docker compose logs -f runner   # ==> loaded: tb.ants is live and 3 channels are active, this node can claim
```

The runner and Soma must be built from the same ants release: a runner on another engine digest
claims nothing and looks healthy doing it. Kalam's README, section *Run a runner*, covers a runner on
another machine.

**Running a release of web too.** Unset, `WEB_IMAGE` builds this checkout. To serve a published one,
set `WEB_IMAGE=ghcr.io/tiny-brains/web:<version>` and run `docker compose pull && docker compose up -d
--no-build`. Never `--build` with a release named: `web` has a build section, so compose would build
this checkout and tag it as the release.

**Trying a sibling change.** A Soma checkout: `docker build -t tinybrains/soma:dev ../soma &&
SOMA_IMAGE=tinybrains/soma:dev docker compose up -d`. An unreleased engine: build with
`--build-context ants=../ants/dist`; a machine-local, gitignored `docker-compose.override.yml` can
make that the default for `soma`, `docs` and `web`. Re-run `scripts/setup/sign-plugins.sh` after
any new Soma or Kalam image.

**Stopping and resetting.** `docker compose stop` keeps the volumes. `soma-bootstrap` applies the
migrations only to an empty database and refuses a rewritten schema; `scripts/dev/resync-dev-schema.sh`
rebuilds the schema and keeps users and sessions.

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
| `scripts/dev/submission-storm.py` | many competitors submitting end to end against the local stack | the stack, a runner |

`ANTS_RELEASE` names an ants release tag, or a directory laid out as an ants `dist/`, for
`vendor:viewers`; unset is the latest release.

**Two servers want port 5173.** The compose `web` container publishes the baked image there, and
`npm run dev` serves live edits there. Run `docker compose stop web` before `npm run dev` and leave
the rest of the stack up; both use the same OAuth App.

`npm run dev` is also the book's real preview, at `localhost:5173/docs/`: it serves `docs/book`,
which `mdbook build` in `docs/` (see [docs/README.md](docs/README.md)) or `vendor:book` provides.

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

## Configuration and deployment

**The bundle has no runtime configuration and no secrets.** `.env` configures the compose stack
only; Vite exposes only `VITE_*` names to the bundle, and there are none. Ports, origins, DNS and
upstreams are deployment settings, and credentials live on Soma.

The main `.env` settings (`.env.example` documents each one):

| Name | What it sets |
|---|---|
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | the OAuth App; yours to register |
| `POSTGRES_PASSWORD`, `SOMA_SESSION_SECRET`, `RUNNER_TOKEN_SECRET`, `ORION_ADMIN_KEY`, `TB_TRUST_PUBLIC_KEY`, `MODELS_READ_SECRET_KEY` | minted by `init.sh` |
| `SOMA_IMAGE`, `WEB_IMAGE` | which images run: Soma's is required (`init.sh` pins it); web's unset builds this checkout |
| `ANTS_RELEASE` | the ants release the book and the viewer are built from; latest if unset |
| `SOMA_COOKIE_SECURE` | `0` for plain http on localhost, `1` behind TLS |
| `APP_URL`, `OAUTH_REDIRECT_URI`, `CONSOLE_URL` | the browser-facing addresses sign-in returns to |
| `RUNNER_BLOB_ENDPOINT` | the replay-store address a runner dials; must equal the runner's own |
| `R2_*`, `MODELS_BUCKET`, `MODELS_PUBLIC_ENDPOINT` | the object store and the address uploads are signed for |
| `SOMA_TRUSTED_PROXIES`, `SOMA_CACHE_REDIS_URL`, `SEASON_GAP_DAYS`, `ENGINE_RELEASE` | Soma's proxy trust, response cache, season gap, and whether a new engine is a release |

**The `/v1` proxy is what makes sign-in work.** Soma sets `soma_session` with no Domain attribute,
so the cookie belongs to whichever host the browser thinks answered. Both servers proxy `/v1` on the
page's own origin and must pass redirects and `Set-Cookie` through untouched:

| | Development | Image |
|---|---|---|
| Configuration | `vite.config.ts` | `nginx.conf` |
| Upstream | `http://127.0.0.1:8080` | `http://soma:8080`, a variable resolved per request |
| Redirects | `followRedirects: false` | `proxy_redirect off; proxy_intercept_errors off` |
| Sign-in failure | passed through | Soma's 401 at the callback becomes `/signin/callback?error=incomplete` |
| Static files | the Vite dev server | SPA fallback; immutable hashed assets; `index.html` uncached |
| `/docs` | `docs/book` | the book baked into the image |

Check it with `curl --fail --silent --show-error http://localhost:5173/v1/games`.

What a deployment owes the image:

| Setting | Owner | If it is wrong |
|---|---|---|
| `/v1` upstream | `vite.config.ts`, `nginx.conf` | API requests fail, usually as a proxy 502 |
| DNS resolver | `nginx.conf` (`127.0.0.11`, Docker's) | another environment needs its own resolver line |
| Browser origin | the listener or ingress | OAuth returns to a different host and the cookie is lost |
| `app_url`, `oauth_redirect_uri` | Soma's config | the sign-in round trip does not complete |
| OAuth callback | the GitHub OAuth App | must equal Soma's redirect URI exactly |
| `cookie_secure` | Soma's config | false for local http, true behind TLS |
| `application/wasm` for `.wasm` | the serving layer's MIME table | no replay draws; nginx's own `mime.types` already maps it |
| `connect-src` | `nginx.conf`'s Content-Security-Policy | allows any http(s) origin, because replays come from the bucket's public endpoint; narrow it to that origin |

## Releasing

Push a `v<major>.<minor>.<patch>` tag on main. `.github/workflows/release.yml` resolves one ants
release (the latest, or the repository variable `ANTS_RELEASE`), builds the book from `docs/` with
it, builds the application for linux/amd64 and linux/arm64, checks both platforms serve identical
files, and publishes `ghcr.io/tiny-brains/web` labelled with the ants release.
`gh workflow run release.yml` rehearses it without pushing.

The book's lessons are played by the `tinybrains` release pinned as `CLI_VERSION` in
`docs/Dockerfile`, not the latest CLI. Changes a competitor can see get an entry in
`src/changelog.ts`, which `/changelog` draws and `/feed.xml` is built from.

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
src/changelog.ts            what's new, for /changelog and /feed.xml
public/design-system/       tokens.css, the palette and scale, loaded by index.html
public/logo-circuit*.svg    the logo, dark and light; also the favicons
public/og.png               the link-unfurl card, rendered by scripts/og-image.sh
public/cartridges/          replay viewers from each game's release (gitignored)
cartridges.json             which games' viewers to serve, and the repository each releases from
vite.config.ts              dev server, /v1 proxy, /docs from docs/book, feed and sitemap
nginx.conf                  image serving, /v1 proxy, unfurl rewrites, CSP; nginx-security.conf headers
Dockerfile                  ants release -> node build -> nginx, with the book from the `book` context
docker-compose.yml          the local platform
compose/orion-ui/           the console's nginx template, gated on /v1/admin-check
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
| Candidate stays `testing` | both objects are in the models bucket; the reference observations are registered; the admit clock |
| Rejected `ARTIFACT_MISSING` | the upload step: nothing is fetched from a release, the competitor PUTs to a presigned URL |
| Candidate stays `verified` | the season has a board in play that its enabled baselines can seat; the trial; the pair clock |
| Pending matches never run | a runner is up with a live key, and its engine digest equals the one `soma-bootstrap` declared |
| The runner logs `invalid_key` | the key was minted on another database: mint one on this one |
| Every match is released unplayed | the runner's `tb-roster` clock, and whether its node has the seat's model `active` |
| Models cannot load | the bucket's addresses: uploads are signed for the public one, Soma dials the internal one, a runner uses `host.docker.internal`; and the read key |
| Matches play but never finish | the runner's `RUNNER_BLOB_ENDPOINT` must equal Soma's, character for character |
| Results exist, ratings do not move | the count clock; whether the match was an unrated trial |
| A node stops on a quarantined channel | a stale plugin signature: re-run `scripts/setup/sign-plugins.sh` after any new image |

## Known gaps

- There is no automated test suite, and the states the local database cannot reach (see Checks) have not been read against real data.
- Notifications never reach a closed browser: that needs Web Push (a service worker, VAPID keys and a sender).
- `lib/useLadderHeads.ts` reads each ladder's head with its own `limit=1` request; a Soma route answering every head at once would replace them.
- The sign-in failure page cannot say which failure happened: nginx sees only Soma's fixed 401.
- The `--stem` token is declared in `tokens.css` and used by nothing.
- `docs/tutorials/replays/real-match.json` was captured on a local engine build, not a released
  one: until it is re-captured on the next ants release's engine, the book builds only against that
  local `dist/`.
- There is no production deployment yet: the orchestrator is undecided, and `nginx.conf` assumes Docker's resolver.

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
