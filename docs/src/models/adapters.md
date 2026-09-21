# The manifest

Your entry is two files: the network, and `manifest.json`. The manifest declares what your graph
takes and returns (each input and output by name, dtype and shape) and carries one small program
per input: an **adapter** that turns the game's observation into that tensor. The graph never sees
JSON, and the game never sees a tensor.

An adapter is a JSONLogic expression tree with tensor operators: **data that the node evaluates**
under an operation budget it counts itself. The platform hashes the manifest's exact bytes into your
submission and **adds them to the graph's bytes** to give your size metric.

## One turn, end to end

```text
observation (JSON)           {"size": [64, 96], "mine": [[12, 30], …], …}
      │
      ▼   adapter            the node evaluates your program, once per declared input
tensors                      {"board": i8[1, 7, 64, 96]}
      │
      ▼   model.onnx         tract runs your graph
tensors                      {"policy": f32[1, 5, 64, 96]}
      │
      ▼   the referee        the platform reads your policy head
action (JSON)                ["N", "-", "E"]
```

All three steps share one turn deadline, 1,000 ms for the whole seat, and each adapter has its own
[budget](adapters/budget.md) of 1,000,000 operations.

**You do not write the last arrow.** The channel order, the gather at your ants' cells and the
argmax are rules of the *game*. [What your model answers](actions.md) is the whole contract, and a
section below explains [why](#why-you-do-not-write-the-head).

## The file

```json
{
  "abi": "orion:model@1.0.0",
  "name": "my-entry",
  "version": "1",
  "format": "onnx",
  "description": "seven planes in, a per-cell policy out",
  "inputs":  [ { "name": "board",  "dtype": "i8",  "shape": [1, 7, "H", "W"], "adapter": <program> } ],
  "outputs": [ { "name": "policy", "dtype": "f32", "shape": [1, 5, "H", "W"] } ],
  "probe_dims": { "H": 120, "W": 124 }
}
```

| Field | Must be |
|---|---|
| `abi` | `"orion:model@1.0.0"`. The platform refuses any other value |
| `name` | Yours, for your own records. **The platform registers your model under an id of its own**, so this name documents the model and identifies nothing |
| `inputs` | One entry per graph input, each with `name`, `dtype`, `shape` and `adapter`. The name must be the graph's own input name |
| `outputs` | One entry per graph output, each with `name`, `dtype` and `shape`, and no adapter: the platform reads it |
| `probe_dims` | The size admission probes each named dimension at. See [below](#probe-at-the-biggest-board) |
| `result` | **Not allowed.** The platform refuses a manifest carrying one with `RESULT_NOT_ALLOWED` |

The platform ignores other top-level keys, but they are still bytes: they change the hash and count
toward your size.

## A dimension may be a name

A shape is a list, and each entry is **a positive integer or a name**:

```json
"shape": [1, 7, "H", "W"]
```

A name binds on its first occurrence in a call, in an input's shape or an output's, and every later
occurrence must equal that binding. An axis you write as a number must equal that number.

Names let one entry play every board a season runs. A season's Ants boards can be any size from 24
to 124 a side, up to 14,880 squares, and a season can add a board while it runs. A fully
convolutional network names `H` and `W`, and one admitted session serves every board. An entry with
fixed spatial dimensions is legal and plays only the boards it declared; the node refuses it at the
first observation of any other size.

> **A graph that computes its own indices cannot name its axes.** If your network computes a flat
> index from `H` and `W` inside itself (a `Shape` → `Mul` → `Gather` chain, the usual export of a
> `tensor[batch, idx]` lookup), the runtime cannot type-check it against a symbol and refuses to
> build a plan. Either declare concrete spatial dimensions and play one board size, or move the
> indexing out of the graph. Admission reports a failed plan with the runtime's own message.

### Probe at the biggest board

Admission runs five inferences on zero-filled inputs, and the median must fit the game's turn
deadline, 1,000 ms for Ants. It runs them at `probe_dims`, which **you declare**. Declare `{"H": 24, "W": 24}` and
you get a verdict on a 24×24 board, while a season may also play you at 120×124, the size where a
slow turn would strike you. Declare the largest board the game allows: 14,880 squares, the 120×124
basic board. A season can add a board while it runs, so its largest board today can be
outgrown ([The maps](../games/ants/maps.md#the-limits-every-board-is-inside)). Admission probes a
name with no `probe_dims` entry at 1.

## The adapter

Each input has one adapter, and the node evaluates it against **the observation as the game sends
it**: `{"var": "mine"}` is your ants and `{"var": "size.1"}` is the board's width. The adapter must
produce a tensor whose dtype and shape match the input's declaration, with names bound as above.

An adapter may not read `{"secret": …}`, `now` or `random`, and registration refuses a manifest
that tries. An adapter also has no filesystem, no network and no memory between turns. The same
adapter on the same observation costs the same on any machine.

## Two halves: JSON, and tensors

A program is JSONLogic (`var`, `map`, `filter`, `reduce`, arithmetic, comparisons) over plain JSON
values, plus **tensor operators** that cross into tensors and back. The split between the two
decides what you can write:

- **A tensor is opaque.** A program can read its shape and its dtype and nothing else: it cannot
  index into a tensor, `map` over one, or do arithmetic on one.
- **Into tensors**: `tensor`, `zeros`, `full`, `scatter`, `rle_expand` and `one_hot` build one from
  JSON.
- **Between tensors**: `stack`, `concat`, `unstack`, `reshape`, `transpose`, `pad`, `crop`, `cast`,
  `normalize` and `gather`.
- **Back to JSON**: `argmax`, `to_list`, `shape` and `dtype`.

The JSON half selects and rearranges the observation (which lists, which fields, which
coordinates), and the tensor half packs the result into the shape your graph expects. Put anything
that *computes* with the numbers in the graph, where it runs compiled. The expression language
leaves out matrix multiply and convolution by design
([why](adapters/dialect.md#what-the-language-will-not-do)).

## A minimal manifest

The smallest complete manifest feeds two planes, your ants and the water you have seen, to a fully
convolutional graph:

```json
{
  "abi": "orion:model@1.0.0",
  "name": "minimal",
  "format": "onnx",
  "inputs": [{
    "name": "board",
    "dtype": "i8",
    "shape": [1, 2, "H", "W"],
    "adapter": {
      "reshape": [
        {"stack": [[
          {"scatter":    [{"var": "mine"},      {"var": "size"}, "i8"]},
          {"rle_expand": [{"var": "water.rle"}, {"var": "size"}, "i8"]}
        ], 0]},
        {"merge": [[1, 2], {"var": "size"}]}
      ]
    }
  }],
  "outputs": [{ "name": "policy", "dtype": "f32", "shape": [1, 5, "H", "W"] }],
  "probe_dims": { "H": 120, "W": 124 }
}
```

`scatter` marks a 1 at each of your ants' coordinates on a board of `size`; `rle_expand` turns the
water run-length list into a plane of the same size; `stack` puts them on a new leading axis, and
`reshape` prepends the batch axis the declaration asks for. `{"var": "size"}` is `[64, 96]` for
[the worked observation](observation.md#a-worked-example), so the result is `i8[1, 2, 64, 96]`: `H`
binds to 64 and `W` to 96, and the output must match the same two.

Open the adapter in DataLogic Studio to see the arguments each operator receives:

{{#studio adapters/studio/minimal-in.json nocode}}

The manifest is complete, and its encoding is poor: it ignores foes, food, hills and visibility.
[A real manifest, piece by piece](adapters/walkthrough.md) covers the one the platform's own
baselines play with.

## Why you do not write the head

The manifest has no program that reads the graph's output and produces the move. The reason
explains a shape in your graph.

A result expression's document is **the output tensors alone**, without the observation. Reading a
per-cell policy means gathering at your ants' cells, and those cells are in the *observation*, so
nobody could write that program unless the platform handed the observation back to it.

The platform could hand it back. Instead the referee reads the head itself, because every entry's
version of that program would be the same gather, character for character: the channel order is a
rule of Ants, like the rule that a move is one cell. [What your model answers](actions.md) states
that rule once, and no competitor's copy of it can differ by a detail.

**You gain** a free gather: those operations cost nothing against your budget, and a class of
silent mistake (a transposed axis, a channel order off by one) cannot happen. **You lose** nothing
you could use. Admission refuses a head in any shape but the two published ones, before the referee
could mis-read it.

## Getting one right

1. Read [a real manifest](adapters/walkthrough.md) end to end: seven planes in, a per-cell policy
   out, and what each piece costs.
2. Open your adapters in [DataLogic Studio](adapters/studio.md) to watch the JSON half run, and
   learn the places where the Studio and the arena disagree.
3. Keep [the expression language](adapters/dialect.md)'s scope rule in mind: inside `map`, `filter`
   and `reduce`, the document is the element, and an outer path reads `null` without an error.
4. Look up any operator in [Operators](adapters/operators.md), and its price in
   [The budget](adapters/budget.md).
5. Run [`tinybrains adapt`](testing.md#see-the-tensors-your-adapter-builds) and compare its tensors
   with your trainer's encoder, element for element, before you train on anything.
