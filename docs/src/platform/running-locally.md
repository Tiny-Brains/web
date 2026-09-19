# Running the platform locally

The local stack lets you exercise submission, admission, trials, matches, and
rankings together. It is not how you play an entry locally — `tinybrains` does that with no
Compose, no database and no season, and [Testing before you submit](../models/testing.md) is the
page for it. Bring the stack up when you want the *loop*: a submission that is admitted, given a
trial, promoted, paired and rated.

## What you need

Install **Docker Engine with Compose v2.21 or newer** and a POSIX shell. Two checkouts, and each
runs one compose file:

```text
web/      the platform: Postgres, Redis, MinIO, Soma, the Orion console and the site
kalam/    a runner: the one container that plays matches for a Soma
```

**Every service is an image its own repository publishes.** Soma is `ghcr.io/tiny-brains/soma` —
orion-server with the Soma package inside, which applies the schema and loads its own package — and
Kalam is `ghcr.io/tiny-brains/kalam`, a runner that loads its own. The cartridge is not an image at
all: each of them, and the site's viewer, is built from an [Ants release](https://github.com/Tiny-Brains/ants/releases).
To try a Soma change, build that checkout and set `SOMA_IMAGE`; a Kalam or web change is `--build`
in its own checkout.

The stack uses the pinned Orion **1.8.1** runtime, Postgres 16, Redis, MinIO, and the browser
application. **There is no inference sidecar**: each node runs models itself. Host Rust is not
required.

## Configure the platform

From `web/`, one command does every credential:

```sh
./scripts/setup/init.sh
```

It creates `.env`, mints `POSTGRES_PASSWORD`, `SOMA_SESSION_SECRET`, `RUNNER_TOKEN_SECRET`, the
models read key and `ORION_ADMIN_KEY`, generates the Ed25519 plugin trust root for this machine, and
signs the plugins in the Soma image (and in a Kalam image, when one is here). It is idempotent, so it
is also the repair command after a new image — an unsigned component comes up quarantined, not
broken in a way that names itself. `.env.example` is the contract it fills.

Register a GitHub OAuth App with homepage `http://localhost:5173` and callback
`http://localhost:5173/v1/auth/github/callback`, and set `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET` in `.env`. Plain HTTP development uses a non-Secure cookie; HTTPS deployments
require their corresponding cookie policy.

## Bring it up

```sh
docker compose up -d --build
docker compose ps -a
docker compose logs soma-bootstrap soma
```

Two one-shots run before Soma. **`buckets`** makes the replay and models buckets, the models read
key and `models/*`'s public read. **`soma-bootstrap`** creates the Orion state database, applies
Soma's migrations when the platform database is empty, applies the seed on every run, and registers
the cartridge and engine digest its image was built with — it records a digest of the migrations it
applied and refuses a schema rewrite it cannot apply. **`soma`** then loads its own package and stops
if a plugin did not verify, so a node that is up is a node that serves.

Open `http://localhost:5173`, or verify the proxy:

```sh
curl --fail --silent --show-error http://localhost:5173/v1/games
```

Local host ports: Web at 5173, Soma at 8080, the Orion console at 8081, MinIO at 9000/9001. They bind
to loopback. For application requests and sign-in, use the browser origin consistently.

## Start a runner

Nothing in the platform plays a match: a runner does, from Kalam's checkout, and it reaches the
platform only through Soma. Sign in once, make yourself an administrator, and mint it a key:

```sh
./scripts/dev/grant-admin.sh <your-handle>     # from web/
./scripts/dev/runner-key.sh <your-handle>      # prints the key once
```

In `kalam/`, copy `.env.example` to `.env`, uncomment its local block (every address is
`host.docker.internal`), and fill in the key, `TB_TRUST_PUBLIC_KEY` and the `MODELS_READ_*` pair from
web's `.env`, and `RUNNER_SIG_DIR=../web/keys/signatures`. Then:

```sh
docker compose up -d --build
docker compose logs -f runner     # "loaded: tb.ants is live and 5 channels are active"
```

