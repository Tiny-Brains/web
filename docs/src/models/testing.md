# Testing before you submit

Test the **exact ONNX and manifest files** you will submit. Check the interface first, then the
budget and timing, then the play: a graph that runs and an adapter that returns prove nothing about
whether your entry plays valid or useful actions.

## Reference observations

Admission probes every entry against the cartridge's **reference set**: 207 observations the engine
generates, one for every seat of every [basic board](../games/ants/maps.md#the-basic-boards) at turns
20, 150 and 400 (or the last turn a match was still being played), on three seeds. They span boards
from 24 × 24 to 120 × 124, two seats to eight, colonies from a seat with no ants left to twenty-nine
ants, and opponents numbered up to 7. Every season's board must fit inside the limits the basic
boards span, so a model admitted on them can play a board a season adds later. Admission plays the
first sixty-four of them and nothing else, and anything they miss goes unchecked. The `tinybrains`
commands below read the same file, all 207.

Your own tests should cover what the set does not reach: colonies larger than thirty ants, and the
positions your own entry plays into. A simple greedy walker played the set's matches, so no model
chose any of its positions. Owners in `hills` and `foes` are
[relative to you](observation.md#ownership-labels), so both seats of a match see the same encoding.

## The `tinybrains` CLI

`tinybrains` is the platform's command-line tool: it plays matches on your machine and makes
admission's own measurements without a server. **It links the two libraries a node links**,
`datalogic-rs` for your manifest's adapters and `tract-onnx` for the graph, so it reports the numbers
the platform will report.

It is one binary, [released](https://github.com/Tiny-Brains/cli/releases/latest) for macOS 26 or
newer on Apple silicon and for Linux (glibc 2.35 or newer) and Windows on arm64 and x86-64, and it
needs no other checkout. On macOS or Linux:

```sh
brew tap tiny-brains/cli https://github.com/Tiny-Brains/cli
brew install tiny-brains/cli/tinybrains
git clone https://github.com/Tiny-Brains/ants-starter && cd ants-starter
tinybrains games
```

On Windows, or without Homebrew, download your platform's archive from the release
(`tinybrains-x86_64-pc-windows-msvc.zip`, `tinybrains-aarch64-unknown-linux-gnu.tar.gz` and so on),
check it against the release's `SHA256SUMS`, and put the binary inside on your `PATH`. With a Rust
toolchain, `cargo install --locked --git https://github.com/Tiny-Brains/cli` builds the same binary
from source.

Every game has a starter kit, `<game>-starter`, with a trained entry, `train.py`, two match files and
a `games.toml`. Run the CLI from there: it reads the game from a registry, looking for
`$TINYBRAINS_REGISTRY`, then `games.toml` and `tinybrains.toml` in the directory you run it from,
then `registry.toml` in its cache. The starter's copy pins a release of the cartridge by two
digests, the archive's and the engine's. The first command that needs the game downloads it once
into the CLI's cache (`~/Library/Caches/tinybrains/cartridges/` on macOS, `~/.cache/tinybrains/cartridges/`
or `$XDG_CACHE_HOME` on Linux, `%LOCALAPPDATA%\tinybrains\cartridges` on Windows, or wherever
`TINYBRAINS_HOME` points) and refuses it unless both digests match. Copy that file into any other
repository and it works the same way there.

`tinybrains games` prints each registered game, where it comes from and its engine digest. Check it
first when a local result disagrees with a ladder one.

### Check it the way admission will

```sh
tinybrains check model.onnx manifest.json
```

`check` reads the graph from the protobuf, evaluates your manifest over the reference set and runs
the graph on what the manifest produced. It prints the two hashes, the opset, the parameter count,
the node count, the operators, the size metric, the worst operation count against the budget, and
the slowest inference. It refuses what admission refuses on the document alone: an operator off
the [allowlist](format.md#onnx-compatibility) is `OP_NOT_ALLOWED`, and an opset outside 13 to 19
is `OPSET`. Last it runs admission's probe as a node runs it: five inferences on zero-filled
inputs at your `probe_dims`, whose median must fit the game's turn, 1,000 ms for Ants:

```text
model.onnx against ants's reference set
    weights          sha256:…
    manifest         sha256:…

graph
    opset            17
    parameters       3006
    nodes            46
    size metric      12280 bytes  (artifact + manifest -- the platform classifies it, this does not)
    operators        Cast, Concat, Constant, Conv, Relu, Slice
    inputs           board

adapters  (207 reference observations, budget 1000000, turn 1000 ms)
    PASSED
    worst case       208423 operations, 20% of the budget
    slowest graph    7.01 ms of inference  (measured here, not a threshold: the probe below is admission's timing gate)

probe  (5 zero-filled inferences at H = 128, W = 128, as admission runs them, turn 1000 ms)
    PASSED
    median           6.07 ms  (measured here; the admitting runner measures again)

This is not admission. It has no download allowlist and does not decide a size class,
so a pass here is necessary and not sufficient.
```

`--json` prints the run as one object, with `failing_case` naming the observation that failed, if
one did. **A pass is necessary and not sufficient**: admission decides the size class against *your
season's* table, and your machine has no season. The admitting runner also measures the probe again
on its own hardware, so a median close to the turn can pass here and fail there.

**A model with [memory](memory.md)** gets two more things from `check`. It prints what the memory
costs, fixed and per cell, and the total at the smallest and the largest board.
`--memory-flat-bytes N` and `--memory-cell-bytes N` judge that total against a class's two numbers
(a number left out is 0), with the verdicts admission gives: `MEMORY_NOT_ALLOWED`,
`MEMORY_TOO_LARGE` and `MEMORY_SHAPE`. The reference observations also run chained, as admission
runs them: each call is fed the memory the call before it wrote, when both are the same size. A fed
call that fails is `MEMORY_ROUND_TRIP`, and `check` names the observation it failed on.

### See the tensors your adapter builds

```sh
tinybrains adapt model.onnx manifest.json --out tensors
```

`adapt` evaluates every adapter through **datalogic** over every reference observation, and writes
each input tensor as a numpy `.npy` file beside the observation that produced it:

```text
tensors/
  index.json               the budget, and each case's ops and tensor shapes
  case-0/observation.json
  case-0/board.npy         one file for each input your manifest declares
  case-1/…
```

`--obs FILE` runs your own observations instead: one, a list of them, or
`{"observations": [...]}`. An observation may carry `memory` or `ant_memory`, either as nested
arrays, which are decoded into the dtype your manifest declares for that output, or in the wire
form a runner hands back. So you can compare your trainer's tensors with the adapter's with the
memory set.

The ladder feeds your graph these same tensors. **Before you train, assert that your trainer's
encoder produces the same ones**, element for element. If your encoder disagrees with the adapter,
you train a model on inputs the arena never serves, and nothing fails: your rating comes out lower
than training promised.
[A real manifest](adapters/walkthrough.md#the-same-encoding-in-your-trainer) shows the test the
platform's own baselines run.

### Play a match

```sh
tinybrains matches/self-play.json      # from a starter checkout
tinybrains view replays/self-play.json
```

A match file names a model and a manifest for each seat. On your own machine, your entry can play
the starter's trained opponents in `models/`, itself, or last week's version, through the real
cartridge and the real evaluator. Each run prints the mean operations and inference per seat-turn,
and the fraction of the turn the worst one used. `-v` prints each strike, forfeit, inference error
and over-turn warning as it happens; `--timings` measures each phase of the run; `--out DIR` writes
the replays somewhere other than `replays/`. `view` opens a replay in your browser with the match
graph under it: each seat's ants alive, hills standing or score, turn by turn.

### Match files

A match file holds the rows the ladder's runners claim, plus the settings the match runs under, so
you play on your machine in the shape the ladder plays.

```json
{
  "game": "ants",
  "vars": { "max_turns": 300 },
  "rows": [
    { "id": "self-play", "seed": 42, "map": "basic-tiny-2p", "seat_count": 2,
      "seats": [
        { "seat": 0, "weights": "../model.onnx", "manifest": "../manifest.json", "label": "mine" },
        { "seat": 1, "weights": "../model.onnx", "manifest": "../manifest.json", "label": "mine-again" }
      ] }
  ]
}
```

A seat names its model one of three ways:

| Fields | What they are |
|---|---|
| `weights` + `manifest` | A path or a URL each. Paths resolve against the match file's own directory. The CLI hashes the bytes into a local store before anything runs, so two seats naming identical files are one model |
| `weights_hash` + `manifest_hash` | The two `sha256:` digests of files already in the local store: the form a real ladder row takes |
| `script` | Written orders in place of a model, one entry per turn: one order for every ant (`"E"`) or one per ant in `mine` order (`["E", "W"]`). Past the end of the script the seat holds. A script reaches no model and still goes through the cartridge |

A missing field takes these defaults:

| Field | If absent |
|---|---|
| `game` | `"ants"` |
| `id` | `match-<index>`; it names the replay file |
| `seed` | **required**: a row without one does not play |
| `seat_count` | the number of seats; when present it must equal them |
| `seat` | the seat's position in the list |
| `label` | the weights file's name, a short hash, or `scripted` |
| `map` | **required**: every match needs a board, and nothing picks one for you |

**`vars` override the cartridge, and only where you write one.** An absent `max_turns` or `turn_ms`
falls through to the game's limits, an absent `budget_ops` to its adapter budget, and an absent
`strike_ceiling` to five; a run that plays a model prints the turn and the budget it used. A starter
writes `max_turns: 300`, to keep a local match short, and nothing else: a number you write down
stops tracking the platform. A file may also name the `engine_digest` it expects, and the CLI warns
when the cartridge it plays is another.

A row's `map` names the board one of three ways: the id of a board the release ships
(`tinybrains maps` lists them: the five basic boards); a path ending `.json`, which resolves against
the match file's own directory like a seat's weights (play a season's board this way, saved from its
maps listing); or the board itself, inline. The CLI refuses a row that names a `preset`: the format
has no presets. On the ladder you never choose the board; pairing picks it from the season's boards
in play, with the seed. `seat_count` must equal the board's `players`. One command plays every row in
a file, and rows may use different boards as long as they seat the same number. The ladder plays one
row at a time, so a long file adds volume without rehearsing how production batches.

### Train against the real engine

```sh
tinybrains env
```

A training loop needs to step the world. Write a second implementation of the rules in Python and
your model ends up strong against your copy of the game and weak against the real one. `env` puts the
real cartridge behind a JSON Lines protocol on stdin and stdout, one object per line. The first line
out is a `hello` carrying the engine digest, the evaluator's version, the boards in the pool, the
game's limits and budgets, and the pool's own settings. After it, `{"op": "observe"}` returns every
live seat's observation and `{"op": "step", "actions": [...]}` advances them; `env` reports
finished matches in `ended` and replaces them from the pool.

```jsonc
← {"ok":true,"hello":{"game":"ants","engine_digest":"sha256:…","evaluator":"datalogic …","maps":[{"id":"basic-tiny-2p","players":2,"rows":24,"cols":24},…],"waves":4,"matches_per_wave":16,…}}
→ {"op":"observe"}
← {"ok":true,"turn":0,"seats":[{"w":0,"m":0,"ep":0,"seat":0,"turn":0,"obs":{…}},…],"scores":[…],"ended":[]}
→ {"op":"step","actions":["NNE-","-W",…]}
← {"ok":true,"turn":1,"seats":[…],"scores":[…],"ended":[{"w":0,"m":3,"ep":3,"turns":…,"ranks":[1,2],"reason":"lone_survivor","map":"basic-tiny-2p",…}]}
→ {"op":"close"}
```

It runs a pool of waves so a batch of matches advances together, and refills a wave once every
match in it has ended. `--waves`, `--matches-per-wave`, `--max-turns`, `--seed` and `--scores`
(`every` turn, or at the `end`) set the pool. Every error is fatal: `env` writes one
`{"ok": false, "error": …}` line and exits. A loop that has lost the seat order has no correct way
to carry on, and a failure that looked recoverable would let your run train on misaligned actions
with no sign of it. Record the `hello` line's digest in your model card: you cannot reproduce an
entry that cannot name the engine it trained against.

**You choose the pool of boards here**, since training plays no ranked match: `--maps` takes ids
(`--maps basic-tiny-2p,basic-small-3p`) or paths, or a directory of board files, a season's
included, and defaults to the basic boards. Each wave plays one board, so a wave's observations
share one size and stack into one tensor. The next wave takes the next board in turn, and a
finished match reports the `map` it ran on.

**`env` is not the referee.** It has no turn deadline, no strike ceiling and no adapter evaluation:
it steps the world and nothing else. Do not read its outcomes as results; `tinybrains check` and a
played match are the gates.

### Get the boards

```sh
tinybrains maps                  # the basic boards, their sizes and seats, and the limits a season's must fit
tinybrains maps export ants out  # write them out, byte-for-byte as the release ships them
tinybrains maps check board.json # would this board be accepted by a season's upload?
```

The release does not carry a season's own boards. Each is public from the moment an admin uploads
it: `GET /v1/games/ants/seasons/{slug}/maps?boards=true` returns every one, and `tinybrains` plays
each as a board file from a path. `maps check` runs the checks an upload runs (the header, the
game's limits and the engine's own validation), so you can check a board your trainer generated
against what a season could play. It also checks the name rule a season's board is uploaded under:
the id is `size-terrain-Np-Hh`, `N` equals the file's `players`, and `H` × players equals the length
of its `hills`. A failure prints the code Soma refuses with (`map_name_pattern`, `map_name_players`
or `map_name_hills`). A `basic-*` board only gets a warning, since those ship in the release and
are never uploaded under that name.

### Prove a replay reproduces

```sh
tinybrains conform replays/self-play.json
```

`conform` rebuilds a match from its replay envelope alone, plays it on your machine, and compares
the board, the seed, the ending, the ranks, the scores and every turn's actions with the recording,
stopping at the first turn that differs. It needs each seat's model in the local store, and it
refuses a replay played on another engine. The platform runs it to keep its own local runner and
its match workflow in agreement on the same seeds. Run it on a replay of your own entry too: a
difference means the two engines disagree, and that is a bug to report.

## What you cannot check here

| | Why |
|---|---|
| Your weight class | Admission decides it against **your season's** table, which your machine does not have. `check` prints the metric; the season turns it into a class |
| Whether your files are where the platform expects | The platform reads them from the bucket you upload to, and never from your disk |
| Whether a late-game turn fits the budget | The reference set is three turns of each basic board. A crowded board can cost more than any of them |
| How your entry rates | Only the ladder measures that, over many matches against many opponents |
| Whether your head is a shape the referee can read | Covered: `check` decodes it, and only `check` does. `env` evaluates no manifest |

## Check the actions too

`check` confirms that your head decodes to a valid action on every reference observation. It cannot
tell you whether the action is any *good*: the platform reads your head with a fixed channel order,
so a graph trained against a rotated order produces valid moves in the wrong directions and passes
everything. Play a match and count the moves. A model whose hold channel wins everywhere plays valid
actions and never moves:

```sh
python3 -c "import json,collections; d=json.load(open('replays/self-play.json')); \
  [print('seat', i, collections.Counter(c for t in d['deltas'] for c in t['a'][i])) \
   for i in range(len(d['deltas'][0]['a']))]"
```

Count it **per seat**. A total across seats lets one seat's moves hide the other's, and a colony
that never moved passes for part of a busy match.

<div class="tb-replay" data-src="tutorials/8-idle.json" data-turn="6"></div>

<p class="tb-replay-caption">Seat 1 answered all six turns and moved nothing. Its ant stands on the
square it started on, and the food beside its hill went into a hive it cannot spend, because that
ant occupies the only square a new ant of its can appear on. Seat 0, on the same board under the
same rules, gathered twice, spawned twice and has three ants walking east along its row. On this
replay the count above gives seat 0 eleven easts, one west and its holds, and seat 1 six holds and
nothing else.</p>

<!-- replay-visualiser: testing-behaviour — filled.
Asset: tutorials/8-idle.json, turn 6 (its last). Regenerate with tutorials/build.sh.
It sits in this section rather than at the end of the page because it is what the count above
finds. The prose stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Before submitting

Confirm your shapes on every basic board, every adapter's budget on the largest, the channel order,
the size metric and the turn timing. **Hash the final files after every edit**: reformatting a
manifest changes its hash and its size, and admission checks the upload against the hash you declare.
Keep both hashes with your training notes, so you can trace any result to the version that produced
it.
