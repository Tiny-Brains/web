# A real manifest, piece by piece

The trained models in the starter kit (`nano-bc` and `micro-bc` in
[ants-starter/models](https://github.com/Tiny-Brains/ants-starter/tree/main/models), trained by
[ants/baselines](https://github.com/Tiny-Brains/ants/tree/main/baselines)) play with one manifest,
byte for byte: 930 bytes. It declares one input and one output, and its single adapter turns an
observation into seven planes stacked as one tensor, `board: i8[1, 7, H, W]`. The graph answers
`policy: f32[1, 5, H, W]`, and the referee reads it.

Nobody writes it by hand. `ants/baselines/src/tb_baselines/planes.py` declares each plane once,
with two renderings side by side (the JSONLogic below, and the numpy the trainer uses), and a test
proves the two agree. [The same encoding in your trainer](#the-same-encoding-in-your-trainer) shows
why your trainer needs that test too.

Every fragment below has a link that opens it in [DataLogic Studio](studio.md), against this
illustrative observation:

```json
{"size": [64, 96], "mine": [[12, 30], [13, 30], [43, 66]], "foes": [[12, 33, 1]],
 "food": [[11, 31]], "hills": [[12, 30, 0], [44, 70, 1]],
 "water": {"rle": [0, 1250, 1, 3, 0, 4891]},
 "vis": {"rle": [0, 1054, 1, 11, 0, 5079]}}
```

It holds three ants (one on your hill at `[12, 30]`, one beside it, and a third within sight of the
enemy hill at `[44, 70]`), a foe next to the first two, one food, three cells of known water on row
13, and the eleven cells visible this turn.

## The declaration

```json
"inputs":  [{ "name": "board",  "dtype": "i8",  "shape": [1, 7, "H", "W"], "adapter": … }],
"outputs": [{ "name": "policy", "dtype": "f32", "shape": [1, 5, "H", "W"] }],
"probe_dims": { "H": 128, "W": 128 }
```

`H` and `W` are **names**. They bind to the size of the board each call brings, and because the
output names the same two, the graph must answer at the size it received. A season's boards can be
any size from 24 to 124 a side and at most 14,880 squares, and one admitted session serves them
all. This manifest's `probe_dims` admits it at 128 × 128, 16,384 squares, which is more than any
board the game allows, so its probe covers every board. The largest is 14,880 squares, the
120 × 124 basic board: declare at least that in a manifest of your own
([why](../adapters.md#probe-at-the-biggest-board)).

## The whole adapter

{{#studio studio/baseline-in.json embed}}

The Studio evaluates the JSON half and stops at the tensor half. It shows each tensor call with its
arguments worked out (the points, the shape, the dtype), the same arguments the node's operator
receives, and it never builds the tensor.
[Seeing it in DataLogic Studio](studio.md) says what to look at, and where the Studio and the arena
disagree.

The next link runs the same program against a real input: one of the 207 observations admission
probes every entry against. It is a seat on a three-seat basic board, so its foes are labelled 1
and 2:

{{#studio studio/baseline-in-reference.json nocode}}

## Seven planes

Each plane is an `H × W` grid of `0` and `1`, built from one field of the observation:

| # | Plane | Built by | Tells the graph |
|---|---|---|---|
| 0 | your ants | `{"scatter": [{"var": "mine"}, {"var": "size"}, "i8"]}` | Your ants: the only positions the game gives you in full |
| 1 | foes | a scatter of `foes`, owner stripped | Enemy ants you can see this turn |
| 2 | food | `{"scatter": [{"var": "food"}, {"var": "size"}, "i8"]}` | Food you can see |
| 3 | water | `{"rle_expand": [{"var": "water.rle"}, {"var": "size"}, "i8"]}` | Known water: the one field the game remembers for you |
| 4 | your hills | a scatter of `hills` whose owner is `0` | Each costs you a point when an enemy razes it |
| 5 | enemy hills | a scatter of `hills` whose owner is not `0` | Each earns you two points when you raze it |
| 6 | visible | `{"rle_expand": [{"var": "vis.rle"}, {"var": "size"}, "i8"]}` | Every cell you can see this turn |

`scatter` starts from a grid of zeros in the given shape and writes `1` at each `[row, col]` point.
The shape is `{"var": "size"}`, which the adapter reads from the observation. An adapter that writes
`[80, 80]` into itself fails on every other board size.

### Stripping the owner

A foe arrives as `[row, col, owner]`, and `scatter` reads a third element as **the value to write**.
On a two-seat board every foe is labelled `1`, so a scatter of the raw triples writes the right
value by accident. On boards with more seats the label runs up to 7, and the scatter writes that
label into the plane. Strip the owner, so a `1` in the plane means "a foe is here" for every foe. A
`map` rebuilds each triple as a pair:

{{#studio studio/foe-positions.json}}

Inside the `map` body the document is one foe, so `{"var": "0"}` is its row and `{"var": "1"}` its
column.

### Splitting hills by owner

`hills` holds both sides' standing hills, and owners are **relative to you**: `0` is always yours,
and `1` upward is an opponent ([ownership labels](../observation.md#ownership-labels)). A `filter`
on the third element selects one side, and the same `map` strips the owner:

{{#studio studio/own-hills.json}}

The enemy plane is the same expression with `!=`. Two planes take two expressions, because an
adapter returns one tensor, and an object holding two is not a tensor
([why](dialect.md#expressions-and-the-one-rule-about-objects)).

### Water, and what you can see

Both are run-length masks in row-major order, `[value, count, value, count, …]`, and `rle_expand`
unrolls each into a plane with no JSON loop over the cells. The runs must not add up to more than
`H × W`, and the game's runs always add up to `H × W`.

You need both planes to read a `0` in `water`. It means known land **or never seen**, and the game
does not tell those apart. `vis` answers the half of that question the observation can: under a `1`
for visible, a `0` for water is land you are looking at; under a `0`, it means only that no water
is known there.

> **The game sends `vis`, and your adapter cannot derive it.** Deriving it means marking every cell
> within squared radius 77 of one of your ants on a board that wraps. **This language cannot
> express that**: it is a disk drawn per ant, and an inner iterator cannot see the enclosing ant
> ([scope](dialect.md#reaching-outwards-and-the-one-place-you-cannot)). The engine computes the mask
> anyway and sends it, and one `rle_expand` turns it into the plane.

### Stacking, and the batch axis

```json
{"reshape": [
  {"stack": [[<plane 0>, <plane 1>, …, <plane 6>], 0]},
  {"merge": [[1, 7], {"var": "size"}]}
]}
```

`stack` on axis 0 turns seven `[H, W]` planes into one `[7, H, W]` tensor. `reshape` adds the
leading axis of `1`, with the shape built at run time (`merge` of `[1, 7]` and the size is
`[1, 7, 64, 96]`), and costs a single operation, because a reshape moves no elements.

The leading `1` is the batch axis. The manifest declares it as the literal `1`, because a match runs
one seat per call and nothing batches. You can still export the graph with a dynamic axis there: it
costs nothing and keeps the artifact usable in a trainer that batches.

**The adapter's result is the tensor itself.** The input's `name` in the declaration names it. An
adapter that returned `{"board": …}` would call an operator named `board`.

## What it costs

`tinybrains adapt` runs the manifest over the cartridge's reference observations and prints what
each one charged. Measured on 19 September 2026 over the five basic boards the reference set is
drawn on, this adapter charged the following on the smallest, one in the middle and the largest:

| Board | Cells | Operations | Of the budget |
|---|---:|---:|---:|
| 24 × 24 | 576 | 8,103 – 8,127 | 1% |
| 48 × 64 | 3,072 | 43,057 – 43,109 | 4% |
| 120 × 124 | 14,880 | 208,361 – 208,423 | 21% |

**You pay for the board's cells.** The node charges a plane-building operator for every cell it
produces, whether or not it writes anything there. Five scatters and two RLE expansions each produce
a full grid, and the stack reads all seven planes again: fourteen charges per cell, 208,320 at
120 × 124. The ants, foes, food and hills add a few operations each, and everything else is noise.

**That is the whole bill.** The referee gathers the policy at your ants and charges your budget
nothing for it ([why](../adapters.md#why-you-do-not-write-the-head)). A program of your own that
read the policy back would pay for all five channels of every cell: another 82,000 operations at
128 × 128, a third of the total.

[The budget](budget.md#what-each-operator-charges) lists what every operator charges.

## Where the head goes

The graph answers `policy: f32[1, 5, H, W]`, five scores for every move at every cell. The referee
gathers the five channels at each of your ants' cells, in `mine` order, and takes the argmax of
each. The channel order is `N, E, S, W, -`, published in
[What your model answers](../actions.md#the-two-head-shapes).

Your graph's channels must mean the letters in that order. The baselines put the hold, `-`, last. A
graph whose last channel wins everywhere plays valid actions, and its whole colony stands still for
the entire match. [Testing](../testing.md#check-the-actions-too) shows one, and how to count your
own moves.

If your graph indexes into the board itself and answers `[N, 5]` in `mine` order, declare that shape
instead and the referee skips the gather. It is cheaper on large boards, and it limits which axes
you may name ([why](../adapters.md#a-dimension-may-be-a-name)).

## The same encoding in your trainer

A model you train in Python sees observations through a numpy encoder and plays through
`manifest.json`: one encoding, written twice. If the two disagree, nothing fails. The model trains
on one distribution and plays on another, and the only symptom is a rating below what training
promised.

Copy the baselines' answer. `planes.py` declares every plane once, with both renderings next to
each other, and `tests/test_adapter_conformance.py` runs `tinybrains adapt` (**datalogic, the
evaluator a node runs the manifest on**) over the cartridge's reference observations and asserts
that the adapter's tensors equal the numpy encoder's, element for element:

```python
theirs = np.load(out / f"case-{i}" / "board.npy")            # the ladder's own tensor
ours = planes.encode(json.loads((out / f"case-{i}" / "observation.json").read_text()))
assert np.array_equal(ours, theirs)
```

[Testing before you submit](../testing.md#see-the-tensors-your-adapter-builds) shows the command.
