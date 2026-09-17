# Adding a game

A game cartridge defines the world competitors act in: generation, rules,
observations, actions, scoring, and replay reconstruction. The platform runs its
WebAssembly component while Orion's `models` entity runs competitor models. Game code must not
schedule its own matches, fetch models, or write ratings.

Ants is the reference implementation, and every rule on this page is one it already keeps: its
[repository](https://github.com/Tiny-Brains/ants) builds the component from `engine/`, the viewer
from `viz/`, and ships both in an artifact image. **The local runner already takes a second game
without a line of Rust** — `tinybrains` knows five function names, `cartridge.json` and the replay
envelope, and reads every board, preset, seat count and limit from the manifest, so adding a game to
it is an entry in a project's `games.toml`. The *ladder* is the harder half: Soma's clocks and
Kalam's package definitions and the registration scripts still carry Ants-specific configuration,
so adding a game there requires checking those integration points. It is not yet a self-service
upload flow.

**Adding a game deploys nothing.** There is no service to build, no fleet to size, nothing to
supervise: a finished cartridge is a signed component and two manifests. If shipping your game
seems to need anything else, raise it before working around it.

## The five functions

Export these operations in the game's own `tb.<game>` namespace. Each is a pure JSON-to-JSON
function; one component exports all five and dispatches on the name.

| Function suffix | Input and result |
|---|---|
| `worldgen` | Seeds and a preset — optionally a board by id or inline — to the initial packed wave state |
| `observe` | Wave state and opaque seat references to per-seat observations |
| `step` | Wave state and actions to updated state, completion flags, and replay deltas |
| `finish` | Wave state to per-match ranks, integer scores, ending reasons, and the board each ended match was played on |
| `replay-decode` | A replay envelope and a turn — or a `from`/`to` range — to reconstructed frames |

Declare exact input fields in the plugin manifest rather than relying on this abbreviated table as
an ABI schema; Ants' `engine/plugin.toml` is a complete worked contract. Three details of the shape
were each found by running it against a real Orion:

- **`replay-decode`, with a hyphen.** Orion refuses a function label that is not
  `[a-z][a-z0-9-]*`, so the underscore spelling does not load at all.
- **`observe` takes a flat list of references**, each carrying its own match index and seat, which
  the cartridge matches and echoes onto the view without inspecting. Flat rather than nested,
  because the caller rebuilds it from the *live* seats each turn and a nested index would shift the
  moment a match ended.
- **Actions may be positional**, aligned with the last `observe`, because a workflow cannot zip two
  arrays. Accept an explicit `{m, seat, action}` form as well, for a caller that omits a seat.

Operate on a **wave of matches**, including waves where individual matches finish at different
turns. Return no observations for a finished match — there is no terminal message, and a model is
never told that it lost. Match results must provide one-based ranks with ties allowed, and integer
scores. `finish` is the platform's only semantic dependency on your game; what a rank means for a
ladder is not your concern.

> **The ladder sends a wave of one.** Kalam claims a single match row and plays it, so the wave
> dimension is exercised only by the local runner and by a cartridge that wants it. Keep the ABI
> wave-shaped anyway: matching a seat by `(m, seat)` rather than by position is what makes an echoed
> reference safe, and it costs nothing when `m` is always 0.

## State and determinism

All state must round-trip through the packed wave value; the sandbox keeps nothing between
invocations, so any information you do not encode is information you do not have next turn.

- **Make it opaque and compact.** A packed binary encoding, base64'd, not readable JSON. Nothing
  outside the cartridge may decode it, which is what makes "the platform never parses game state" a
  property rather than a promise.
- **Give it no version field.** A wave never spans two cartridge versions, so the encoding is
  versioned by the digest that produced it.
- **Size it against the plugin ceilings** below. The state crosses the sandbox boundary twice per
  call, so a compact state buys throughput directly.

**Game state is integer-only: no floating point in game logic.** It is what makes the platform's
build and the browser's agree bit for bit, and so what lets a replay be an action stream rather than
a hundred times as many frames. Scores are integers for the same reason. The sandbox enforces the
rest: a component's world has **no imports** — no clock, no randomness, no filesystem, no sockets —
so all randomness derives from the seeds `worldgen` is handed. Ants checks the integer rule at source
level (`tools/deny.sh`), because nothing in Rust enforces it.

Tests should cover seed repeatability, state round trips, player symmetry,
observation privacy, action ordering, end conditions, ties, and replay reconstruction.
Cross-host conformance between the platform and a browser is also needed before
claiming portable replay fidelity; that browser conformance run is not yet supplied
by the Ants reference implementation.

## Boards, if your game has them

Ants generates nothing at match time. Its boards are **files** — one JSON file per board, carrying
its grid, its water, its hills and its turn-zero food — validated at build time and compiled into the
component, because a cartridge that imports nothing cannot read a file at run time. Two consequences
are worth taking on purpose:

- **A board edit is an engine-digest change**, and so travels on the same rails as a rules change.
  There is no separate mechanism for shipping a board, and there should not be.
- **Symmetry becomes an assertion.** A generator can make fairness true by construction; a file
  someone edited cannot. So every board passes a validator before it is played — terrain, hills and
  turn-zero food closed under the board's own shift, a shift that returns home in exactly as many
  steps as there are seats, every square of land reachable from every other, the same number of
  hills a seat, no hill on water or walled in — and a refusal is `caller_input`, because the same
  board can never succeed.

**Let the seed choose the board.** `map` and `maps` are optional inputs, and the platform passes
neither: pairing assigns the seed, the seed chooses a board from the preset's pool, and so a
competitor cannot train against a board they picked. The generator does not die — it becomes the
tool that writes the files. Ants keeps it in a crate beside the engine rather than in the
component's source, driven by one recipe a preset, so tuning how boards are made is not an
engine-digest change while regenerating them is; and its gate regenerates every committed board and
compares bytes, so a hand-edited board fails the build.

A game whose configurations are not boards simply has none of this: the manifest's `maps` catalogue
is optional.

## Replays

A replay is the action stream, so re-simulating it needs the position it started from. **Make the
envelope carry its own board**: `finish` returns the board each ended match was played on, and the
envelope stores it beside the seed and the turn limit, so a replay stays viewable after the preset
table has been re-tuned or the catalogue has moved on.

- **Test against an envelope the platform actually wrote**, not one your tests built. Ants keeps a
  real one as a fixture, because a round-trip test that builds its own envelope keeps passing while
  the writer and the reader drift apart.
- **Give the viewer a range.** Decoding re-simulates from turn zero, so a scrubber asking frame by
  frame is quadratic; `from`/`to` walks the match once.
- **Put in a frame what the viewer must not work out for itself.** Ants' frames name, per seat, the
  squares that turn revealed for the first time, so the viewer can draw what each seat has explored
  without re-implementing vision.

## The two manifests

The **plugin manifest** describes the Orion ABI, component path, namespaced functions, and input
fields. `name` is a lowercase reverse-domain identifier with at least two labels, and every function
is `<name>.<label>`. The field table is a contract Orion checks: a plugin version whose schema an
active workflow no longer satisfies — a field renamed, a field newly required — is refused at
activation, naming the workflow, while the previous version keeps serving. Ants authors
`engine/plugin.toml` and generates `plugin.json` from it.

The **cartridge registration manifest** is read once, when the game is registered:

```json
{
  "game": "ants", "version": "1.0.0", "abi": 1,
  "presets": [ { "name": "cave-2",  "players": 2, "maps": 4 },
               { "name": "cave-3",  "players": 3, "maps": 4 },
               …
               { "name": "rooms-7", "players": 7, "maps": 4 } ],
  "limits":  { "max_turns": 1000, "turn_ms": 1000 },
  "budgets": { "adapter_ops_max": 1000000 },
  "maps":    [ { "id": "cave-2-00", "preset": "cave-2", "rows": 152, "cols": 152, "players": 2, "food_target": 28, "sha256": "sha256:…" } ],
  "about":   { "tagline": "…", "provenance": "…", "story": ["…"], "links": [ { "label": "…", "href": "https://…" } ] }
}
```

**A preset carries its own seat count**, because seats are a property of the board rather than of
the game, and names a pool of boards rather than generator parameters. The platform passes a preset
name back to the cartridge and never learns what it means. `maps` is metadata and a digest per
board, so a competitor's tooling can list boards and check an exported copy without loading the
component. `about` is plain text only — it is registered from a repository and rendered in a
browser.

Generate registration facts from the same definitions the engine uses so board sizes and seat counts
cannot drift, and ship the component and manifests together. Ants generates `cartridge.json` from its
boards — a preset exists because boards declare it, so it cannot be listed without one — and ships the component, both manifests, the boards, the reference
observations and the viewer as one artifact image.

## Building the component

A Rust `cdylib` on `orion-plugin-sdk`, targeting `wasm32-unknown-unknown` — **not** a WASI target,
whose standard library imports WASI and would be refused — turned into a component with
`wasm-tools component new`. Refusals are a `PluginError` with a stable code matching
`^[A-Z][A-Z0-9_]{0,63}$` and a class: `caller_input` when the same input can never succeed,
`internal` when the cartridge itself failed. Choose codes a caller can act on — `WAVE_STATE_CORRUPT`
beats `ERROR`.

**Pin the toolchain and remap build paths.** rustc bakes the absolute path of every source file a
panic can name into the binary, so the same commit built on two machines is two engine digests. Ants
builds its component in a Dockerfile with rustc pinned to a patch version and
`--remap-path-prefix`, so the digest is a function of the source — and every consumer takes that
one image rather than running the build itself.

## The ceilings

Every invocation runs in a fresh instance under limits the operator sets. A manifest requests
nothing, and a per-plugin override may only lower a ceiling.

| Ceiling | Default | What it bounds |
|---|---|---|
| `max_memory_bytes` | 64 MiB | Linear memory per invocation |
| `max_timeout_ms` | 5,000 | Wall clock; the task's own deadline applies too, and the shorter wins |
| `max_request_bytes` | 1 MiB | The evaluated input — this is what bounds wave size |
| `max_response_bytes` | 1 MiB | The returned JSON |
| `max_concurrency_per_function` | 64 | Invocations of one function at once |
| `fuel_backstop` | 10¹¹ instructions | A backstop sized well above what the clock admits, not a contract |

**A timeout is the one failure that is retried**, because a pure function retries for free. A
`caller_input` or `internal` refusal, a trap, a panic, a size limit, or a result that is not JSON
is not. Do not cache anything across calls: there is no across-calls.

## Signing

**Components are signed, and the signature is enforced.** Every plugin carries a detached Ed25519
signature over its digest string (`sha256:<64 hex>`), minted by whoever holds the deployment's trust
key rather than by the package. It is checked when the component is uploaded and again by every node
that loads it, and a component whose signature is missing or does not match brings the node up
`degraded` with its channels quarantined. A new game's component is signed the same way, and
re-signed on every rebuild, because a rebuild changes the digest.

## Registering and integrating

Load the component on compatible Kalam workers, register its manifest and engine
digest, and supply reference observations for admission. Update scheduling presets,
execution function references, and deployment wiring that currently name Ants.
Align the game's live season identity with the engine that will claim its matches.

Provide reference cases covering the smallest and largest states and meaningful boundary
conditions, and **generate them from the engine** rather than writing them by hand — admission
validates an adapter against these observations and nothing else, so a hand-kept set tests a shape
the game may no longer produce. Validate a real model and adapter against them; an empty or
unrepresentative reference set is not an adequate admission contract.

## The viewer

The one part of a cartridge that is not the component: an ES module the platform loads by
convention at `/cartridges/{slug}/viz.js`, exporting `mount(target, replay, opts)` and returning
something with a `destroy()`. Ants' viewer takes `turn`, a `from`/`to` range, `autoplay`, `speed`,
`theme`, `labels` — what the host calls each seat — and an `onTurn` callback, among others.

**The viewer re-simulates through your own `replay-decode`**, transpiled with `jco` from the same
component digest that recorded the match, which is why the viewer and the referee cannot disagree.
A JavaScript re-implementation of a rule would be a second engine. Record the digest the bundle was
built from: a viewer re-simulating with a different engine does not fail, it draws a plausible match
that never happened. **A viewer never runs a model** — it replays recorded actions, so it can be
embedded anywhere without inheriting the evaluator's security surface.

Ants ships the whole player — transport, timeline, title bar — because its three hosts (the web
application, this book, and `tinybrains view`) are not one application. The cost is that a second
cartridge writes its own scrubber, until two real viewers show what is worth extracting. What a
viewer owes the page it is mounted on, each learned as a bug first:

- **Scope every style rule to your root class.** A viewer injects one stylesheet into the host
  document; an unscoped rule lands on the host's own elements.
- **Take the chrome's colours from the host's tokens, and keep the board's.** A match should look
  like itself in either theme.
- **Give the board the frame.** A host embeds a viewer at whatever height it can spare, so anything
  permanent beside the board has to earn its height.
- **Take the layout question yourself.** If a host needs the viewer laid out differently, that is an
  option on `mount()`, not the host's stylesheet reaching into your class names.
- **Take the width you are given.** Anything that does not wrap becomes the viewer's minimum width;
  `contain: inline-size` on the root keeps content from sizing the host's column.

## What a game must not need

If adding your game requires any of the following, raise it rather than working around it — the
seam is only worth having if it holds.

| | |
|---|---|
| A change to the five functions | The set is the ABI; a sixth function is a design conversation |
| Floating-point game state | It breaks replays before it breaks anything else |
| State held between invocations | There is nowhere to put it; thread it through the wave state |
| I/O of any kind | Nothing in a cartridge may read a file, a clock, a socket or a secret |
| Knowledge of ratings, classes, users or seasons | You score a match and rank its players; the rest is not your business |
| A per-match step function | It would cost the wave its batching |
| Your own tensor layout | Turning a payload into tensors is the competitor's manifest, not the cartridge's |

## Documentation competitors need

Publish a game overview, world description, exact turn order, ending/scoring
rules, presets, observation schema, action schema, and working examples. Explain
what a model cannot see as carefully as what it can see. State limits and invalid
action behavior precisely. **This book is where Ants publishes its protocol** — *What your model
sees* and *What your model answers* are the contract, and a change to what the engine sends lands
with a change to them.

Where a visual explanation helps, reserve a replay visualiser placeholder naming
the concept, required player perspective, and turns to select. Later attach actual
recorded games with matching engine identities and text captions. Competitors
should be able to understand the rule before the viewer is implemented.
