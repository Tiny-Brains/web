# Weight classes

TinyBrains groups entries by the size of the two files you submit. Admission assigns your class;
you do not choose it when you submit. Every active entry also carries an Open ladder rating.

## The classes are the season's

**A season declares its own size limits, so read them from the season you are entering; this page
shows the defaults.** The API returns them on every season it reports: `GET /v1/games/{game}` and
`GET /v1/games/{game}/seasons` both carry a `weight_classes` table. The site shows them on the home
page and beside your entry. A season may also offer only some of the classes. A focused season
might run Nano alone, and admission rejects a model that measures into a class the season is not
running with `CLASS_NOT_OFFERED`, a different refusal from being too large for every class.

These are the platform's starting limits, and a new season takes the previous season's limits as
its default:

| Class | Maximum measured size |
|---|---:|
| Nano (`nano`) | 16 KiB = 16,384 bytes |
| Micro (`micro`) | 128 KiB = 131,072 bytes |
| Mini (`mini`) | 1 MiB = 1,048,576 bytes |
| Small (`small`) | 8 MiB = 8,388,608 bytes |
| Large (`large`) | 64 MiB = 67,108,864 bytes |

Limits are inclusive. Under the table above, an entry of 16,384 bytes is Nano and one of 16,385
bytes is Micro. An entry over the largest class the season offers is too large for that season.

**Size is the only thing your class limits.** No class caps compute or rations how much arithmetic
your graph may do. The game's turn deadline bounds that: 1,000 ms for Ants, **yours alone**, since
each seat is its own call. A graph too slow to answer in time misses the turn and takes a
[strike](../competing/matches.md). Admission measures and reports your inference time on the
reference set, and never rejects you for it.

The size limits belong to the season, so **a class result is comparable within its season, and
across seasons only when their limits match.** Two seasons with different Nano limits ran two
different competitions, and the standings say which limits each one played under.

## How many parameters that actually is

The metric counts raw bytes, with no compression in between, so the number of parameters that fit
depends on the dtype you export in:

| Initializer dtype | Bytes per parameter | Relative capacity |
|---|---:|---:|
| `float32` | 4 | 1.00x |
| `float16` | 2 | **2.00x** |
| `int8` | 1 | 4.00x |

**Exporting float16 weights doubles the model your class holds**, at no cost you would notice. Keep
the graph's compute in float32 by casting each initializer back at its use; the runtime folds that
cast away when it optimises the plan. You need no new operator, since `Cast` is on the allowlist. In
a measured comparison, the float16 graph chose the same move as the float32 one on every ant of
three matches.

Subtract your manifest first. The baselines' manifest is 930 bytes: 6% of a Nano budget, and
negligible in the larger classes.

Two worked examples, from the platform's own baselines:

| | Parameters | `model.onnx` | `manifest.json` | `S'` | Of its cap |
|---|---:|---:|---:|---:|---:|
| `nano-bc` | 3,006 | 11,350 | 930 | 12,280 | 75% of Nano |
| `micro-bc` | 24,077 | 53,495 | 931 | 54,426 | 42% of Micro |

## The deadline, not the class, is what limits a big model

The table is generous at the top, and the turn is tight. **Your seat owns the whole turn**:
1,000 ms, one `model_infer` call per seat with its own deadline. Even so, **a fully convolutional
network over the largest Ants board runs out of turn long before it runs out of bytes.** To fill
Mini and above, spend parameters where they cost less per turn: at a reduced resolution, or in a
lookup the graph reads without multiplying. A wider copy of the same network runs out of turn first.

A convolution applies every parameter at every cell, so bytes and arithmetic move together, and no
tuning separates them: one parameter costs `2 × cells` multiply-accumulates, and the kernel size,
the grouping and the dtype leave that ratio unchanged. A class cap is a budget in bytes and the
turn is a budget in arithmetic, and the two run out at different sizes.

Admission reports your measured inference time and never rejects you for it. A model too slow for
the turn finds out in play, where each missed turn is a [strike](../competing/matches.md).

## How your class is decided

The [size metric](format.md#how-size-is-measured) is `bytes(model.onnx) + bytes(manifest.json)`.
Admission chooses the smallest class whose size limit contains that total **in the season you
submitted to**. That is the whole rule. Admission makes no second check and never moves you to
another class for more compute, since a class rations no compute.

Measure the pair's bytes. An estimate from parameter count misses graph metadata, an exporter's node
names and the manifest's own length, which all count, and a larger manifest can push an unchanged
network into the next class.

## The Open ladder

Open compares models across all sizes. It is an additional rating, with no size class and no
separate submission of its own.

A match whose competitors all share a class updates that class and Open; a mixed-class match
updates Open only. You cannot compare ratings from two class ladders, so use Open to compare
entries of different sizes.

## Choosing what to enter

Begin with a model you can train, inspect and run without surprises. Measure size early, leave
operation-budget headroom for larger observations, and watch your inference time against the turn
deadline. Verify every basic board (together they span the game's limits) before you optimize for a
boundary.

Unused bytes within a class earn no score bonus. Size is the constraint you engineer against, and
[ranking](../competing/ranking.md) comes from game results. Compare revisions by both their
measured size and their match performance.
