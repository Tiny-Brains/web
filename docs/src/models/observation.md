# What your model sees

The Ants observation is a JSON object for one colony on one turn. Each adapter in your
[manifest](adapters.md) receives this object as its whole document. The game sends no setup message
and no terminal observation: once a seat stops playing, its model gets no more calls.

## Fields

| Field | Shape | Meaning |
|---|---|---|
| `size` | `[rows, columns]` | Board dimensions |
| `mine` | `[[row, column], …]` | All your living ants, sorted by row then column |
| `ids` | `[id, …]` | Which ant each entry of `mine` is, in the same order ([below](#ant-ids)) |
| `foes` | `[[row, column, owner], …]` | Enemy ants visible this turn |
| `food` | `[[row, column], …]` | Food visible this turn |
| `hills` | `[[row, column, owner], …]` | Standing hills visible this turn |
| `water.rle` | `[value, count, value, count, …]` | Row-major known-water mask |
| `vis.rle` | `[value, count, value, count, …]` | Row-major mask of what you can see **this turn** |

Coordinates are zero-based and wrap as [The world](../games/ants/world.md) describes. Any list can
be empty. Do not treat a list index as an ant's identity: the engine sorts `mine` afresh for each
observation, and births, deaths and movement change its order. `ids` is the identity.

## Ant ids

`ids[i]` is the id of the ant at `mine[i]`. `mine` keeps its row-major order, so your actions and
your policy head stay aligned with `mine`, exactly as [What your model answers](actions.md) says.

- **An id belongs to one ant for its whole life, and is never reused.** The ant keeps it through
  every move, a blocked one included, and when it dies its id goes with it.
- **Ids are per seat**, counted from 0: your starting ants first, in the order of your hills, then
  each new ant in the order it spawns. Every seat counts the same way, so the seats stay symmetric.
- **Only your own ants carry ids.** `foes` carries none: an enemy ant's id would say how many ants
  that colony has ever spawned, which is what fog hides.
- An id stays far below 2<sup>24</sup>, so it survives a cast to `f32` exactly.

A model with no [memory](memory.md) has no use for `ids`. One with a memory per ant uses them to
find each ant's row from last turn ([how](memory.md#a-memory-per-ant)). An adapter reads only the
keys it names, so a manifest that never names `ids` plays unchanged.

## Keys the runner adds

The game never sends `memory` or `ant_memory`. **They are the runner's**: when your manifest
declares an output of that name, the runner hands its last value back on your seat's next
observation under the same key, and it is absent on turn 0. [Memory](memory.md#the-carry) has the
whole rule. A model that declares neither output never sees either key.

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
from one turn to the next. The payload has no scores, turn number, hive count or explored mask.

A model call sees one observation and, when its class allows [memory](memory.md), what the model
wrote on its previous turn. Nothing else carries over, so anything else a model wants to remember,
it has to write into that memory. Train with the same missing information you will face in
competition.

## A worked example

This illustrative seat-0 observation has two ants and no known water:

```json
{
  "size": [64, 96],
  "mine": [[12, 30], [13, 30]],
  "ids": [2, 0],
  "foes": [[12, 33, 1]],
  "food": [[11, 31]],
  "hills": [[12, 30, 0]],
  "water": {"rle": [0, 6144]},
  "vis": {"rle": [0, 1054, 1, 11, 0, 5079]}
}
```

The second ant is `mine[1]`, so the second action must address `[13, 30]`. `ids` says that ant is
ant 0, the colony's first, and the one on the hill is ant 2, spawned later; ant 1 has died. The water field says
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
