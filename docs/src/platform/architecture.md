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
| Soma | Public HTTP API, sessions, submissions, seasons, and shared schema — and four clocks: admit, pair, count, and withdraw |
| Kalam | Claim matches, play turns, record results and replays |
| Ants | Deterministic game cartridge |
| Orion's `models` entity | Adapter evaluation and ONNX inference, **inside whichever node needs it** |
| DevOps | Assemble packages, runtime configuration, stores, and local deployment |

**There is no model-runner service.** A model is a governed entity of the server itself: a row
holding a manifest and an artifact reference — a storage connector, an object key, a `sha256:`
digest — and the node fetches the object, re-hashes it, reads the graph, and serves it from an LRU
session cache under `tract`. The soma node uses it to admit; each Kalam replica uses it to play.

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

## What one entry touches

1. Web or an authenticated client asks Soma to record two hashes. Soma answers with two presigned
   `PUT` URLs, and **the competitor uploads** — nothing on the platform fetches from the internet.
2. Soma's admission clock registers the version on its own node from the uploaded manifest and an
   artifact reference, then runs the node's admission: fetch, re-hash, read the graph, probe it.
3. The admission clock applies the platform's policy to what the node measured, probes the
   manifest over the game's reference observations, verifies the candidate and queues its trial.
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
