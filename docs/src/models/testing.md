# Testing before you submit

Test the **exact ONNX and manifest files** you will submit. Check the interface first, then the
budget and timing, then the play: a graph that runs and an adapter that returns prove nothing about
whether your entry plays valid or useful actions.

## Reference observations

Admission probes every entry against the cartridge's **reference set**: 207 observations the engine
generates, one for every seat of every [basic board](../games/ants/maps.md#the-basic-boards) at turns
20, 150 and 400 (or the last turn a match lasted), on three seeds. They span boards from 24 × 24 to
120 × 124, two seats to eight, colonies from a seat with no ants left to twenty-nine ants, and
opponents numbered up to 7. Every season's board must fit inside the limits the basic boards span, so
a model admitted on them can play a board a season adds later. Admission probes those observations
and nothing else, and anything they miss goes unchecked. The `tinybrains` commands below read the
same file.

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
newer on Apple silicon and for Linux and Windows on arm64 and x86-64, and it needs no other checkout.
On macOS or Linux:

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
a `games.toml`. Run the CLI from there: it reads the game from the `games.toml` in the directory you
run it from. The starter's copy pins a release of the cartridge by two digests, the archive's and the
engine's. The first command that needs the game downloads it once into the CLI's cache
(`~/Library/Caches/tinybrains/cartridges/` on macOS, `~/.cache/tinybrains/cartridges/` elsewhere)
and refuses it unless both digests match. Copy that file into any other repository and it works the
same way there.

`tinybrains games` prints each registered game and its engine digest. Check it first when a local
result disagrees with a ladder one.

### Check it the way admission will

```sh
tinybrains check model.onnx manifest.json
```

`check` reads the graph from the protobuf, evaluates your manifest over the reference set and runs
the graph on what the manifest produced. It prints the two hashes, the opset, the parameter count, the node count,
the operators, the size metric, the worst operation count against the budget, and the slowest
inference:

```text
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
    slowest graph    7.74 ms of inference  (measured here, not a threshold: no class caps compute)
```

`--json` prints all of it as one object, per case. **A pass is necessary and not sufficient**:
admission decides the size class against *your season's* table, and your machine has no season.

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
`{"observations": [...]}`.

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
and the fraction of the turn the worst one used. `-v` prints each strike and forfeit as it happens;
`--out DIR` writes the replays somewhere other than `replays/`.

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
| `seat_count` | the number of seats; the CLI checks it only when present |
| `seat` | the seat's position in the list |
| `label` | the weights file's name, or a short hash |
| `map` | **required**: every match needs a board, and nothing picks one for you |

**`vars` override the cartridge, and only where you write one.** An absent `max_turns` or `turn_ms`
falls through to the game's limits, and an absent `budget_ops` to its adapter budget; every run
prints all three. A starter writes `max_turns: 300`, to keep a local match short, and nothing else: a
number you write down stops tracking the platform.

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
out is a `hello` carrying the engine digest and the evaluator's version. After it,
`{"op": "observe"}` returns every live seat's observation and `{"op": "step", "actions": [...]}`
advances them; `env` reports finished matches in `ended` and replaces them from the pool.

```jsonc
← {"ok":true,"hello":{"game":"ants","engine_digest":"sha256:…","maps":[{"id":"basic-tiny-2p","players":2,"rows":24,"cols":24},…],"waves":4}}
→ {"op":"observe"}
← {"ok":true,"turn":0,"seats":[{"w":0,"m":0,"ep":0,"seat":0,"obs":{…}},…],"scores":[…],"ended":[]}
→ {"op":"step","actions":["NNE-","-W",…]}
← {"ok":true,"turn":1,"seats":[…],"scores":[…],"ended":[{"ep":3,"ranks":[1,2],"reason":"lone_survivor",…}]}
→ {"op":"close"}
```

It runs a pool of waves so a batch of matches advances together. Every error is fatal: `env` writes
one `{"ok": false, "error": …}` line and exits. A loop that has lost the seat order has no correct
way to carry on, and a failure that looked recoverable would let your run train on misaligned actions
with no sign of it. Record the `hello` line's digest in your model card: you cannot reproduce an
entry that cannot name the engine it trained against.

**You choose the pool of boards here**, since training plays no ranked match: `--maps` takes ids
(`--maps basic-tiny-2p,basic-small-3p`) or a directory of board files, a season's included, and
defaults to the basic boards. Each wave plays one board, so a wave's observations share one size and
stack into one tensor. The next wave takes the next board in turn, and a finished match reports the
`map` it ran on.

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
against what a season could play.

### Prove a replay reproduces

```sh
tinybrains conform replays/self-play.json
```

`conform` rebuilds a match from its replay envelope alone, plays it on your machine, and diffs every
field and every turn of the action stream. The platform runs it to keep its own local runner and its
match workflow in agreement on the same seeds. Run it on a replay of your own entry too: a
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

<div class="tb-replay" data-src="tutorials/8-idle.json" data-turn="10" data-zoom="5"></div>

<p class="tb-replay-caption">Seat 1 answered all ten turns and moved nothing. Its ant stands on the
square it started on, and the food beside its hill went into a hive it cannot spend, because that ant
occupies the only square a new ant of its can appear on. Seat 0, on the same board under the same
rules, has three ants and is halfway across the map. On this replay the count above gives seat 0 ten
easts, one south and its holds, and seat 1 ten holds and nothing else.</p>

<!-- replay-visualiser: testing-behaviour — filled.
Asset: tutorials/8-idle.json, turn 10 (its last). Regenerate with tutorials/build.sh.
It sits in this section rather than at the end of the page because it is what the count above
finds. The prose stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Before submitting

Confirm your shapes on every basic board, every adapter's budget on the largest, the channel order,
the size metric and the turn timing. **Hash the final files after every edit**: reformatting a
manifest changes its hash and its size, and admission checks the upload against the hash you declare.
Keep both hashes with your training notes, so you can trace any result to the version that produced
it.

