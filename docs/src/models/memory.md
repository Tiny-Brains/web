# Memory

A model can remember. When your season's [weight class](weight-classes.md) allows it, your graph
writes a tensor on one turn and your adapter reads it back on the next, for the rest of the match.
**The runner carries the memory in the open**: it is an output your manifest declares, handed back
on your seat's next view under the output's own name. No node keeps it and none hides it, and a
model that declares no memory plays as it did before this page existed.

## Two memories

A manifest may declare an output named `memory`, one named `ant_memory`, both or neither, beside
its `policy`:

| Output | Shape | What it is for |
|---|---|---|
| `memory` | fixed, or `[1, K, "H", "W"]` | The board: scent, where food was seen, where foes were, what has been explored |
| `ant_memory` | `[1, "N", K]` | One row per ant, in this turn's `mine` order: a target, a role, how long it has chased one |

`ant_memory` needs to know which ant is which, and the observation says so in
[`ids`](observation.md#ant-ids). `memory` needs nothing but the board.

```json
"outputs": [
  { "name": "policy", "dtype": "f32", "shape": [1, 5, "H", "W"] },
  { "name": "memory", "dtype": "f32", "shape": [1, 1, "H", "W"] }
]
```

## One turn, two steps

Each turn the memory passes through two steps, in this order:

1. **The adapter, before the model.** It reads last turn's memory and this turn's observation,
   updates what it can, and hands the model its inputs: the memory as updated, and the board.
2. **The model, after.** It computes its moves, and its `memory` output is the memory for the next
   turn. Where it changes nothing, that output is its input again, through `Identity`, which costs
   nothing.

**The memory carried to the next turn is whatever the model outputs.** An update the adapter makes
reaches it only through a model input, so a graph that should keep the adapter's work echoes that
input back with `Identity`.

The adapter language has no arithmetic between tensors ([why](adapters/dialect.md#what-the-language-will-not-do)),
so the two steps are good at different things. The adapter selects, re-keys and looks things up,
and the graph computes:

| Step | Scent (`memory`) | A target per ant (`ant_memory`) |
|---|---|---|
| Adapter | Passes the scent through, and builds this turn's deposit plane from `mine` with `scatter` | Re-keys last turn's rows to this turn's ants by id, and looks up the food at each stored target |
| Model | `Max(scent × 0.95, deposit)`: decay, then deposit | Drops targets that are reached, gone or stale, picks new ones, moves, and outputs a row for every ant |

## Reading the memory in an adapter

On turn 0 the view has no `memory`, so the adapter builds its own zeros. After that it reads the
key like any other field:

```json
{ "name": "scent_in", "dtype": "f32", "shape": [1, 1, "H", "W"],
  "adapter": { "if": [
    { "var": "memory" },
    { "tensor": [{ "var": "memory" }] },
    { "zeros": [{ "merge": [[1, 1], { "var": "size" }] }, "f32"] } ] } }
```

**Read it with `{"tensor": [{"var": "memory"}]}`.** On a node and in `tinybrains` alike, the key
holds the tensor your graph wrote, and `tensor` passes it through with the dtype and shape your
output declared. A tensor is opaque: an adapter can read its shape and dtype, never its fields, so
a program that looks inside the value finds nothing on either. The one place memory is JSON is an
observation file you give `tinybrains adapt`, which decodes it into a tensor as it loads.

From there the rest of the adapter language applies. `crop` and `concat` shift a history along,
`gather` and `to_list` read a stored value back into JSON for a comparison, and `scatter` writes
this turn's facts onto a plane of the board's size.

## Scent on the board

A scent trail is a board memory. The adapter passes last turn's scent through, as above, and builds
a deposit plane from `mine` as a second input:

```json
{ "name": "deposit", "dtype": "f32", "shape": [1, 1, "H", "W"],
  "adapter": { "reshape": [
    { "scatter": [{ "var": "mine" }, { "var": "size" }, "f32"] },
    { "merge": [[1, 1], { "var": "size" }] } ] } }
```

The graph decays the old scent and lays the new one over it, and outputs the result as `memory`:

```text
memory = Max(scent_in × 0.95, deposit)
```

It needs no ids: a cell is a cell on every turn. The same pattern keeps food seen, foe hills seen or
explored land, with `Max` to remember and a decayed copy to forget.

## A memory per ant

`ant_memory` keeps one row per ant, and **the rows follow the ants by id**, never by position:
`mine` is sorted afresh every turn, so the third row this turn is usually a different ant from the
third row last turn.

The adapter hands the model this turn's `ids` as an input, and the model writes each ant's id into
column 0 of its row. On the next turn the adapter turns last turn's rows into a table indexed by id,
then reads that table back in this turn's `ids` order:

```text
prev   = to_list(ant_memory)                              [P][K] as JSON
col_k  = scatter(map(prev, [row.0, 0, row.k]), [S, 1])    one per column: row id → that column
table  = concat(col_0 … col_K-1, axis 1)                  [S, K], row = id
rows   = reshape(gather(table, ids, 0), [1, N, K])        this turn's ants, in mine order
```

Every step is an operator the adapter language already has: `to_list`, `map`, `scatter`, `concat`,
`gather` and `reshape`. The `map` body reads only its own row, so the
[scope rule](adapters/dialect.md) never bites. Say last turn's ants were 7, 3 and 12, and this
turn's are 3, 12 and 20: ant 7 has died and ant 20 is new. The rows come back as 3's row, then 12's,
then zeros.

Keying by id makes three cases work with no code of their own:

- **A struck turn.** The memory stays at the last one written ([below](#the-carry)), and ids do not
  change, so the rows still find their ants.
- **A dead ant's row** is never read back, and drops out of the next output.
- **A new ant** reads a row of zeros, and the model gives it whatever a new ant gets.

On turn 0 there is no `ant_memory`, and the adapter builds zeros of `[1, N, K]` directly.

**`S`, the table's height, is yours to choose.** `gather` fails the call on an id at or past `S`,
and a seat spawns at most one ant per hill per turn, so `S` above hills per seat × (turns + 1) is
never reached. A smaller `S` can take `id % S` on both sides and accept that two living ants may
share a row. The join's cost grows with `S` and with the number of ants; at `S` = 4,096 it is under
5% of an adapter's [budget](adapters/budget.md). Measure yours with
[`tinybrains adapt`](testing.md#see-the-tensors-your-adapter-builds).

### A target held until it is reached or no longer valid

Store each ant's target as an absolute cell, with `ant_memory` columns
`[id, has_target, tr, tc, turns]`.

**The adapter, before the model:**

1. Re-key last turn's rows to this turn's ants by id, as above.
2. Look up what the model needs at each stored target. For food, flatten the food plane and gather
   it at `tr × W + tc` for each row, as a second input of shape `[1, N]`. The target is an absolute
   cell, so this is one `map` over the rows.

**The model, after:**

1. Keep an ant's target unless it has been reached, the food at it is gone, or the ant has chased
   it for too many turns. That is a `Where` in the graph.
2. Where no target is kept, let the policy head pick a new one.
3. Move toward the target, and output `ant_memory` with a row for every ant.

A blocked move needs no prediction. The engine resolves every move, and next turn the ant's id says
where it ended up.

## The carry

The runner keeps, for each seat of each match, the last value of each memory output, and hands it
back under the same key:

| When | The view's `memory` (and `ant_memory`) |
|---|---|
| Turn 0 | Absent. The adapter builds its own zeros |
| After a call that answered | That call's output of the same name |
| After a call that failed or timed out | Unchanged: the last memory the model wrote |
| A new match | Absent again |

**Seats never share a memory**, even two seats of one model in one match. The referee reads
`policy` alone, and the rules never read a memory, so a replay carries none: re-simulating a match
needs only its actions.

A strike leaves the memory as it was, so a model that fails a call keeps its notes and picks up
where it left off. A model whose memory input cannot take its own output fails every turn after the
first; admission's round trip ([below](#what-admission-checks)) is there to catch that before a
match does.

## The cap

A class allows memory with two numbers, both set by the season: `memory_flat_bytes` and
`memory_cell_bytes`. On a board of `rows × cols` cells, your two memories together may take

```text
cap = memory_flat_bytes + memory_cell_bytes × rows × cols
```

Both default to 0, which is no memory. [Weight classes](weight-classes.md#memory) says where to read
a season's numbers.

**Your memory's price follows its declared shape.** Each output costs its elements times its
dtype's width: 1 byte for `i8`, `u8` and `bool`, 2 for `i16` and `u16`, 4 for `f32`, `i32` and
`u32`, and 8 for `f64`, `i64` and `u64`. An output with no named dimension is a fixed cost. An
output with any named dimension is priced **per cell**: the product of its numbers, times the
board's cells. That covers `ant_memory`'s ant axis too, because a seat can never have more ants
than the board has cells.

- `memory` may name at most two dimensions, and `ant_memory` at most one.
- A shape may not use a name twice.

Admission prices the two outputs together at the smallest board a season can play, 576 cells
(24 × 24), and the largest, 14,880 cells. Both sides grow in a straight line with the cell count,
so a model that fits at both ends fits on every board between, including one the season adds
later. Nothing checks the cap again at play.

A worked example: `memory` as `f32[1, 2, "H", "W"]` is 8 bytes a cell, and `ant_memory` as
`i8[1, "N", 5]` is 5 more. At 14,880 cells that is 193,440 bytes, so the class needs a
`memory_cell_bytes` of 13 or more, or a flat allowance that covers the difference at both ends.
Store what you can as `u8` or `i8` and `Cast` inside the graph: a byte a value is a quarter of the
price of `f32`.

**Memory counts nothing toward your size.** Your class is still decided by the two files' bytes
([`S'`](format.md#how-size-is-measured)). A competitor who wants more memory enters a larger class.
A memory starts at zero every match, so it cannot smuggle weights in.

## What admission checks

Admission decides three of these from your manifest and your class, with no model run, and the
fourth by running your model on its own memory. Each is final and names something only you can
change:

| Reason | When | Next step |
|---|---|---|
| `MEMORY_NOT_ALLOWED` | You declare a memory output, and your class allows 0 and 0 | Remove the output, or enter a class this season gives memory |
| `MEMORY_TOO_LARGE` | The memory's price is past the class's cap at 576 or at 14,880 cells | Shrink the shape or the dtype, or enter a larger class |
| `MEMORY_SHAPE` | Too many named dimensions, a name used twice, or a memory output without a dtype and a shape | Declare it as the [two memories](#two-memories) show |
| `MEMORY_ROUND_TRIP` | Fed its own memory, the model's call failed | Check that each memory input takes exactly what its output writes |

**The round trip chains the reference observations.** Admission plays them in order, and each call
gets the memory the previous one wrote, whenever both observations are on the same board and the
previous call answered. So a model that reads its memory wrongly fails admission, rather than
striking on turn 1 of every match. A bug that shows only later in a match is not caught there: play
a match on your machine to find it.

## One device

Every runner executes models on the CPU, pinned in its configuration. Both seats of a match play on
one runner, so no device can favour a seat, but a memory feeds a last-digit difference back into
every later turn. Pinning the device keeps a match with memory reproducible, and it is also the
faster choice for graphs of this size.

## Testing it

`tinybrains` carries memory under the same rules as a runner: [play a match](testing.md) and
your seat gets its own memory back every turn. `tinybrains check` prints what your memory costs,
fixed and per cell, and takes `--memory-flat-bytes` and `--memory-cell-bytes` to judge it against
a class. `check` also runs the reference observations chained, as admission does. `tinybrains adapt`
accepts an observation carrying `memory` or `ant_memory` as nested arrays or in the wire form, so a
trainer can compare its tensors with the adapter's with the memory set
([Testing](testing.md#check-it-the-way-admission-will)).

One detail of the carry: a call that answers with a head the referee cannot read is a strike, but
the memory it wrote is kept.

A trainer carries its own memory in Python, under the same carry rules. A memory that is a fixed
function of the observations, such as the scent above, trains with the loops you already have: the
trainer computes the same planes in numpy and feeds them in. A memory the graph computes has to be
trained in turn order, since each turn's memory is the graph's own output on the turn before: a
recurrent network with truncated backpropagation through time, carrying between turns the rounded
integer the runner will carry.

The platform's own baselines do both. `ants/baselines` trains any class with `--memory`, two
planes of food seen and enemy hills seen kept with `Max`; its `train/seq.py` trains the same two
planes as a gated update the optimiser shapes, and with `--ants` a row per ant that follows the
ant by id, exactly as [above](#a-memory-per-ant). Its conformance test runs every memory adapter,
the join by id included, through `tinybrains adapt`. Read its `README.md` for what each carried
and what it was worth.
