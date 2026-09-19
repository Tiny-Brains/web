# Weight classes

TinyBrains groups entries by the size of the two files you submit. Your class is assigned
automatically at admission; it is not a field you choose when submitting. Every active entry also
participates in the Open ladder.

## The classes are the season's

**A season declares its own size limits, so read them from the season you are
entering rather than from this page.** The API returns them on every season it
reports — `GET /v1/games/{game}` and `GET /v1/games/{game}/seasons` both carry a
`weight_classes` table — and the site shows them on the home page and beside your
entry. A season may also offer only some of the classes: a focused season might run
Nano alone, and a model measuring into a class it is not running is rejected
`CLASS_NOT_OFFERED` — which is not the same refusal as being too large for every
class there is.

These are the limits the platform started with, and the default a new season
inherits from the season before it:

| Class | Maximum measured size |
|---|---:|
| Nano (`nano`) | 16 KiB = 16,384 bytes |
| Micro (`micro`) | 128 KiB = 131,072 bytes |
| Mini (`mini`) | 1 MiB = 1,048,576 bytes |
| Small (`small`) | 8 MiB = 8,388,608 bytes |
| Large (`large`) | 64 MiB = 67,108,864 bytes |

Limits are inclusive. Under the table above an entry measuring exactly 16,384 bytes is Nano and
16,385 bytes is Micro; an entry over the largest class the season offers is too large for that
season.

**Size is the only thing your class limits.** There is no compute cap: a class does not ration how
much arithmetic your graph may do. What bounds that is the game's turn deadline — 1,000 ms for Ants,
**yours alone**, since each seat is its own call — and a graph too slow to answer in it misses the
turn and takes a [strike](../competing/matches.md). Admission measures and reports your inference
time on the reference set; it does not reject you for it.

Because the size limits belong to the season, **a class result is comparable within
its season and not necessarily across seasons.** Two seasons that ran different Nano
limits produced two different competitions, and the standings say which limits they
were played under.

## How many parameters that actually is

The metric is the file's bytes, so what fits depends on the dtype you export in — directly, with no
compression in between:

| Initializer dtype | Bytes per parameter | Relative capacity |
|---|---:|---:|
| `float32` | 4 | 1.00x |
| `float16` | 2 | **2.00x** |
| `int8` | 1 | 4.00x |

**Exporting float16 weights doubles the model your class holds**, and costs nothing you would
notice: keep the graph's compute in float32 by casting each initializer back at its use, and the
runtime folds that cast away when it optimises the plan. The operator set does not change — `Cast`
is allowed — and in a measured comparison the float16 graph chose the same move as the float32 one
on every ant of three matches.

Subtract your manifest first. The baselines' is 930 bytes, which is 6% of a Nano budget and nothing
at all above that.

Two worked examples, which are the platform's own baselines:

| | Parameters | `model.onnx` | `manifest.json` | `S'` | Of its cap |
|---|---:|---:|---:|---:|---:|
| `nano-bc` | 3,006 | 11,350 | 930 | 12,280 | 75% of Nano |
| `micro-bc` | 24,077 | 53,495 | 931 | 54,426 | 42% of Micro |

## The deadline, not the class, is what limits a big model

The table above is generous at the top and the turn is not. **Your seat owns the whole turn** —
1,000 ms, one `model_infer` call per seat with its own deadline — which is thirty times what it
owned when a wave of sixteen matches divided one call between them.

That is a real loosening, and the structural point survives it: **a fully convolutional network
over the largest Ants board still runs out of turn well before it runs out of bytes.** Filling Mini
and above means spending parameters where they cost less per turn — at a reduced resolution, or in
a lookup that is read rather than multiplied — not simply making the same network wider.

The reason is worth stating plainly, because it is structural rather than a tuning
problem. In a convolution every parameter is applied at every cell, so bytes and arithmetic are locked
together: one parameter costs `2 × cells` multiply-accumulates, and nothing about the kernel size,
the grouping or the dtype changes that ratio. A class cap is a budget in bytes; the turn is a budget
in arithmetic; and the two run out at different sizes.

Admission reports your measured inference time and never rejects you for it. The
rejection, if it comes, comes later and looks like a [strike](../competing/matches.md).

## How your class is decided

The [size metric](format.md#how-size-is-measured) is `bytes(model.onnx) + bytes(manifest.json)`.
Admission chooses the smallest class whose size limit contains that total **in the season you
submitted to**. That is the whole rule — there is no second check, and no class is chosen for you
to give you more compute, because compute is not what a class rations.

Measure the pair rather than estimating from parameter count. Graph metadata, an exporter's node
names and the manifest's own length all count. A larger manifest can move an otherwise unchanged
network into the next class.

## The Open ladder

Open compares models across all sizes. It is an additional rating, not a sixth
size class, and has no separate submission artifact.

A match whose competitors all share a class updates that class and Open. A
mixed-class match updates Open only. Ratings from different class ladders are
not directly comparable; use Open to compare entries of different sizes.

## Choosing what to enter

Begin with a model you can train, inspect, and run reliably. Measure size early,
leave operation-budget headroom for larger observations, watch your inference time
against the turn deadline, and verify every basic board — the game's limits — before
optimizing for a boundary.

There is no automatic score bonus for unused bytes within a class. Smaller size
is the constraint and engineering challenge; [ranking](../competing/ranking.md)
still comes from game results. Compare revisions using both their measured size
and their match performance.
