# The expression language

An adapter is JSONLogic, evaluated by **datalogic** — the same expression engine the platform's
own workflows run on, with its tensor operators. It is not a dialect the platform invented: it is a
published language with its own reference, and this page is the part of it an adapter uses plus the
rules that catch people out.

The node that admits your model and the node that plays it run the same engine at the same version,
and both count every operation they evaluate. A general JSONLogic engine —
[DataLogic Studio](studio.md) included — runs the JSON half the same way, with the differences that
page lists, and counts nothing.

## Expressions, and the one rule about objects

A number, a string, `true`, `false` or `null` is itself. An array evaluates each of its elements.
And then:

> **Every object is an operation.** Its single key is the operator's name, and its value is the
> argument list. A key that is not an operator is an error, and an object with more than one key is
> an error.

**There is no object literal in an adapter.** A program's values are scalars, arrays and tensors,
and nothing else — so `{"mine": …, "theirs": …}` is not a way to return two things, and
`{"width": …, "points": …}` is not a way to carry two things through a `reduce`. Use an array:
`[width, points]`, read back as `accumulator.0` and `accumulator.1`.

> This is the one place the platform's *workflow* language and an *adapter* differ, and it catches
> people who have read both. A workflow's mapping is pre-processed before it reaches the expression
> engine and an object there is data; an adapter is handed to the engine whole. If you are copying
> an expression out of a workflow, the objects will not survive.

The consequence of the rule worth remembering is that **a misspelt operator fails at evaluation,
not at load**: `{"scattr": …}` compiles, and the first observation reports `Invalid operator:
scattr`. **The Studio is where this is cheapest to catch.**

An operator's arguments go in an array, and a single argument may be written bare:
`{"var": "mine"}` is `{"var": ["mine"]}`.

> **A key that collides with an operator is a call, not data.** Seven of the tensor operators are
> ordinary-looking words — `shape`, `full`, `cast`, `pad`, `crop`, `concat`, `stack` — so an object
> you meant as data with one of those as its only key is evaluated. Escape it with a `$`:
> `{"$shape": [6, 7]}`.

## Core operators

These, and the tensor operators in [Operators](operators.md), are what an adapter has. Any other
key is a literal.

| Purpose | Operators |
|---|---|
| Access and presence | `var`, `val`, `missing`, `missing_some`, `??` |
| Branching and Boolean logic | `if`, `?:`, `!`, `!!`, `and`, `or` |
| Comparisons | `==`, `===`, `!=`, `!==`, `>`, `>=`, `<`, `<=` |
| Scalar arithmetic | `+`, `-`, `*`, `/`, `%`, `max`, `min`, `abs`, `ceil`, `floor` |
| Strings and membership | `cat`, `substr`, `in` |
| Collections | `merge`, `map`, `filter`, `reduce`, `all`, `some`, `none`, `length`, `slice`, `sort`, `distinct` |
| Object inspection | `keys`, `values`, `entries`, `type` |

`if`, `and` and `or` evaluate only the branches they need, and a branch that is not evaluated costs
nothing. `??` returns its first argument that is not `null`. `/` and `%` by zero return `null`
rather than failing the turn, so follow them with `??` when a count can be zero. `>`, `>=`, `<` and
`<=` compare two strings as strings and anything else as numbers, and take a third argument for a
range: `{"<=": [0, {"var": "0"}, 63]}` is `0 ≤ row ≤ 63`. `sort` orders values that read as numbers
by value, and the rest as text.

**There is no regular expression operator.** `match` is a `switch`, not a pattern. An adapter that
wants to branch on a string branches on equality.

## Variables and scope

`{"var": "size.0"}` reads the first element of `size`: a path splits on `.`, and a number indexes an
array. An empty path, `{"var": ""}`, is the whole document. A path that does not resolve is `null`,
unless `var` has a second argument, which is its fallback: `{"var": ["hills.0.2", -1]}`.

**Inside `map`, `filter`, `all`, `some` and `none`, the document is the element.** For a coordinate
pair, `{"var": "0"}` is its row. An outer path read from inside a body does not fail — it reads
`null`:

