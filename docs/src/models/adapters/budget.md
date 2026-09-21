# The budget

Ants allows **1,000,000 operations per adapter evaluation**. Each declared input's adapter gets its
own million, so a manifest with two inputs gets two: the ceiling applies to each evaluation, and one
call evaluates every input's adapter. The count leaves out inference, and the whole call (your
adapters and the graph) has to fit the turn deadline.

## What counts as an operation

- **Every node the evaluator visits costs 1**: an operator, a literal, each element of an array
  written in the program. A loop body pays again for every element it runs over, and a branch the
  evaluator skips pays nothing.
- **A constant-folded subtree costs nothing**, and the evaluator charges once for a subtree it
  recognises twice. Both are optimisations, and both can change between versions.
- **Every tensor operator also charges for the elements it moves**, by its own rule below. The node
  charges **before** the work, so it refuses an operator that would exceed the budget and never runs
  it.

`{"zeros": [[128, 128], "i8"]}` costs about 16,389: 1 for the operator, 16,384 for the elements it
produces, and a handful for evaluating its arguments (the shape array, its two numbers, and the
dtype).

## What each operator charges

Each operator charges the amount below on top of its own 1 and the cost of evaluating its
arguments. `n` is the number of elements in the tensor argument, and `m` the number in the result.

| Operator | Charge |
|---|---|
| `zeros`, `full` | `m` |
| `tensor` | `m` |
| `scatter` | the larger of the number of points and `m`. **A scatter pays for the whole grid**, however few points it writes |
| `rle_expand` | the larger of `len(runs)` and `m` |
| `one_hot` | `len(indices) × depth` |
| `stack`, `concat` | the elements of all the inputs |
| `unstack`, `transpose`, `cast`, `normalize`, `to_list` | `n` |
| `pad`, `crop`, `gather` | the larger of `n` and `m` |
| `argmax` | `n`: it reads everything |
| `reshape`, `shape`, `dtype` | 1: a reshape moves no elements |

> **The platform does not promise these numbers.** The engine's own documentation says an operation
> count can change between versions: a new fast path or a constant fold changes what the engine
> dispatches. Budget for the work, with headroom above the number you measured. An adapter at
> 990,000 against a 1,000,000 ceiling is one patch release away from a strike.

## What a real manifest costs

The baselines' adapter builds seven planes, and [A real manifest, piece by piece](walkthrough.md)
reads it in full. `tinybrains adapt` measured it over the reference observations on 19 September
2026, across the five basic boards the set is drawn on. The worst case on the smallest, one in the
middle and the largest:

| Board | Cells | Operations | Of the budget |
|---|---:|---:|---:|
| 24 × 24 | 576 | 8,127 | 1% |
| 48 × 64 | 3,072 | 43,109 | 4% |
| 120 × 124 | 14,880 | 208,423 | 21% |

**The cost follows the board's cells**: about 14 operations per cell, because each of the seven
planes is a full grid and the stack reads all seven again. The ants, foes, food and hills add a few
operations each, lost in the rounding. A season's boards can run from 24 × 24 (576 cells) to 14,880
cells, and the largest costs a fifth of the budget.

## What over budget means

The node stops evaluation the moment a charge crosses the budget. At admission that is a rejection,
`ADAPTER_OVER_BUDGET`; in a match it is a strike, like a missed deadline, and five cumulative strikes
forfeit the seat. The node never retries: the same adapter on the same observation costs the same on
any machine.

Passing admission does not prove every later turn fits. The node counts on real input, and a
late-game turn (more ants, more food and foes in sight) can cost more than any reference case. An
adapter whose cost follows the board, as the baselines' does, stays predictable; one whose loops run
over ants or visible objects grows with the game.

## Measuring before you submit

`tinybrains adapt model.onnx manifest.json` prints what every reference case charged, and `--obs`
measures observations of your own. `tinybrains check` reports the worst case and the fraction of the
budget it used. [Testing before you submit](../testing.md) has both.

## Spending less

- Build planes with `scatter` and `rle_expand`, never with a JSON loop over cells.
- **Each plane costs about two operations per cell**: one to build it and one for the stack to read
  it. Dropping a plane your graph does not use is the cheapest saving there is.
- Read `vis`: it is one `rle_expand`, and the language cannot express deriving it
  ([why](dialect.md#reaching-outwards-and-the-one-place-you-cannot)).
- Prefer one input over several. Each is its own evaluation with its own million, and each re-reads
  the observation.
- The head costs you nothing, because the referee reads it. A program of your own that read it back
  would pay for all five channels of every cell: ~82,000 operations at 128 × 128.

Test across [the limits](../../games/ants/maps.md#the-limits-every-board-is-inside): a 120 × 124
board has about 26 times the cells of a 24 × 24 one, and an adapter whose cost follows the board
costs that much more on it.
