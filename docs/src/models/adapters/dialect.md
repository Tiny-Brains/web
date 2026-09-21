# The expression language

An adapter is JSONLogic, evaluated by **datalogic**, the expression engine the platform's own
workflows run on, with its tensor operators. JSONLogic is a published language with its own
reference, and the platform did not invent it. This page covers the part an adapter uses and the
rules that catch people out.

The node that admits your model and the node that plays it run the same engine at the same version,
and both count every operation they evaluate. A general JSONLogic engine,
[DataLogic Studio](studio.md) included, runs the JSON half the same way (with the differences that
page lists) and counts nothing.

## Expressions, and the one rule about objects

A number, a string, `true`, `false` or `null` evaluates to itself. An array evaluates each of its
elements. Objects follow one rule:

> **Every object is an operation.** Its single key is the operator's name, and its value is the
> argument list. A key that is not an operator is an error, and an object with more than one key is
> an error.

**An adapter has no object literal.** A program's values are scalars, arrays and tensors, and
nothing else. `{"mine": …, "theirs": …}` cannot return two things, and
`{"width": …, "points": …}` cannot carry two things through a `reduce`. Use an array:
`[width, points]`, which you read back as `accumulator.0` and `accumulator.1`.

> The platform's *workflow* language and an *adapter* differ here and nowhere else, and the
> difference catches people who have read both. Orion pre-processes a workflow's mapping before it
> reaches the expression engine, so an object there is data; the node hands an adapter to the engine
> whole. Objects in an expression you copy out of a workflow will not survive.

Remember one consequence of the rule: **a misspelt operator loads, and fails at evaluation**.
`{"scattr": …}` compiles, and the first observation reports `Invalid operator: scattr`.
**The Studio is the cheapest place to catch it.**

An operator's arguments go in an array, and you may write a single argument bare:
`{"var": "mine"}` is `{"var": ["mine"]}`.

> **A key that collides with an operator calls it.** Seven of the tensor operators are ordinary
> words (`shape`, `full`, `cast`, `pad`, `crop`, `concat`, `stack`), so the engine evaluates an
> object you meant as data if one of those is its only key. Escape it with a `$`:
> `{"$shape": [6, 7]}`.

## Core operators

An adapter has these operators and the tensor operators in [Operators](operators.md). Any other key
is a literal.

| Purpose | Operators |
|---|---|
| Access and presence | `var`, `val`, `missing`, `missing_some`, `??` |
| Branching and Boolean logic | `if`, `?:`, `!`, `!!`, `and`, `or` |
| Comparisons | `==`, `===`, `!=`, `!==`, `>`, `>=`, `<`, `<=` |
| Scalar arithmetic | `+`, `-`, `*`, `/`, `%`, `max`, `min`, `abs`, `ceil`, `floor` |
| Strings and membership | `cat`, `substr`, `in` |
| Collections | `merge`, `map`, `filter`, `reduce`, `all`, `some`, `none`, `length`, `slice`, `sort`, `distinct` |
| Object inspection | `keys`, `values`, `entries`, `type` |

`if`, `and` and `or` evaluate only the branches they need, and a branch they skip costs nothing.
`??` returns its first argument that is not `null`. `/` and `%` by zero return `null` and leave the
turn running, so follow them with `??` when a count can be zero. `>`, `>=`, `<` and `<=` compare two
strings as strings and anything else as numbers, and take a third argument for a range:
`{"<=": [0, {"var": "0"}, 63]}` is `0 ≤ row ≤ 63`. `sort` orders values that read as numbers by
value, and the rest as text.

**The language has no regular expression operator.** `match` works as a `switch` and takes no
pattern. To branch on a string, test it for equality.

## Variables and scope

`{"var": "size.0"}` reads the first element of `size`: a path splits on `.`, and a number indexes an
array. An empty path, `{"var": ""}`, is the whole document. A path that does not resolve reads
`null`, unless you give `var` a second argument as its fallback: `{"var": ["hills.0.2", -1]}`.

**Inside `map`, `filter`, `all`, `some` and `none`, the document is the element.** For a coordinate
pair, `{"var": "0"}` is its row. An outer path read from inside a body reads `null` without failing:

