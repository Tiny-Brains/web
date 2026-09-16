# What your model sees

The Ants observation is a JSON object for one colony on one turn. Every adapter in your
[manifest](adapters.md) receives this object directly, as its whole document. There is no setup
message or terminal observation; when a seat stops playing, its model stops receiving calls.

## Fields

| Field | Shape | Meaning |
|---|---|---|
| `size` | `[rows, columns]` | Board dimensions |
| `mine` | `[[row, column], …]` | All your living ants, sorted by row then column |
| `foes` | `[[row, column, owner], …]` | Currently visible enemy ants |
| `food` | `[[row, column], …]` | Currently visible food |
| `hills` | `[[row, column, owner], …]` | Currently visible standing hills |
| `water.rle` | `[value, count, value, count, …]` | Row-major known-water mask |
| `vis.rle` | `[value, count, value, count, …]` | Row-major mask of what you can see **this turn** |

Coordinates are zero-based and wrap as described in [The world](../games/ants/world.md).
Empty lists are valid. Do not treat a list index as a permanent ant identity:
`mine` is sorted afresh, and births, deaths, and movement change its order.

### Ownership labels

Owners are **relative to you**. In `hills`, owner `0` is yours and `1` upward is an
opponent's. In `foes`, the owner is `1` upward and never `0`, because a foe is by
definition not you. In a two-seat preset that makes the label constant: your hills
are `0`, every enemy hill and ant is `1`.

There is no self-seat field and you do not need one. Ask which seat you occupy and
the answer is always the same: seat `0`, as far as the observation is concerned.
Relabel every seat in the world and ask the same player again, and the bytes are
identical — that property is what makes the two seats of one match two samples of
one distribution, which is what a self-play trainer depends on.

Earlier builds of this cartridge emitted raw seat numbers here, so an adapter that
split hills on `owner == 0` had its friendly and enemy planes swapped for seat 1 of
every match. That is fixed as of engine `sha256:f17b51b6c92b…`. If you are reading a
replay recorded under an older engine, its observations do not follow this rule.

## Known water

Read RLE as `(value, count)` pairs. Values are 0 or 1, and the counts cover
`rows × columns` cells in row-major order. A 1 means discovered water. A 0 can be
known land **or an unexplored square**. Water discovered earlier remains known
even when no ant currently sees it.

For a small encoding example, `size: [2, 3]` and `rle: [0, 2, 1, 1, 0, 3]`
expand to `[[0, 0, 1], [0, 0, 0]]`. This illustrates the encoding, not a supported
map preset. Use `rle_expand` to build the tensor without a JSON loop over cells.

## What you can see this turn

`vis` is the mask the engine filtered this observation through: a 1 at every cell within squared
radius 77 of one of your ants, wrapped, and a 0 everywhere else. It is the same RLE encoding as
`water`, so `rle_expand` builds the plane.

**It is the difference between "there is nothing here" and "I cannot see here".** A 0 in the enemy
plane where `vis` is 1 means the square is empty; a 0 where `vis` is 0 means you do not know. Almost
every useful encoder wants that distinction, and without it a network learns "no enemy" from cells
it could not have seen.

> `vis` was removed from this protocol and put back on 14 September 2026. The removal argument was
> that it is derivable from `mine` and a constant — true for a trainer, which builds the disk union
> in four lines of numpy, and **false for the expression language an adapter is written in**, which
> cannot address an enclosing iterator's element and so cannot union a disk per ant. The engine
> computes the mask twice a turn anyway. If you trained against an older cartridge, your encoder
> derived this plane and now receives it; check that the two agree before you rely on the new one.

## What is hidden

Enemies, food, and hills are filtered to current vision. Only known water has
memory. The payload supplies no scores, turn number, hive count, explored mask,
or persistent model state.

A model call is a function of one observation. Recurrent outputs are not fed back
on the next turn, so an architecture requiring that state channel is not supported.
Train with the same missing information you will encounter during competition.

## A worked example

This illustrative seat-0 observation has two ants and no known water:

```json
{
  "size": [64, 96],
  "mine": [[12, 30], [13, 30]],
  "foes": [[12, 33, 1]],
  "food": [[11, 31]],
  "hills": [[12, 30, 0]],
  "water": {"rle": [0, 6144]},
  "vis": {"rle": [0, 1054, 1, 11, 0, 5079]}
}
```

The second ant is `mine[1]`, so the second action must address `[13, 30]`. The
water field does not say the whole board is land; it says there is no discovered
water in this view. The enemy and food coordinates are within current vision.


> **The viewer cannot show this yet.** A replay frame carries the board as the *referee*
sees it — every ant, all the water — because that is what re-simulating an action stream
reconstructs. What a seat *knew* at a turn is a different thing, and `replay-decode` does
not answer it. Until it does, a replay here would show the opposite of the point.

<!-- replay-visualiser: observation-payload — BLOCKED, and deliberately empty.
Needs a seat view: `replay-decode` answering "what did seat N see on turn T", which is
`observe` applied to a re-simulated state. Cheap to add (one optional argument, decoded
for the shown turn only) and an ABI change, so it is a decision rather than a task.
Do NOT fill this with a ground-truth replay: it would teach the reader the opposite.
-->