The runner and Soma must be built from the same Ants release: a runner whose engine digest is not the
one Soma declared claims nothing, for ever, and looks healthy doing it.

## Sign in and make a match happen

Sign in with GitHub at `http://localhost:5173` — `localhost`, not `127.0.0.1`: the sign-in cookie is
host-only — then submit through the site's own `/submit` form. It creates the model if you have
none, hashes both files and uploads them itself; the upload commands appear only if a transfer
fails. A game needs an open local season **with a board in play**, an eligible account, a runner, and at least
one runnable opponent for the trial and regular matches.

**The seeded season has no boards.** A season's boards are uploaded, never shipped: an administrator
adds them on the season's page, or `scripts/dev/upload-maps.sh <dir> <season-slug>` uploads a
directory of board files through the same route and puts each in play. Any board file will do —
`tinybrains maps export ants <dir>` writes the five basic boards the release ships, and
`tinybrains maps check` says whether a board of your own would be accepted. Until one is in play,
nothing is paired and a candidate waits in `verified`.

**Nor any baselines.** The platform ships no model: a season's baselines are uploaded into it, by an
administrator on the season's page — a name and its two files — or by
`scripts/dev/upload-baselines.sh ../ants-starter/models <season-slug>`, which uploads each model
directory under its own name through the same route, waits for admission and switches each one on.
A baseline is admitted exactly as a submission is and lands switched off. A candidate that sits in
`verified` for ever is one whose trial has no baseline to seat: check the season's page for a
baseline in play. The same files under a second name are a second opponent, which is how a trial on
a board of many seats finds enough of them.

Season creation requires an administrator account; `scripts/dev/grant-admin.sh` is the local way to
get one. Follow the submitted model's phase, its trial ID, then its finished match history and
leaderboard entry. This is stronger evidence of a working stack than a successful health probe.

## Reloading and stopping

A package edit is a new image: rebuild it, and the node loads it on start.

```sh
docker build -t tinybrains/soma:dev ../soma && SOMA_IMAGE=tinybrains/soma:dev docker compose up -d
./scripts/setup/sign-plugins.sh     # after any new Soma or Kalam image
```

Loading a package does not apply schema migrations. `soma-bootstrap` applies them only when the
platform database is **empty** — the schema is pre-release and `0001_init.sql` is rewritten in place
rather than extended — so it refuses a rewrite rather than surfacing it later as a missing relation.
`./scripts/dev/resync-dev-schema.sh` rebuilds a local database on the new schema and keeps the
accounts and sessions.

Stop services with `docker compose stop`. A runner is configured to drain, but a forced shutdown can
still require claim recovery. Avoid deleting volumes unless you intend to discard local history.

## When nothing plays

| Symptom | Check |
|---|---|
| Sign-in loops or returns unauthenticated | Browser origin, OAuth callback, cookie policy, and session secret |
| Candidate stays testing | Whether both objects are actually in the models bucket, registered reference observations, the admission clock |
| Rejected `ARTIFACT_MISSING` | The upload step. Nothing fetches from a release — the competitor PUTs to a presigned URL |
| Candidate stays verified | Whether the season has a board in play that its baselines can seat, then the latest trial status and the pairing clock |
| Pending matches never run | A runner is up and its key is live; its engine digest equals the one `soma-bootstrap` declared |
| The runner logs `invalid_key` | The key was minted on another database: mint one on this one |
| Every match is released without playing | The runner's `tb-roster` clock, and whether its node has the seat's model `active` |
| Models cannot load | The bucket's addresses — an upload is signed for the public one, Soma dials the internal one, a runner uses `host.docker.internal` — plus the read key |
| Matches play but cannot finish | The runner's `RUNNER_BLOB_ENDPOINT` must equal Soma's, character for character |
| Results exist but ratings do not move | Counting clock; confirm the match is not an unrated trial |
| A node stops with a quarantined channel | The component's Ed25519 signature. Re-run `./scripts/setup/sign-plugins.sh` after any new image |

Use `docker compose logs` for the relevant service and keep model/match IDs in reports. A cloud
deployment, TLS ingress, live R2 verification, and autoscaling are separate work from this local
setup.
