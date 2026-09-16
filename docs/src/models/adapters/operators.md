# Operators

The twenty tensor operators an adapter has, on top of
[the core ones](dialect.md#core-operators). Each is invoked as `{"name": [arguments]}`. Below, `T`
is a tensor, a shape is a list of non-negative integers, and axes count from 0. What each one costs
is in [The budget](budget.md#what-each-operator-charges).

> **Seven of these names are ordinary words**: `shape`, `full`, `cast`, `pad`, `crop`, `concat` and
> `stack`. An object whose only key is one of them is a call, so escape a data key that collides
> with a `$`: `{"$shape": [6, 7]}`.

## Building tensors

| Operator | Arguments | Result |
|---|---|---|
| `zeros` | `shape, dtype` | A tensor of zeros |
| `full` | `shape, dtype, value` | A tensor filled with `value` |
| `tensor` | `value, dtype?` | A nested JSON array, with the shape it already has |
| `scatter` | `points, shape, dtype, value?` | Zeros, with each point written: `[r, c]` writes `value` (default `1`), and `[r, c, v]` writes `v` |
| `rle_expand` | `runs, shape, dtype` | `[v0, n0, v1, n1, …]` expanded in row-major order. Runs past the end fail; runs short of it are padded with zeros |
| `one_hot` | `indices, depth, dtype` | `[len(indices), depth]`, with a `1` at each index. An index outside `0 … depth − 1` gives a row of zeros. There is no axis argument |

A scatter point outside the shape is **dropped, not wrapped**, and a later point on the same cell
overwrites an earlier one. Every value is saturated to the dtype as it is written: `300` into `i8`
is `127`, not a wrapped `44`.

A point's third element is a value, which is why foes and hills are stripped to `[r, c]` before
they make a presence plane:

```json
{"scatter": [
  {"map": [{"var": "foes"}, [{"var": "0"}, {"var": "1"}]]},
  {"var": "size"},
  "i8"
]}
```

The `map` inside it, run against an observation:

{{#studio studio/foe-positions.json nocode}}

## Reshaping and combining

| Operator | Arguments | Result |
|---|---|---|
| `stack` | `tensors, axis` | A new axis at `axis`. Every input must have the same shape and dtype |
| `concat` | `tensors, axis` | Joined along an existing axis. Every other dimension must agree |
| `unstack` | `T, axis` | A JSON list of tensors, one for each index along `axis` |
| `reshape` | `T, shape` | The same elements in a new shape. The element counts must match, and there is no `-1` |
| `transpose` | `T, perm?` | The axes reordered: `perm[i]` is the input axis that becomes axis `i`. Without `perm`, the axes are reversed |
| `pad` | `T, before, after, value` | `before[d]` and `after[d]` cells added on each axis `d`, filled with `value` (default `0`) |
| `crop` | `T, offset, shape` | The `shape`-sized region that starts at `offset`. Any part of it past the input's edge is zeros |

Stacking seven `[H, W]` planes on axis 0 gives `[7, H, W]`, and reshaping that to `[1, 7, H, W]`
adds the batch axis a graph expects. [A real manifest](walkthrough.md#stacking-and-the-batch-axis)
builds the second shape from the observation's size, so one adapter serves every board.

> `stack` takes no dtype argument. Every plane must already be the dtype the input declares, which
> is why each plane's own constructor is given one. Mixing dtypes is an error rather than a silent
> promotion.

## Converting and normalising

| Operator | Arguments | Result |
|---|---|---|
| `cast` | `T, dtype` | Converted. Integer dtypes saturate and truncate toward zero |
| `normalize` | `T, mean, scale?` | `(x − mean) × scale`, as `f32`. `scale` defaults to `1` |

These two are the whole of the arithmetic. There is no add, no multiply and no convolution, on
purpose ([why](dialect.md#what-the-language-will-not-do)).

> **There is no `dilate`.** A previous contract had one, to mark every cell within a squared radius
> of a non-zero cell with wrapping — which existed for exactly one plane, the visibility mask. The
> observation carries [`vis`](../observation.md#what-you-can-see-this-turn) now, so the plane is one
> `rle_expand` and the operator has nothing left to do.

## Reading tensors

| Operator | Arguments | Result |
|---|---|---|
| `argmax` | `T, axis` | A flat JSON list: the winning index along `axis` for every position of the other axes, in row-major order. On a tie, the first wins |
| `gather` | `T, indices, axis?` | A **tensor** of the slices at `indices` along `axis` (default `0`). An index past the end fails the call |
| `to_list` | `T` | The tensor as nested JSON lists |
| `shape` | `T` | Its shape, as a list |
| `dtype` | `T` | Its dtype, as a string |

**An adapter must end in a tensor**, so these are for building one, not for finishing. `shape` and
`dtype` let a program branch on what it has; `to_list` is priced per element like everything else,
so converting a whole board costs the whole board.

> **`argmax` and `gather` are how the referee reads your head**, not how you write one. They are
> listed because an adapter may legitimately use them — a graph with two inputs might derive one
> from a tensor it built — but the ordinary entry never calls either.

## What is not here

`at` and `get` were operators in an earlier contract and are not operators here. What replaced them:

| Was | Is |
|---|---|
| `at(list, i)` | `{"val": [[N], …, {"var": ""}]}` — a path segment is evaluated, so a computed index is a path ([scope](dialect.md#a-path-segment-may-be-computed)) |
| `get(value, path)` | `{"var": "accumulator.0"}` for a reduce's accumulator; a one-element `reduce` to project out of any other computed value ([the pattern](dialect.md#reaching-outwards-and-the-one-place-you-cannot)) |
| `len(list)` | `{"length": […]}`, a core operator |
| `range(n)` | nothing. Build the list you need, or let `scatter` and `rle_expand` do the looping |
