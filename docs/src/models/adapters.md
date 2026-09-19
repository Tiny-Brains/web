# The manifest

Your entry is two files, and this is the one that is not a network. `manifest.json` declares what
your graph takes and returns — each input and output by name, dtype and shape — and carries one
small program per input: an **adapter** that turns the game's observation into that tensor. The
graph never sees JSON, and the game never sees a tensor.

An adapter is **data, not code**: a JSONLogic expression tree with tensor operators, evaluated by
the node under an operation budget it counts itself. The manifest's exact bytes are hashed into your
submission and **added to the graph's bytes** to give your size metric.

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

All three steps share one turn deadline — 1,000 ms for the whole seat — and each adapter has its own
[budget](adapters/budget.md) of 1,000,000 operations.

**You do not write the last arrow.** The channel order, the gather at your ants' cells and the
argmax are the *game's* rules, not yours; [What your model answers](actions.md) is the whole
contract. That is a change from earlier seasons, and [why](#why-you-do-not-write-the-head) is worth
one paragraph.

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

| Field | What it must be |
|---|---|
| `abi` | `"orion:model@1.0.0"`. Anything else is refused |
| `name` | Yours, for your own records. **The platform registers your model under an id of its own**, so this is documentation rather than identity |
| `inputs` | One entry per graph input, each with `name`, `dtype`, `shape` and `adapter`. The name must be the graph's own input name |
| `outputs` | One entry per graph output, each with `name`, `dtype` and `shape`. No adapter — the platform reads it |
| `probe_dims` | What to admit each named dimension at. See [below](#probe-at-the-biggest-board) |
| `result` | **Not allowed.** A manifest carrying one is refused `RESULT_NOT_ALLOWED` |

Other top-level keys are ignored, but they are still bytes: they change the hash and count toward
your size.

## A dimension may be a name

A shape is a list, and each entry is **a positive integer or a name**:

```json
"shape": [1, 7, "H", "W"]
```

A name binds on its first occurrence in a call — in an input's shape or an output's — and every
later occurrence must equal that binding. Every axis you wrote as a number stays exactly as strict
as it would have been.

This is what lets one entry play every board a season runs. A season's Ants boards may be any size
from 24 to 124 a side, up to 14,880 squares, and it can add one while it runs; a fully convolutional
network names `H` and `W` and one admitted session serves them all.
An entry with fixed spatial dimensions is legal and plays only the boards it declared — the rest
refuse it at the first observation of the wrong size.

> **A graph that indexes internally cannot name its axes.** If your network computes a flat index
> from `H` and `W` inside itself — a `Shape` → `Mul` → `Gather` chain, which is what exporting a
> `tensor[batch, idx]` lookup usually produces — the runtime cannot type-check it against a symbol
> and refuses to build a plan. Declare concrete spatial dimensions and accept that your entry plays
> one board size, or move the indexing out of the graph. Admission tells you which you chose, with
> the runtime's own message.

### Probe at the biggest board

Admission runs five inferences on zero-filled inputs and requires the median to land inside the
node's probe ceiling. It runs them at `probe_dims`, which is **yours to declare** — so declaring
`{"H": 24, "W": 24}` gets you a verdict about a board a season may also play at 120×124, and says
nothing about the one that would actually strike you. Declare the largest board the game allows:
14,880 squares, which the 120×124 basic board is. A season can add a board while it runs, so the
largest board it has today is not the one to declare ([The maps](../games/ants/maps.md#the-limits-every-board-is-inside)).
A name with no `probe_dims` entry is probed at 1.

## The adapter

One per input, evaluated against **the observation exactly as the game sends it**. `{"var": "mine"}`
is your ants and `{"var": "size.1"}` is the board's width. It must produce a tensor whose dtype and
shape match what the input declares, with names bound as above.

An adapter may not read `{"secret": …}`, `now` or `random` — a manifest that tries is refused at
registration — and it has no filesystem, network or memory between turns. The same adapter on the
same observation costs the same on any machine.

## Two halves: JSON, and tensors

A program is JSONLogic — `var`, `map`, `filter`, `reduce`, arithmetic, comparisons — over ordinary
JSON values, plus **tensor operators** that cross into tensors and back. That split is the most
useful thing to know:

- **A tensor is opaque.** A program can ask for its shape and its dtype, and nothing else. There is
  no indexing into a tensor, no `map` over one, and no arithmetic on one.
- **Into tensors**: `tensor`, `zeros`, `full`, `scatter`, `rle_expand` and `one_hot` build one from
  JSON.
- **Between tensors**: `stack`, `concat`, `unstack`, `reshape`, `transpose`, `pad`, `crop`, `cast`,
  `normalize` and `gather`.
- **Back to JSON**: `argmax`, `to_list`, `shape` and `dtype`.

So the JSON half selects and rearranges the observation — which lists, which fields, which
coordinates — and the tensor half packs the result into the shape your graph expects. Anything that
*computes* with the numbers belongs in the graph, where it runs compiled; the expression language
has no matrix multiply and no convolution, on purpose
([why](adapters/dialect.md#what-the-language-will-not-do)).

## A minimal manifest

The smallest complete manifest feeds two planes — your ants, and the water you have seen — to a
fully convolutional graph:

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

`scatter` marks a 1 at every one of your ants' coordinates on a board of `size`; `rle_expand` turns
the water run-length list into a plane of the same size; `stack` puts them on a new leading axis,
and `reshape` prepends the batch axis the declaration asks for. `{"var": "size"}` is `[64, 96]` for
[the worked observation](observation.md#a-worked-example), so the result is `i8[1, 2, 64, 96]` —
`H` binds to 64 and `W` to 96, and the output declaration is held to the same two.

Open the adapter in DataLogic Studio and each operator shows the arguments it will receive:

{{#studio adapters/studio/minimal-in.json nocode}}

It is a complete manifest and a poor encoding: it ignores foes, food, hills and visibility.
[A real manifest, piece by piece](adapters/walkthrough.md) reads the one the platform's own
baselines play with.

## Why you do not write the head

Earlier seasons had a second program — `out` — that read the graph's output and produced the move.
It is gone, and the reason is worth knowing because it explains a shape in your graph.

A result expression's document is **the output tensors alone**. It cannot see the observation. But
reading a per-cell policy means gathering at your ants' cells, and your ants' cells are in the
*observation* — so the one thing everybody's `out` program did could not be written at all without
handing the observation back to it.

The platform could have done that. It did the other thing, because every entry's `out` program was
character-for-character the same gather: the channel order is a rule of Ants, like the fact that a
move is one cell. So the referee reads the head and the rule is published once, in
[What your model answers](actions.md), instead of being re-implemented identically by everyone and
subtly differently by somebody.

**What you gain**: the operations that gather cost you nothing against your budget, and a whole
class of silent mistake — a transposed axis, a channel order off by one — is now impossible.
**What you lose**: nothing you could use. A head that is not one of the two published shapes is
refused at admission rather than mis-read.

## Getting one right

1. Read [a real manifest](adapters/walkthrough.md) end to end: seven planes in, a per-cell policy
   out, and what each piece costs.
2. Open your adapters in [DataLogic Studio](adapters/studio.md) to watch the JSON half run, and
   learn the places where the Studio and the arena disagree.
3. Keep [the expression language](adapters/dialect.md)'s scope rule in mind: inside `map`, `filter`
   and `reduce`, the document is the element, and an outer path quietly reads `null`.
4. Look up any operator in [Operators](adapters/operators.md), and its price in
   [The budget](adapters/budget.md).
5. Run [`tinybrains adapt`](testing.md#see-the-tensors-your-adapter-builds) and compare its tensors
   with your trainer's encoder, element for element, before you train on anything.
