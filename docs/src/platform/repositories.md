# The repositories

TinyBrains is developed as sibling repositories. For ordinary model competition,
your own model repository is separate from all of these. Use this map when you
need to inspect implementation behavior or contribute a platform change.

## The six application repositories

These are the parts of the running platform.

| Repository | Owns | Start reading |
|---|---|---|
| [Soma](https://github.com/Tiny-Brains/soma) | API, authentication, schema, season administration | `channels/`, `workflows/`, `migrations/` |
| [Jodi](https://github.com/Tiny-Brains/jodi) | Admission, pairing, rating, and version lifecycle | `scripts/gen-jodi.py`, `plugins/` |
| [Kalam](https://github.com/Tiny-Brains/kalam) | Match execution, claims, strikes, and replay upload | `scripts/gen-kalam.py` |
| [Ants](https://github.com/Tiny-Brains/ants) | Game rules, generation, observations, replay reconstruction | `src/turn.rs`, `src/observe.rs`, `src/map.rs`, `src/replay.rs` |
| [Web](https://github.com/Tiny-Brains/web) | Browser application and typed API client — **and this book**, in its `docs/` | `src/api.ts`, application components, proxy configuration, `docs/` |
| [DevOps](https://github.com/Tiny-Brains/devops) | Local topology, runtime templates, registration, package loading, and the `tinybrains` CLI | `docker-compose.yml`, `compose/orion/`, `compose/loader/run.sh`, `cli/` |

## The three you can read as a competitor

Nothing here runs in the platform, and all three are written for you rather than about you.

| Repository | What it is |
|---|---|
| [ants-starter](https://github.com/Tiny-Brains/ants-starter) | **A working nano entry that admits unchanged**, its generated manifest, and `train.py`, the one command that retrains it. The place to start |
| [Drill](https://github.com/Tiny-Brains/drill) | Practice: match files, sample models, and the board catalogue as the engine ships it, to run `tinybrains` against. Contains no code |
| [ants-baselines](https://github.com/Tiny-Brains/ants-baselines) | The platform's own trained entries and how they were trained — a competitor repository the platform happens to own. `src/tb_baselines/planes.py` is where the [walkthrough](../models/adapters/walkthrough.md) reads its manifest from |

> **There is no model-runner repository.** `axon` was one until 15 September 2026; Orion's own
> `models` entity replaced it whole, so ONNX loading, the expression language and the operation
> budget are the *server's* now rather than a service this platform maintains.
> [The archived repository](https://github.com/Tiny-Brains/axon) maps each call it answered to what
> answers it today.

## Which repository owns a change?

A rule or observation change belongs in Ants, with matching competitor docs and adapter
compatibility checks. **An evaluator operator or operation-count change belongs upstream**, in
datalogic — it is not this platform's to make, which is why the operator reference points at what
the engine has rather than at a list somebody here maintains. A submission check can span Soma's
request contract, Jodi's verdict, and the facts the node reports; identify each responsibility
before editing.

Match execution and result persistence belong in Kalam; rating math and opponent
selection belong in Jodi. Database definitions always originate in Soma even
when Jodi or Kalam is the consumer. Deployment addresses and secret wiring belong
in DevOps rather than embedded in package definitions.

## Generated artifacts ship as images, not as commits

**Nothing generated is committed.** Since 10 September 2026 each repository's build output — Ants'
`tb-ants.wasm`, `cartridge.json` and viewer bundle; Jodi's and Kalam's generated channels and
workflows and their wasm plugins — is carried in an **artifact image** that repository's
`Dockerfile` builds, and a consumer names an image rather than reading a sibling checkout. Jodi and
Kalam still keep readable Python generators, and those are still what you run while working in
them; they are simply no longer what ships.

**Kalam does not vendor the cartridge.** It used to hold a committed copy, so two copies of one
component existed and could drift silently — and did. Kalam's image now takes the component from
Ants' image, so `ANTS_REF` alone decides which engine the ladder plays, and rebuilding Ants *is*
what moves it. Because a rebuild changes the digest, a deployment should pin `ANTS_REF` rather than
track `:dev`: a digest that moves under a live season leaves every queued match unclaimable.

Every plugin also needs a valid Ed25519 signature over its digest, which the deployment mints
because it holds the trust key. Re-sign after any plugin or engine rebuild or the node comes up
degraded with its channels quarantined.

**No checkout is required to run the stack.** [Running locally](running-locally.md) gives the
commands; sibling checkouts are only where the images are built from by default.

## What is not supplied yet

A cloud autoscaler and a finished production rollout pipeline are not in these repositories;
Compose is the implemented deployment path.

Three things this section used to list as missing now exist, and are worth knowing about: the
standalone match runner is [`tinybrains`](../models/testing.md), which plays a model against a
model with no server; the replay viewer is the cartridge's own and is what plays every match on
this page and on the site; and a training loop can drive the real engine through
[`tinybrains env`](../models/testing.md#train-against-the-real-engine) instead of a second
implementation in Python.
