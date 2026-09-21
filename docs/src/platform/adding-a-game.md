# Adding a game

A game cartridge defines the world competitors act in: generation, rules, observations, actions,
scoring and replay reconstruction. The platform runs its WebAssembly component, and Orion's
`models` entity runs competitor models. Game code must not schedule its own matches, fetch models
or write ratings.

Ants is the reference implementation, and it keeps every rule on this page: its
[repository](https://github.com/Tiny-Brains/ants) builds the component from `engine/` and the viewer
from `viz/`, and publishes both as one GitHub release archive. **The local runner already takes a
second game without a line of Rust.** `tinybrains` knows five function names, `cartridge.json` and
the replay envelope, and reads every board, seat count and limit from the manifest, so you add a
game to it with an entry in a project's `games.toml`. The *ladder* is the harder half: Soma's
clocks, Kalam's package definitions and the registration scripts still carry Ants-specific
configuration, so adding a game there means checking each of those integration points. The ladder
has no self-service upload flow for a game yet.

**Adding a game deploys nothing.** A finished cartridge is a signed component and two manifests,
with no service to build, size or supervise. If shipping your game seems to need anything else,
raise it before you work around it.

## The five functions

Export these operations in the game's own `tb.<game>` namespace. Each is a pure JSON-to-JSON
function; one component exports all five and dispatches on the name.

| Function suffix | Input and result |
|---|---|
| `worldgen` | Seeds and a board object (one for the wave, or one per seed) to the initial packed wave state |
| `observe` | Wave state and opaque seat references to per-seat observations |
| `step` | Wave state and actions to updated state, completion flags, and replay deltas |
| `finish` | Wave state to per-match ranks, integer scores, ending reasons, and the board each ended match was played on |
| `replay-decode` | A replay envelope and a turn (or a `from`/`to` range) to reconstructed frames |

Declare exact input fields in the plugin manifest, and treat Ants' `engine/plugin.toml` as the
complete worked contract; this table abbreviates it. Ants found each of these three details of the
shape by running it against a real Orion:

- **`replay-decode`, with a hyphen.** Orion refuses a function label outside `[a-z][a-z0-9-]*`, so
  the underscore spelling fails to load.
- **`observe` takes a flat list of references**, each carrying its own match index and seat, which
  the cartridge matches and echoes onto the view without inspecting. The list is flat because the
  caller rebuilds it from the *live* seats each turn, and a nested index would shift the moment a
  match ended.
- **Actions may be positional**, aligned with the last `observe`, because a workflow cannot zip two
  arrays. Accept an explicit `{m, seat, action}` form as well, for a caller that omits a seat.

Operate on a **wave of matches**, including waves whose matches finish at different turns. Return no
observations for a finished match: there is no terminal message, and nothing tells a model that it
lost. Match results must give one-based ranks, with ties allowed, and integer scores. `finish` is
the platform's only semantic dependency on your game, and the ladder decides what a rank means for
it.

> **The ladder sends a wave of one.** Kalam claims a single match row and plays it, so only the
> local runner, and a cartridge that wants it, exercise the wave dimension. Keep the ABI wave-shaped
> anyway: matching a seat by `(m, seat)` instead of its position makes an echoed reference safe, and
> it costs nothing when `m` is always 0.

## State and determinism

All state must round-trip through the packed wave value. The sandbox keeps nothing between
invocations, so anything you do not encode is gone next turn.

- **Make it opaque and compact**: a packed binary encoding, base64'd, in place of readable JSON.
  Nothing outside the cartridge may decode it, so "the platform never parses game state" holds by
  construction.
- **Give it no version field.** A wave never spans two cartridge versions, so the digest that
  produced the encoding versions it.
- **Size it against the plugin ceilings** below. The state crosses the sandbox boundary twice per
  call, so a compact state raises throughput.

**Game state is integer-only: no floating point in game logic.** Integers make the platform's build
and the browser's agree bit for bit, so a replay can be an action stream instead of a hundred times
as many frames. Scores are integers for the same reason. The sandbox enforces the rest: a
component's world has **no imports** (no clock, no randomness, no filesystem, no sockets), so all
randomness derives from the seeds the caller hands `worldgen`. Ants checks the integer rule at
source level (`tools/deny.sh`), because nothing in Rust enforces it.

Your tests should cover seed repeatability, state round trips, player symmetry, observation
privacy, action ordering, end conditions, ties and replay reconstruction. Before you claim portable
replay fidelity, you also need a cross-host conformance run between the platform and a browser; the
Ants reference implementation does not supply that browser run yet.

## Boards, if your game has them

Ants generates nothing at match time. Its boards are **files**, one JSON file per board carrying
its grid, its water, its hills and its turn-zero food, and **the component carries none of them**.
`worldgen` takes the board whole, as an object, for every match it opens. It has no catalogue to
look a name up in and nothing to choose from, so it refuses a call without a board. Design for three
consequences:

- **A board is never an engine-digest change.** An administrator uploads a season's boards to it;
  Soma stores them with the season and sends the board to the runner with every match it claims. No
  release or repository holds them, and a season can take a board into play or out of it while it
  runs, on the engine it opened with.
- **Symmetry is an assertion.** A generator can make fairness true by construction; a file someone
  edited cannot. Every board passes a validator before any match plays on it: terrain, hills and
  turn-zero food closed under the board's own shift; a shift that returns home in as many steps as
  there are seats; every square of land reachable from every other; the same number of hills a
  seat; no hill on water or walled in. A refusal is `caller_input`, because the same board can
  never succeed. **The platform runs the same validator at upload**: Soma loads the component and
  calls `worldgen` on every board an administrator uploads, and again whenever an administrator puts
  one in play, so an unplayable board fails there and never fails a match paired on it.
- **The cartridge declares what a board may be.** `limits.boards` in the manifest bounds the seats,
  each side and the squares, and Soma refuses an upload outside it. The bound is also admission's
  promise: you must draw the reference observations that admission proves every adapter against on
  boards that span it, because a season can add a board after Soma admitted a model. Ants ships five
  **basic boards** in its release, one of each size, from two seats to eight and from the smallest
  side to the largest. It derives `limits.boards` from them and draws the reference set on them, so
  the two cannot disagree.

**The competitor still does not choose.** On the ladder, the pair clock chooses the board from the
season's boards in play and assigns the seed with it. The platform reads no further into a board
than its header (`id`, `players`, `rows`, `cols`); everything else in the file is the cartridge's.
The generator stays, as the tool that writes the files. Ants keeps it in a crate beside the engine,
outside the component's source, and its gate regenerates every basic board and compares bytes, so a
hand-edited board fails the build.

A game whose configurations are not boards still gets one in `worldgen`: whatever set-up it plays,
as a file with a header the platform can read, and a `limits.boards` that says what it may be.

## Replays

A replay is the action stream, so re-simulating it needs the position it started from. **Make the
envelope carry its own board**: `finish` returns the board each ended match was played on, and the
envelope stores it beside the seed and the turn limit. The replay then stays viewable whatever
happens later to the season or to the board's place in it.

- **Test against an envelope the platform wrote.** Ants keeps a real one as a fixture, because a
  round-trip test that builds its own envelope keeps passing while the writer and the reader drift
  apart.
- **Give the viewer a range.** Decoding re-simulates from turn zero, so a scrubber asking frame by
  frame is quadratic; `from`/`to` walks the match once.
- **Put in a frame what the viewer must not work out for itself.** Ants' frames name, per seat, the
  squares that turn revealed for the first time, so the viewer can draw what each seat has explored
  without re-implementing vision.

## The two manifests

The **plugin manifest** describes the Orion ABI, component path, namespaced functions and input
fields. `name` is a lowercase reverse-domain identifier with at least two labels, and every function
is `<name>.<label>`. The field table is a contract Orion checks: Orion refuses to activate a plugin
version whose schema an active workflow no longer satisfies (a renamed field, or a field that has
become required), names the workflow, and keeps the previous version serving. Ants authors
`engine/plugin.toml` and generates `plugin.json` from it.

Soma reads the **cartridge registration manifest** once, when it registers the game:

```json
{
  "game": "ants", "version": "1.0.0", "abi": 1,
  "limits":  { "max_turns": 1000, "turn_ms": 1000,
               "boards": { "players": [2, 8], "sides": [24, 124], "cells_max": 14880 } },
  "budgets": { "adapter_ops_max": 1000000 },
  "maps":    [ { "id": "basic-large-6p", "rows": 80, "cols": 96, "players": 6, "food_target": 108, "sha256": "sha256:…" },
               … ],
  "about":   { "tagline": "…", "provenance": "…", "story": ["…"], "links": [ { "label": "…", "href": "https://…" } ] }
}
```

**A board carries its own seat count**, because a seat count belongs to a board and the game has
none of its own. The manifest declares no pool either: it names no board a season plays.
`limits.boards` is what any board may be, and the platform reads it in one place, a season's
upload. `maps` holds metadata and a digest per basic board, so a competitor's tooling can list the
boards the release ships and check an exported copy without loading the component. `about` is plain
text only: it comes from a repository, and a browser renders it.

Generate registration facts from the definitions the engine uses, so board sizes and seat counts
cannot drift, and ship the component and manifests together. Ants generates `cartridge.json` from
its basic boards and derives `limits.boards` from them, so the bound and the boards that prove it
cannot disagree. Its own GitHub Actions workflow builds the component, both manifests, the basic
boards, the reference observations and the viewer, and publishes them as one release archive, which
every consumer fetches by tag or as the latest.

## Building the component

Build a Rust `cdylib` on `orion-plugin-sdk` for `wasm32-unknown-unknown`, and turn it into a
component with `wasm-tools component new`. **Do not target WASI**: its standard library imports
WASI, and Orion would refuse the component. A refusal is a `PluginError` with a stable code matching
`^[A-Z][A-Z0-9_]{0,63}$` and a class: `caller_input` when the same input can never succeed,
`internal` when the cartridge itself failed. Choose codes a caller can act on: `WAVE_STATE_CORRUPT`
beats `ERROR`.

**Pin the toolchain and remap build paths.** rustc bakes into the binary the absolute path of every
source file a panic can name, so the same commit, built on two machines, gives two engine digests.
Ants builds its component in a Dockerfile with rustc pinned to a patch version and
`--remap-path-prefix`, so the digest depends on the source alone, and every consumer takes that one
image and runs no build of its own.

## The ceilings

Every invocation runs in a fresh instance under limits the operator sets. A manifest requests
nothing, and a per-plugin override may only lower a ceiling.

| Ceiling | Default | What it bounds |
|---|---|---|
| `max_memory_bytes` | 64 MiB | Linear memory per invocation |
| `max_timeout_ms` | 5,000 | Wall clock; the task's own deadline applies too, and the shorter wins |
| `max_request_bytes` | 1 MiB | The evaluated input, and so the wave size |
| `max_response_bytes` | 1 MiB | The returned JSON |
| `max_concurrency_per_function` | 64 | Invocations of one function at once |
| `fuel_backstop` | 10¹¹ instructions | A backstop sized well above what the clock admits, and no contract |

**Orion retries a timeout and no other failure**, because a pure function retries for free. It
retries no `caller_input` or `internal` refusal, trap, panic, size limit or non-JSON result. Cache
nothing across calls: nothing survives from one call to the next.

## Signing

**Components carry signatures, and Orion enforces them.** Every plugin carries a detached Ed25519
signature over its digest string (`sha256:<64 hex>`). Whoever holds the deployment's trust key mints
it; the package does not. Orion checks it when you upload the component and again on every node that
loads it, and a missing or mismatched signature brings the node up `degraded` with its channels
quarantined. Sign a new game's component the same way, and re-sign it on every rebuild, because a
rebuild changes the digest.

## Registering and integrating

Load the component on compatible Kalam workers, register its manifest and engine digest, and supply
reference observations for admission. Update the execution function references, the component Soma
loads to judge uploaded boards, and the deployment wiring wherever they name Ants. Align the game's
live season identity with the engine that will claim its matches.

Provide reference cases covering the smallest and largest states and the boundary conditions that
matter, and **generate them from the engine**. Admission validates an adapter against these
observations and nothing else, so a hand-kept set tests a shape the game may no longer produce.
Validate a real model and adapter against them: an empty or unrepresentative reference set gives
admission nothing to hold an adapter to.

## The viewer

The viewer is the one part of a cartridge outside the component: an ES module the platform loads by
convention from `/cartridges/{slug}/viz.js`. It exports `mount(target, replay, opts)`, which returns
an object with a `destroy()`. Ants' viewer takes `turn`, a `from`/`to` range, `autoplay`, `speed`,
`theme`, `labels` (what the host calls each seat) and an `onTurn` callback, among others.

**The viewer re-simulates through your own `replay-decode`**, transpiled with `jco` from the same
component digest that recorded the match, so the viewer and the referee cannot disagree. A
JavaScript re-implementation of a rule would be a second engine. Record the digest you built the
bundle from: a viewer re-simulating with a different engine raises no error and draws a plausible
match that never happened. **A viewer never runs a model.** It replays recorded actions, so a host
can embed it anywhere without inheriting the evaluator's security surface.

Ants ships the whole player (transport, timeline, title bar), because its three hosts are separate
applications: the web application, this book and `tinybrains view`. The cost: a second cartridge
writes its own scrubber, until two real viewers show what is worth extracting. A viewer owes its
host page these rules:

- **Scope every style rule to your root class.** A viewer injects one stylesheet into the host
  document; an unscoped rule lands on the host's own elements.
- **Take the chrome's colours from the host's tokens, and keep the board's.** A match should look
  like itself in either theme.
- **Give the board the frame.** A host embeds a viewer at whatever height it can spare, so anything
  permanent beside the board has to earn its height.
- **Take the layout question yourself.** If a host needs another layout, give it an option on
  `mount()`; the host's stylesheet never reaches into your class names.
- **Take the width the host gives you.** Anything that does not wrap becomes the viewer's minimum
  width; `contain: inline-size` on the root keeps content from sizing the host's column.

## What a game must not need

If adding your game needs any of these, raise it; do not work around it. The seam is worth having
only while it holds.

| | |
|---|---|
| A change to the five functions | The set is the ABI; a sixth function is a design conversation |
| Floating-point game state | It breaks replays before it breaks anything else |
| State held between invocations | There is nowhere to put it; thread it through the wave state |
| I/O of any kind | Nothing in a cartridge may read a file, a clock, a socket or a secret |
| Knowledge of ratings, classes, users or seasons | You score a match and rank its players; the platform does the rest |
| A per-match step function | It would cost the wave its batching |
| Your own tensor layout | The competitor's manifest turns a payload into tensors |

## Documentation competitors need

Publish a game overview, a world description, the exact turn order, the ending and scoring rules,
the limits a board may be, the observation schema, the action schema and working examples. Give
what a model cannot see the same care as what it can. State the exact limits and the exact behavior
of an invalid action. **Ants publishes its protocol in this book**: *What your model sees* and *What
your model answers* are the contract, and a change to what the engine sends lands with a change to
them.

If a visual explanation helps, reserve a replay visualiser placeholder that names the concept, the
player perspective it needs and the turns to select. Attach real recorded games later, with
matching engine identities and text captions. A competitor should understand the rule from the text
before anyone implements the viewer.
