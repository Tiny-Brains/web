# Seeing it in DataLogic Studio

[DataLogic Studio](https://goplasmatic.github.io/datalogic-rs/playground/) is a visual editor and
debugger for JSONLogic, built on datalogic-rs, **the engine the platform runs your adapter on**. The
Studio runs the arena's language: it draws your adapter as a flow diagram, runs it against an
observation, and steps through the evaluation one node at a time.

Every example in this chapter has an **Open in DataLogic Studio** link. The link carries the
expression and the data, so it opens that example evaluated, with no account and nothing to save. A
link you make works the same way: it carries your adapter, and anyone you send it to can read it.

The Studio still differs from the referee in a few narrow places, and the table below lists them.

## Opening your own adapter

1. Open the [Studio](https://goplasmatic.github.io/datalogic-rs/playground/).
2. Tick **Templating**, above the diagram.
3. Paste **one adapter** into Logic: the value of one input's `adapter` key, without the rest of the
   manifest.
4. Paste an observation into Data.
5. **Share** copies a link to what is on the screen.

For observations to paste, [What your model sees](../observation.md#a-worked-example) has a small
one, and `tinybrains adapt` writes every reference observation beside the tensors it produced, as
`case-N/observation.json` ([how](../testing.md#see-the-tensors-your-adapter-builds)).

## What you are looking at

- **Logic, Data, Result.** Result holds the Studio's output. For an adapter, that is the tensor
  call at the top with its arguments evaluated:
  `{"scatter": [[[12, 30], [13, 30], [43, 66]], [64, 96], "i8"]}` says that the node's `scatter`
  will receive those three points, that shape, and that dtype.
- **The diagram.** The Studio draws each operator as a node, with its inputs flowing in. **Flow**
  draws the data left to right; **Hierarchy** draws the JSON's nesting.
- **The debugger.** The step controls walk the evaluation one node at a time, and the current node
  shows the value it produced. Stepping is the quickest way to watch a `map` body receive each
  element in turn, or a `reduce` accumulator grow.

## Where the Studio and the arena differ

| | In the Studio | In the arena |
|---|---|---|
| The core operators: `var`, `val`, `map`, `filter`, `reduce`, `if`, arithmetic, comparisons, `merge` and the rest | Evaluated | Evaluated the same way, by the same engine |
| `{"==": [0, null]}` | `true` | `true`. The arena is datalogic too, so JavaScript's coercion rules apply on both sides |
| **An object with more than one key** | With Templating on, an object literal | **An error.** Every object is an operation, and an operation has one key. You will hit this difference |
| A single-key object whose key is not an operator | With Templating on, an object literal | **An error at evaluation**, `Invalid operator: <key>`: a misspelt operator runs in the Studio and fails on the first observation |
| The tensor operators | Shown with their arguments evaluated | The node builds the tensors and checks shapes and dtypes against your declaration |
| The operation count | Not shown | Counted, and capped at 1,000,000 per adapter |
| Shapes, dtypes, saturation, a scatter point off the board | Not modelled | Enforced |
| The Studio's version | Whatever that site last deployed | The version the node links, recorded on your version as `orion_version` |

**Remember the objects row**: the Studio accepts objects the arena refuses. An expression
that returns `{"mine": …, "theirs": …}` gives a tidy result in the Studio, and a node refuses it.
Return an array.

## A trap the Studio reproduces

`{"var": "3"}` on a `[row, col, owner]` triple is `null`, and `null` compares equal to `0`. This
filter keeps **every** hill, yours and your opponents', and neither the Studio nor the arena reports
a problem:

{{#studio studio/null-equality.json}}

This is the most expensive mistake an adapter can make, and the Studio shows it the way the arena
runs it. To avoid it, compare with `===`, read a field that resolves, or give `var` a fallback:
`{"var": ["3", -1]}`.

## When the Studio is enough, and when it is not

The Studio shows you whether your JSON half picks out the right things: the right lists, fields,
coordinates and shape. A scope mistake, a filter on the wrong field, or a shape assembled in the
wrong order shows up in the Result pane.

The Studio cannot tell you whether your adapter builds the tensor your graph was trained on, fits
the budget, or produces a tensor the graph accepts.
[`tinybrains adapt`](../testing.md#see-the-tensors-your-adapter-builds) writes out the tensors and
what each one charged, and [`tinybrains check`](../testing.md#check-it-the-way-admission-will)
measures what admission measures.
