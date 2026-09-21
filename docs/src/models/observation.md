# What your model sees

The Ants observation is a JSON object for one colony on one turn. Each adapter in your
[manifest](adapters.md) receives this object as its whole document. The game sends no setup message
and no terminal observation: once a seat stops playing, its model gets no more calls.

## Fields

| Field | Shape | Meaning |
|---|---|---|
| `size` | `[rows, columns]` | Board dimensions |
| `mine` | `[[row, column], …]` | All your living ants, sorted by row then column |
| `foes` | `[[row, column, owner], …]` | Enemy ants visible this turn |
| `food` | `[[row, column], …]` | Food visible this turn |
| `hills` | `[[row, column, owner], …]` | Standing hills visible this turn |
| `water.rle` | `[value, count, value, count, …]` | Row-major known-water mask |
| `vis.rle` | `[value, count, value, count, …]` | Row-major mask of what you can see **this turn** |

Coordinates are zero-based and wrap as [The world](../games/ants/world.md) describes. Any list can
be empty. Do not treat a list index as an ant's identity: the engine sorts `mine` afresh for each
observation, and births, deaths and movement change its order.

### Ownership labels

Owners are **relative to you**. In `hills`, owner `0` is yours and `1` upward is an opponent's. In
`foes`, the owner runs from `1` upward and is never `0`, since a foe is never you. On a two-seat
board the label is constant: your hills are `0`, and every enemy hill and ant is `1`.

The observation has no self-seat field, and you need none: as far as the observation says, you
always sit in seat `0`. Relabel every seat in the world and the same player receives identical
bytes. That property makes the two seats of one match two samples of one distribution, and a
self-play trainer depends on it.

## Known water

Read RLE as `(value, count)` pairs. Values are 0 or 1, and the counts cover `rows × columns` cells
in row-major order. A 1 means discovered water. A 0 can be known land **or an unexplored square**.
Water you discovered on an earlier turn stays in the mask after your ants lose sight of it.

As an example of the encoding, `size: [2, 3]` and `rle: [0, 2, 1, 1, 0, 3]` expand to
`[[0, 0, 1], [0, 0, 0]]`; no season could play a board that small. Use `rle_expand` to build the
tensor without a JSON loop over cells.

## What you can see this turn

`vis` is the mask the engine filtered this observation through: a 1 at every cell within squared
radius 77 of one of your ants, with wrapping, and a 0 everywhere else. It uses the same RLE
encoding as `water`, so `rle_expand` builds the plane.

**`vis` separates "there is nothing here" from "I cannot see here".** A 0 in the enemy plane where
`vis` is 1 means the square is empty; a 0 where `vis` is 0 means you do not know. Your encoder
needs that distinction: without it, a network learns "no enemy" from cells it could not have seen.

> A trainer can derive `vis` from `mine` and the radius in four lines of numpy. **An adapter
> cannot**: its expression language cannot address an enclosing iterator's element, so it cannot
> union a disk per ant, and the engine sends the mask for that reason. If your trainer derives this
> plane itself, check that the two agree.

## What is hidden

The engine filters enemies, food and hills to this turn's vision; only known water carries over
from one turn to the next. The payload has no scores, turn number, hive count, explored mask or
persistent model state.

A model call is a function of one observation. The platform never feeds a recurrent output back
into the next turn, so it cannot run an architecture that needs that state channel. Train with the
same missing information you will face in competition.

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

The second ant is `mine[1]`, so the second action must address `[13, 30]`. The water field says
this view holds no discovered water; the rest of the board may still hold some. The enemy and food
coordinates lie within this turn's vision.


> **The viewer cannot show this yet.** A replay frame carries the board as the *referee*
sees it (every ant, all the water), because re-simulating an action stream reconstructs that view.
`replay-decode` cannot yet say what a seat *knew* at a turn, and until it can, a replay here would
teach the opposite of this page's point.

<!-- replay-visualiser: observation-payload — BLOCKED, and deliberately empty.
Needs a seat view: `replay-decode` answering "what did seat N see on turn T", which is
`observe` applied to a re-simulated state. Cheap to add (one optional argument, decoded
for the shown turn only) and an ABI change, so it is a decision rather than a task.
Do NOT fill this with a ground-truth replay: it would teach the reader the opposite.
-->
