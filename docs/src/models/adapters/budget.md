# The budget

Ants allows **1,000,000 operations per adapter evaluation**. Each declared input's adapter gets its
own million; a manifest with two inputs gets it twice, because the ceiling is per evaluation and not
per call. Inference is not counted, and the whole call — your adapters and the graph — has to fit
the turn deadline.

## What counts as an operation

- **Every node the evaluator visits costs 1**: an operator, a literal, each element of an array
  written in the program. A loop body pays again for every element it runs over, and a branch that
  is not taken pays nothing.
- **A constant-folded subtree costs nothing**, and a subtree the evaluator recognises twice is
  charged once. Both are optimisations, and both can move between versions.
- **Every tensor operator also charges for the elements it moves**, by its own rule below. The
  charge is made **before** the work, so an operator that would exceed the budget is refused rather
  than run.

`{"zeros": [[128, 128], "i8"]}` costs about 16,389: 1 for the operator, 16,384 for the elements it
produces, and a handful for evaluating its arguments — the shape array, its two numbers, and the
dtype.

## What each operator charges

On top of its own 1 and the cost of evaluating its arguments. `n` is the number of elements in the
tensor argument, and `m` the number in the result.

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

> **These numbers are not a contract.** The engine's own documentation says an operation count is
> not stable across versions — a new fast path or a constant fold changes what gets dispatched.
> Budget for the work you want to do, not for a number you measured. An adapter at 990,000 against
> a 1,000,000 ceiling is one patch release away from a strike.

## What a real manifest costs

The baselines' adapter — seven planes in, read in full in
[A real manifest, piece by piece](walkthrough.md) — measured with `tinybrains adapt` over the ten
reference observations. The worst case on each board:

| Board | Cells | Operations | Of the budget |
|---|---:|---:|---:|
| 64 × 96 | 6,144 | 86,091 | 8% |
| 96 × 96 | 9,216 | 129,059 | 12% |
| 128 × 128 | 16,384 | 229,415 | 22% |

**It follows the board, not the ants**: about 14 operations per cell, because seven planes are each
a full grid and the stack reads all seven again. The ants, foes, food and hills add a few operations
each and are lost in the rounding.

## What over budget means

Evaluation stops the moment a charge crosses the budget. At admission that is a rejection,
`ADAPTER_OVER_BUDGET`; in a match it is a strike, like a missed deadline, and five cumulative
strikes forfeit the seat. It is never retried: the same adapter on the same observation costs the
same on any machine.

Passing admission does not prove every later turn fits. The count is taken on real input, and a
late-game turn — more ants, more food and foes in sight — can cost more than any reference case. An
adapter whose cost follows the board, as the baselines' does, is predictable; one whose loops run
over ants or visible objects grows with the game.

## Measuring before you submit

`tinybrains adapt model.onnx manifest.json` prints what every reference case charged, and `--obs`
measures observations of your own. `tinybrains check` reports the worst case and what fraction of
the budget it used. [Testing before you submit](../testing.md) has both.

## Spending less

- Build planes with `scatter` and `rle_expand`, never with a JSON loop over cells.
- **Each plane costs about two operations per cell**: one to build it and one for the stack to read
  it. Dropping a plane your graph does not use is the cheapest saving there is.
- Read `vis` rather than deriving it. It is one `rle_expand`, and deriving it is not expressible
  anyway ([why](dialect.md#reaching-outwards-and-the-one-place-you-cannot)).
- Prefer one input over several. Each is its own evaluation with its own million, but each also
  re-reads the observation.
- The head costs you nothing: the referee reads it. An earlier contract charged an entry ~82,000
  operations at 128 × 128 for a gather everybody wrote identically.

Test every [preset](../../games/ants/maps.md): the 128 × 128 board costs 2.7 times what the
64 × 96 one does.