{{#studio studio/scope-trap.json}}

Every ant comes back with a `null` where the board's width was meant to be. Handed to `scatter`, a
`null` coordinate reads as `0`, so every point lands in column 0 and nothing reports a problem.

### Reaching outwards, and the one place you cannot

`{"val": [[N], …]}` climbs out of an iterator. A leading `[N]` at or above the number of enclosing
iterators resolves against the **root** document, so from inside one `map` over `mine`:

{{#studio studio/up-level.json}}

**One level up from one iterator is the root, and there is nothing in between.** Inside a *nested*
iterator the enclosing element is not addressable at all: `{"val": [[1], …]}` reads the innermost
frame and every higher level resolves against the root. So a cross product whose inner body needs
the outer element cannot be written directly, and that is a real limit rather than a missing
operator. (It is why the observation carries [`vis`](../observation.md#what-you-can-see-this-turn):
a visibility mask is a disk drawn per ant, and that is exactly the shape this rule forbids.)

**`reduce` is the way through it.** Its body sees `{"current": <element>, "accumulator": <so far>}`,
and its third argument — the starting accumulator — is evaluated *outside* the loop. So an outer
value the body needs goes into the accumulator, and is handed on at every step. **The accumulator is
an array**, because an object is an operation:

{{#studio studio/reduce-seed.json}}

Three things to copy from that:

- The body returns the **whole** accumulator, `[width, indices]`, or the next step loses the width.
- `accumulator.0` and `accumulator.1` are how the two halves are read. There is no naming them.
- The outer `{"reduce": [[<inner>], {"var": "current.1"}, null]}` is how you get the part you
  wanted out. A reduce over a one-element array whose body projects: it costs one operation, and it
  is the only way to index into a value the program computed rather than one the document holds.

### A path segment may be computed

`{"val": …}`'s segments are evaluated, so a computed index is a path:

```json
{"val": [[1], "data", "dirs", {"var": ""}]}
```

reads `dirs[i]` from the root, where `i` is the element. That is how an index becomes a name
without an `at` operator, and it replaces a nested `if` chain that costs one comparison per branch.

## Tensor values

A tensor is not a nested JSON array. It is an opaque value with a shape and a dtype, made by a
tensor operator and consumed by one. A program may ask it two things — `shape` and `dtype` — and
nothing else: no indexing, no `map`, no arithmetic.

The dtypes are `bool`, `i8`, `u8`, `i16`, `u16`, `i32`, `u32`, `i64`, `u64`, `f32` and `f64`. The
operators that only move bytes also serve `f16` and `bf16`.

On the wire a tensor is `{"tensor": {"dtype", "shape", "data": "<base64>"}}`, which is what you see
if you print one — but a program cannot build one that way and should not try.

A tensor is truthy, and equal only to itself. [Operators](operators.md) lists the ways into a
tensor, and the ways back out.

## Equality and truth

`==` compares the way JavaScript does, with one rule to remember: **`{"==": [0, null]}` is true.**
An unresolved path reads as `null`, and `null` compares equal to every falsy value — so a filter
written against a path that does not resolve does not fail and does not return nothing. It selects
the falsy elements, and looks perfect for exactly as long as the value it is compared against is
zero.

**Compare with `===`, or compare against something that resolves.** This is the single most
expensive mistake available here, and it is available in the platform's own workflows too.

`0`, `""`, `null` and `[]` are false, and everything else is true, `{}` included. `all` and `some`
over an empty list are `false`, and `none` is `true`. Test the turn with no foes and no food in
sight, where all three meet an empty list.

## What the language will not do

There is no tensor arithmetic beyond `cast` and `normalize`: no add, no multiply, no matrix
multiply, no convolution. That is deliberate. A tensor operator is priced by the elements it reads
or produces, which is right for moving data and wrong for computing with it: a 128 × 128 matrix
multiply would be charged about 32,769 operations for two million multiply-adds. An adapter that
could compute would be a second, unpriced model in front of the priced one.

It is against your interest anyway. The adapter is interpreted; the graph is compiled, threaded and
vectorised, and the two share one turn deadline. Put the arithmetic in the graph.

When an operator you want is missing, ask whether it moves or reshapes information, or computes
with it. Moving is the language's job. Computing is the graph's.

## Versions, and what moves under you

There is no `dialect` field to declare: the manifest's `abi` names the contract and the engine is
the node's. What the platform records instead is **the Orion version** that admitted your entry,
because that is what names the expression engine and its counting rules.

> The engine's own documentation is explicit that an operation count **is not stable across
> versions**: a new fast path or a constant fold changes what gets dispatched. **Budget for the work
> you want to do, not for an exact number you measured.** An adapter at 990,000 against a 1,000,000
> ceiling is one patch release from a strike.

When the platform upgrades, a sweep re-checks admitted versions against the new engine. Re-run
[local validation](../testing.md) after an announced upgrade rather than trusting an older pass.