{{#studio studio/scope-trap.json}}

Every ant comes back with a `null` where you meant the board's width to be. `scatter` reads a `null`
coordinate as `0`, so every point lands in column 0 and nothing reports a problem.

### Reaching outwards, and the one place you cannot

`{"val": [[N], …]}` climbs out of an iterator. A leading `[N]` at or above the number of enclosing
iterators resolves against the **root** document, so from inside one `map` over `mine`:

{{#studio studio/up-level.json}}

**One level up from one iterator is the root, with nothing in between.** Inside a *nested* iterator
you cannot address the enclosing element: `{"val": [[1], …]}` reads the innermost frame, and every
higher level resolves against the root. You cannot write a cross product whose inner body needs the
outer element as two nested iterators, and no missing operator causes that: the scope rule sets the
limit. (The observation carries [`vis`](../observation.md#what-you-can-see-this-turn) for this
reason: a visibility mask is a disk drawn per ant, the exact shape this rule forbids.)

**`reduce` gets around it.** Its body sees `{"current": <element>, "accumulator": <so far>}`, and
the engine evaluates its third argument, the starting accumulator, *outside* the loop. Put an outer
value the body needs into the accumulator, and each step hands it on. **The accumulator is an
array**, because an object is an operation:

{{#studio studio/reduce-seed.json}}

Copy three things from that example:

- The body returns the **whole** accumulator, `[width, indices]`, or the next step loses the width.
- You read the two halves as `accumulator.0` and `accumulator.1`. They have no names.
- The outer `{"reduce": [[<inner>], {"var": "current.1"}, null]}` gets the part you wanted out: a
  reduce over a one-element array whose body projects. It costs one operation, and it is the only
  way to index into a value the program computed, as against one the document holds.

### A path segment may be computed

The engine evaluates `{"val": …}`'s segments, so a computed index works as a path:

```json
{"val": [[1], "data", "dirs", {"var": ""}]}
```

reads `dirs[i]` from the root, where `i` is the element. It turns an index into a name with no `at`
operator, and replaces a nested `if` chain that costs one comparison per branch.

## Tensor values

A tensor is an opaque value with a shape and a dtype, which one tensor operator makes and another
consumes. It is not a nested JSON array. A program may ask it two things, `shape` and `dtype`, and
nothing else: no indexing, no `map`, no arithmetic.

The dtypes are `bool`, `i8`, `u8`, `i16`, `u16`, `i32`, `u32`, `i64`, `u64`, `f32` and `f64`. The
operators that only move bytes also serve `f16` and `bf16`.

On the wire a tensor is `{"tensor": {"dtype", "shape", "data": "<base64>"}}`, and you see that form
if you print one. A program cannot build a tensor that way.

A tensor is truthy, and equal only to itself. [Operators](operators.md) lists the ways into a
tensor, and the ways back out.

## Equality and truth

`==` compares the way JavaScript does, with one rule to remember: **`{"==": [0, null]}` is true.**
An unresolved path reads as `null`, and `null` compares equal to every falsy value. A filter written
against a path that does not resolve neither fails nor returns an empty list: it selects the falsy
elements, and looks right for as long as the value it compares against is zero.

**Compare with `===`, or compare against something that resolves.** This is the most expensive
mistake an adapter can make, and the platform's own workflows can make it too.

`0`, `""`, `null` and `[]` are false, and everything else is true, `{}` included. `all` and `some`
over an empty list are `false`, and `none` is `true`. Test the turn with no foes and no food in
sight, where all three meet an empty list.

## What the language will not do

The language has no tensor arithmetic beyond `cast` and `normalize`: no add, no multiply, no matrix
multiply, no convolution. The platform left them out on purpose. The node prices a tensor operator
by the elements it reads or produces, a fair price for moving data and the wrong one for computing
with it: a 128 × 128 matrix multiply would cost about 32,769 operations for two million
multiply-adds. An adapter that could compute would be a second, unpriced model in front of the
priced one.

Arithmetic in the adapter would cost you time as well. The node interprets the adapter and runs the
graph compiled, threaded and vectorised, and the two share one turn deadline. Put the arithmetic in
the graph.

If you miss an operator, ask whether it moves or reshapes information, or computes with it. The
language moves information, and the graph computes.

## Versions, and what moves under you

You declare no `dialect` field: the manifest's `abi` names the contract, and the node supplies the
engine. The platform records **the Orion version** that admitted your entry, because that version
names the expression engine and its counting rules.

> The engine's own documentation states that an operation count **can change between versions**: a
> new fast path or a constant fold changes what the engine dispatches. **Budget for the work, with
> headroom above the count you measured.** An adapter at 990,000 against a 1,000,000 ceiling is one
> patch release from a strike.

After a platform upgrade, a sweep re-checks admitted versions against the new engine. Re-run
[local validation](../testing.md) after an announced upgrade; an older pass says nothing about the
new engine.
