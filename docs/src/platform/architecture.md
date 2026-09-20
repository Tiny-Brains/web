# How TinyBrains is built

The competitor-facing loop is submit, verify, trial, compete, and review. The
platform separates accepting requests, deciding which games to play, executing
games, and running models so each can operate at a suitable scale.

This chapter is for contributors and local operators. You do not need to deploy
these services to enter a hosted competition.

## The parts

| Part | Responsibility |
|---|---|
| Web | The browser application: sign-in, the leaderboard, matches and replays, submission and upload, and the season's own pages |
| Soma | Public HTTP API, sessions, submissions, seasons, the runner gate and the shared schema — and four clocks: admit, pair, count, and withdraw |
| Kalam | Claim matches, play turns, record results and replays — and, on an admitting runner, run each submission's admission for Soma to judge |
| Ants | Deterministic game cartridge, and its replay viewer |
| Orion's `models` entity | Adapter evaluation and ONNX inference, **inside whichever node needs it** |
| `tinybrains` (the CLI) | The same match loop on a laptop, with no server — for competitors and for checking the ladder's |
| `ants-starter` | The one repository a competitor clones: a working entry, its training script and the trained opponents |

**Soma and Kalam ship no server code.** Each is a package for [Orion](https://github.com/GoPlasmatic/Orion) —
channel and workflow definitions, SQL, connectors and small wasm plugins — and ships as an image
of the Orion server that loads it at boot.

**There is no model-runner service.** A model is a governed entity of the server itself: a row
holding a manifest and an artifact reference — a storage connector, an object key, a `sha256:`
digest — and the node fetches the object, re-hashes it, reads the graph, and serves it from an LRU
session cache under `tract`. Only Kalam runs one: an admitting runner uses it to admit, and every
other replica to play. The Soma node, which serves the site and holds the database owner, never
parses a competitor's model.

Postgres stores versions, seasons, match rows, seats, and rating events. Object storage holds the
two submitted files and the replay blobs. The [repository map](repositories.md) identifies the code
for each component.

## One match table between scheduling and execution

Soma's pair clock inserts a pending match and its seats. Kalam claims that same row,
plays it, and finishes it with results and a replay key. Soma's count clock later counts
the finished result and marks the row rated. The row is both queue item and durable
history; there is no message broker or direct clock-to-Kalam dispatch call.

Claims have leases and tokens, so a lost worker can be recovered and a stale
worker cannot finish someone else's attempt. The clocks' writes use run fences and a
roster epoch to prevent stale scheduling or rating work from changing the field.
These mechanisms protect the competitor's history from duplicate or misattributed
results.

## The clocks

Every competitive decision is made by one of Soma's four cron clocks, and nowhere else. Each runs
as a single instance across Soma's nodes.

| Clock | Every | Decides |
|---|---|---|
| admit | 20 s | Whether an uploaded submission (or an admin's baseline) is admitted: check the upload and the manifest and queue it for an admitting runner, then apply the platform's policy to what that runner reports |
| pair | 15 s | Which matches to queue: a waiting candidate's trial first, then what the ladder's demand asks for, on the season's boards in play |
| count | 10 s | Folds each finished match into ratings, and decides each finished trial: promote or reject |
| withdraw | 60 s | Cancels queued matches that can no longer be played, and closes a season when it has settled |

A clock does its work in SQL against the shared schema. The two wasm plugins hold the arithmetic
that SQL is poor at — `tb.rating` (TrueSkill) and `tb.pairing` (who plays whom) — and decide
nothing the clock does not write. How a version moves through the clocks, as a competitor sees it,
is [The life of a version](../competing/version-life.md); `disabled` is a baseline's state alone,
out of play until an administrator enables it.

## Seasons

A season is created by an administrator for one game, with a window and its rules, and is addressed
by its slug everywhere. Its state follows from its window — scheduled, open, then settling after
submissions close — and the withdraw clock closes it once every score has settled, or when an
administrator asks. Standings stay readable after the close.

**A season's boards and its baselines are uploaded into it, never shipped.** An administrator
uploads a board file, which Soma checks with the season's own engine, and a baseline's two files,
which the admit clock admits like any submission. Both land switched off, and the administrator
turns each on or off until the close. The five basic boards in the Ants release are the envelope
every season's board must fit, so a model admitted today can play any board added later.

See [Seasons](../competing/seasons.md), [The trial](../competing/trial.md) and
[Ranking](../competing/ranking.md) for the rules competitors play under.

## Runners and the runner gate

A Kalam **runner** is one Orion node playing four matches at once, one per lane. It needs no
database password and no bucket secret: it holds a runner key, exchanges it for a short-lived token,
and claims, renews, finishes and releases matches through Soma's **runner gate** (`/v1/runner/*`).
The gate's routes are the claim statements themselves and hold no state, and its database role is
granted only the execution columns. So a runner can sit on a desk anywhere, and the worst a
compromised one can do is play badly. Everything a match is played under — the board, the turn
deadline, the turn limit, how many refusals a seat may make — arrives on the claim, from the
season that owns the match.

## What one entry touches

1. Web or an authenticated client asks Soma to record two hashes. Soma answers with two presigned
   `PUT` URLs, and **the competitor uploads** — nothing on the platform fetches from the internet.
2. Soma's admission clock checks that both files arrived and that the manifest hashes to what was
   declared, rebuilds the registration from it, and queues the version for an admitting runner.
3. An admitting Kalam runner claims it through the runner gate, registers it on its own node,
   runs the node's admission — fetch, re-hash, read the graph, probe it — plays it over the game's
   reference observations, deletes it and reports what it measured. The admission clock applies
   the platform's policy to that report and verifies the candidate, and pair queues its trial.
4. Each Kalam replica's roster clock registers, admits and activates the version **on its own node**,
   from the database. No clock ever calls a replica.
5. Kalam claims one match row and confirms its node can serve every seat's model.
6. Ants produces observations; one `model_infer` per seat adapts, runs and returns tensors; Kalam
   reads the policy head and hands Ants the actions. This repeats until the match ends.
7. Kalam uploads the replay and records the result under its claim token.
8. Soma's count clock counts the result or decides the trial. A trial pass promotes the version;
   later ordinary matches update its ratings.
9. Soma exposes version status, match results, standings, and signed replay reads.

The game state is opaque outside the cartridge. An adapter is submitted data evaluated by the
node's expression engine, not a workflow a competitor uploads. **Tensors never leave the model
call** — with exactly one exception, which is the policy head: a result expression's document is
the output tensors alone, so it cannot gather at a unit's cells, and the gather is a rule of the
game rather than competitor code. Kalam does it.

## Releases and the engine digest

Every repository publishes its own artifact, and nothing generated is committed. **Ants publishes a
GitHub release** — the component, its manifests, the basic boards and the viewer, in one archive
named after the component's digest. Soma, Kalam and Web publish images from a version tag; the CLI
publishes binaries and a Homebrew formula.

**One Ants release is the ladder's engine.** Soma's image declares its digest and judges boards with
it, each runner plays it, the site's viewer and this book re-simulate replays with it, and the
starter kit pins it for competitors. They must agree: a runner on another digest claims nothing,
and a viewer built from another engine draws a plausible match that never happened. So a
deployment under a live season pins the Ants release it was built from, and publishing a new one
is a deployment.

## Deployment and scaling

The local stack hosts Soma — its routes and its clocks — on one Orion instance using shared
Postgres runtime state and Redis. **Each Kalam replica is its own Orion**, single instance, local
state, no cluster block. There are no sidecars.

Sharing scheduler state coordinates Soma's clocks across hosts. Separating Kalam state is what lets
several replicas each play matches instead of contending for one global lock — and it is why a model
is registered on every replica by its own clock rather than pushed to it: a model is a per-node
entity, and the database is what makes the fleet agree.

**One bucket, two addresses.** A competitor's upload is signed for the public endpoint; every node
fetches by the internal one. SigV4 signs the host, so one variable for both is a URL only one side
can use.

Every plugin and cartridge component carries an Ed25519 signature over its digest, minted by
whoever holds the deployment's trust key; a node quarantines the channels that need a component it
cannot verify.

The cloud autoscaler and production rollout pipeline remain future work; Compose is the implemented
deployment path.

## Boundaries to preserve

Only Soma's counting clock writes competitive rating updates. Kalam's database role is restricted to
execution fields, plus a column-level read of the roster that cannot see a verdict or a rating. An
artifact is fetched by digest, so what plays is provably what was admitted. Queued matches can be
withdrawn, but already running matches stay attributed to the versions originally paired. Replays
and match records retain the engine digest and the Orion version needed to investigate outcomes.

When changing any boundary, test its producer and consumer together. A successful
package load or health endpoint does not by itself demonstrate a working admission,
match, or replay loop.
