# Testing before you submit

Validate the **exact ONNX and manifest files** you will submit. Check the interface first, the
budget and timing second, and the play third: a graph that runs and an adapter that returns do not
show that an entry plays valid, or useful, actions.

## Reference observations

Admission probes every entry against the cartridge's **reference set**: ten observations the engine
generates, across every preset — boards of 64 × 96, 96 × 96 and 128 × 128 — from a colony of two ants to
one of twenty-eight. It probes against those and nothing else, so what they do not cover is not
checked. The `tinybrains` commands below read the same file.

Your own tests should add what the set does not: crowded and late-game boards, turns with no foes
or food in sight, fragmented known water, ants on the wrapping edges, and an empty `mine`, even
though a seat with no ants normally stops being called. Owners in `hills` and `foes` are
[relative to you](observation.md#ownership-labels), so both seats of a match see the same encoding.

## The `tinybrains` CLI

`tinybrains` is the platform's command-line tool: it plays matches on your machine and makes
admission's own measurements without a server. **It links the two libraries a node links** —
`datalogic-rs` for your manifest's adapters and `tract-onnx` for the graph — so what it reports is
what the platform will report, and not a local approximation of it.

It builds from source with a Rust toolchain, and nothing else needs cloning:

```sh
cargo install --locked --git https://github.com/Tiny-Brains/devops tinybrains
git clone https://github.com/Tiny-Brains/ants-starter && cd ants-starter
tinybrains games
```

Every game has a starter kit, `<game>-starter`, and it is the place to run the CLI from: a trained
entry, `train.py`, two match files and a `games.toml`. The CLI reads
the game from the `games.toml` in the directory you run it from, and the starter's pins a release of
the cartridge by two digests — the archive's, and the engine's — so the first command that needs
the game downloads it once into `~/.cache/tinybrains/cartridges/` and refuses it unless both match.
Copy that file into any other repository and it works the same way there.

`tinybrains games` prints what is registered and at which engine digest, which is the first thing to
check when a local result disagrees with a ladder one.

### Check it the way admission will

```sh
tinybrains check model.onnx manifest.json
```

This reads the graph from the protobuf, evaluates your manifest over the reference set and runs the
graph on what it produced. It prints the two hashes, the opset, the parameter count, the node count,
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

adapters  (10 reference observations, budget 1000000, turn 1000 ms)
    PASSED
    worst case       229415 operations, 22% of the budget
    slowest graph    7.42 ms of inference  (measured here, not a threshold: no class caps compute)
```

`--json` prints all of it as one object, per case. **A pass is necessary and not sufficient**: the
size class is decided by admission against *your season's* table, and this machine has no season.

### See the tensors your adapter builds

```sh
tinybrains adapt model.onnx manifest.json --out tensors
```

This evaluates every adapter, through **datalogic**, over every reference observation, and writes
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

These are the tensors the ladder will feed your graph. **Before you train, assert that your
trainer's encoder produces the same ones**, element for element. An encoder that disagrees with the
adapter trains a model on inputs the arena never serves, and nothing fails: the rating is simply
lower than training promised.
[A real manifest](adapters/walkthrough.md#the-same-encoding-in-your-trainer) shows the test the
platform's own baselines run.

### Play a match

```sh
tinybrains matches/self-play.json      # from a starter checkout
tinybrains view replays/self-play.json
```

A match file names a model and a manifest for each seat, so your entry can play the baselines,
itself, or last week's version on your own machine, through the real cartridge and the real
evaluator. Every run prints the mean operations and inference per seat-turn, and what fraction of
the turn the worst one used. `-v` prints every strike and forfeit as it happens; `--out DIR` writes
the replays somewhere other than `replays/`.

### Match files

A match file is not a format invented for the CLI. It is the rows the ladder's runners claim, plus
the settings the match runs under — so what you play locally is the shape the ladder plays.

```json
{
  "game": "ants",
  "vars": { "max_turns": 300 },
  "rows": [
    { "id": "self-play", "seed": 42, "preset": "open-2", "seat_count": 2,
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
| `weights` + `manifest` | A path or a URL each. Paths resolve against the match file's own directory. The bytes are hashed into a local store before anything runs, so two seats naming identical files are one model |
| `weights_hash` + `manifest_hash` | The two `sha256:` digests of files already in the local store — the form a real ladder row takes |
| `script` | Written orders instead of a model, one entry per turn — one order for every ant (`"E"`) or one per ant in `mine` order (`["E", "W"]`); past the end of the script the seat holds. It never reaches a model and still goes through the cartridge |

What is derived when a field is missing:

| Field | If absent |
|---|---|
| `game` | `"ants"` |
| `id` | `match-<index>`; it names the replay file |
| `seat_count` | the number of seats, and it is only checked when present |
| `seat` | the seat's position in the list |
| `label` | the weights file's name, or a short hash |
| `map` | the seed picks a board from the preset's pool |

**`vars` override the cartridge, and only where you write one.** `max_turns` and `turn_ms` fall
through to the game's limits and `budget_ops` to its adapter budget, all printed on every run. A
starter writes `max_turns: 300` because a local match should be short, and nothing else — a number
written down stops tracking the platform.

A preset is a **pool of boards** and the seed picks from it, so you cannot choose the board a ranked
match is played on; pin one while you iterate with `"map": "cave-2-03"` on a row. Several rows in one
file play in one command, so one row per board with `map` pinned plays every board of a preset
(`tinybrains maps` lists them; a file holds one preset). The ladder plays one row at a time, so a
long file is volume, not a rehearsal of how production batches.

### Train against the real engine

```sh
tinybrains env
```

**This is the answer to encoding the game twice.** A training loop needs to step the world, and
writing a second implementation of the rules in Python is how a model ends up strong against your
copy of the game and weak against the real one. `env` puts the actual cartridge behind a JSON Lines
protocol on stdin and stdout, one object per line: the first line out is a `hello` carrying the
engine digest and the evaluator's version, then `{"op": "observe"}` returns every live seat's
observation and `{"op": "step", "actions": [...]}` advances them, with finished matches reported in
`ended` and replaced from the pool.

```jsonc
← {"ok":true,"hello":{"game":"ants","engine_digest":"sha256:…","presets":[…],"waves":4}}
→ {"op":"observe"}
← {"ok":true,"turn":0,"seats":[{"w":0,"m":0,"ep":0,"seat":0,"obs":{…}},…],"scores":[…],"ended":[]}
→ {"op":"step","actions":["NNE-","-W",…]}
← {"ok":true,"turn":1,"seats":[…],"scores":[…],"ended":[{"ep":3,"ranks":[1,2],"reason":"lone_survivor",…}]}
→ {"op":"close"}
```

It runs a pool of waves so a batch of matches advances together, and every error is fatal — one
`{"ok": false, "error": …}` line and exit, because a loop that has lost the seat order has no
correct way to carry on and a recoverable-looking failure is how a run quietly trains on misaligned
actions. Record the `hello` line's digest in your model card: an entry that cannot name the engine
it trained against cannot be reproduced.

**`env` is not the referee.** It has no turn deadline, no strike ceiling and no adapter evaluation —
it steps the world and nothing else. A result from it is not a result; `tinybrains check` and a
played match are the gates.

### Get the boards

```sh
tinybrains maps                  # every preset, its dimensions and generation inputs
tinybrains maps export ants out  # write them out, byte-for-byte as the engine ships them
```

Useful for building a curriculum, or for asserting that a board your trainer generated is one the
ladder actually plays.

### Prove a replay reproduces

```sh
tinybrains conform replays/self-play.json
```

This rebuilds a match from its replay envelope alone, plays it locally, and diffs every field and
every turn of the action stream. It is how the platform keeps its own local runner and its match
workflow telling the same story about the same seeds, and it is worth running on a replay of your
own entry: a difference means the two engines disagree, which is a bug worth reporting.

## What you cannot check here

| | Why |
|---|---|
| Your weight class | It is decided against **your season's** table, which this machine does not have. `check` prints the metric; the season turns it into a class |
| Whether your files are where the platform expects | The platform reads them from the bucket you upload to, not from your disk |
| Whether a late-game turn fits the budget | The reference set is ten observations. A crowded board can cost more than any of them |
| How your entry rates | That is the ladder's, over many matches against many opponents |
| Whether your head is a shape the referee can read | `check` decodes it, so this one *is* covered — but only `check` covers it. `env` does not evaluate a manifest at all |

## Check the actions too

`check` confirms that your head decodes to a valid action on every reference observation. It does
not confirm the action is any *good*, and it cannot: the platform reads your head with a fixed
channel order, so a graph trained against a rotated order produces valid moves in the wrong
directions and passes everything. Play a match and count the moves — a model whose hold channel
wins everywhere plays valid actions and never moves:

```sh
python3 -c "import json,collections; d=json.load(open('replays/self-play.json')); \
  [print('seat', i, collections.Counter(c for t in d['deltas'] for c in t['a'][i])) \
   for i in range(len(d['deltas'][0]['a']))]"
```

Count it **per seat**. Folded together, one seat's moves cover for the other's, and a colony that
never moved reads as a match that looked busy.

<div class="tb-replay" data-src="tutorials/8-idle.json" data-turn="10" data-zoom="5"></div>

<p class="tb-replay-caption">What that looks like. Seat 1 answered all ten turns and moved nothing:
its ant is on the square it started on, and the food beside its hill went into a hive it cannot
spend, because its own ant is standing on the only square an ant of its can appear on. Seat 0, same
board and same rules, is three ants and halfway across the map. The count above on this replay gives
seat 0 ten easts, one south and its holds — and seat 1 ten holds and nothing else.</p>

<!-- replay-visualiser: testing-behaviour — filled.
Asset: tutorials/8-idle.json, turn 10 (its last). Regenerate with tutorials/build.sh.
It sits in this section rather than at the end of the page because it is what the count above
finds. The prose stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Before submitting

Confirm every preset's shapes, every adapter's budget, the channel order, the size metric and the
turn timing. **Hash the final files after every edit**: reformatting a manifest changes its hash and
its size, and the hash you declare is what the upload is checked against. Keep both hashes with
your training notes, so that a result can always be traced to the version that produced it.

