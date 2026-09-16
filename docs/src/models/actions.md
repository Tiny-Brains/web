# What your model answers

The Ants action is a JSON array with one string per ant in the observation's `mine` list. **You do
not produce it — the referee does**, by reading your graph's policy head. This page is therefore
the contract your *output tensor* has to meet.

| String | Move |
|---|---|
| `N` | Row −1 |
| `E` | Column +1 |
| `S` | Row +1 |
| `W` | Column −1 |
| `-` | Stay |

Every move wraps at the map boundary. There are no diagonal moves, destinations,
ant identifiers, or action objects in this contract.

## One order per ant

For `mine: [[12, 30], [13, 30]]`, the action `["N", "E"]` moves the first ant toward `[11, 30]` and
the second toward `[13, 31]`. There is one order per ant in `mine`, in that order. Zero ants means
`[]`.

## The two head shapes

Your manifest declares one output, and it must be one of these two. **Five channels either way, in
the order `N, E, S, W, -`**, and the referee takes the argmax.

| Declared shape | What it means |
|---|---|
| `[1, 5, "H", "W"]` | **A per-cell policy.** A score for every move at every square of the board. The referee gathers the five channels at each of your ants' cells, in `mine` order, and takes the argmax of each. What a fully convolutional network naturally produces |
| `[N, 5]` | **One row per ant, already in `mine` order.** The referee takes the argmax of each row. `N` is a named dimension that binds to your ant count, so the same manifest serves every turn |

Both are read the same way afterwards, so the choice is about your architecture and not about the
rules. The per-cell head costs a gather the platform pays for; the per-ant head is cheaper at large
boards and requires your graph to do the indexing, which constrains what axes you may name
([why](adapters.md#a-dimension-may-be-a-name)).

**Keep training labels, output channels and this table in the same order.** A channel order off by
one is a model that plays a rotation of what it learned, scores badly, and reports no error
anywhere.

## Illegal and missing orders

Moving into water leaves the ant still. The engine also treats an unrecognised direction string as
staying, and ignores surplus positional orders. These fallbacks are the engine's tolerance and not
a licence: the referee only ever produces the five strings, so what they protect against is a
cartridge change, not your model.

**What is checked, and what is not.** Admission checks that each adapter produces a tensor of the
dtype and shape the manifest declares, that the graph runs, and that the head decodes to a valid
action on every reference observation. It does not check that the action is any *good*. A model that
answers `["-", "-", …]` every turn is a legal entry that never moves — which is exactly what an
untrained graph does. Check the distribution of your own actions during [testing](testing.md).

## The turn clock

The standard turn deadline is **1,000 ms** for your adapters and your inference together, and it is
**yours alone** — each seat is its own call with its own deadline, so a slow opponent cannot spend
your clock. A failed or timed-out call contributes a strike and leaves the seat with no movement
for that turn. At five cumulative strikes the seat forfeits; successful calls between failures do
not reset the count.

A deliberate hold array such as `["-", "-"]` is a normal answer. It is different
from failing to return an action. There is no resign action in the current Ants
contract. See [scoring and forfeits](../games/ants/scoring.md).

## A move is an intention

An accepted action is not a guarantee the ant survives or reaches a useful
position. Opponents move simultaneously, friendly ants can collide, and battle
runs before hill razing. Evaluate outcomes using the [turn rules](../games/ants/turn.md),
not only the validity of the direction strings.


<div class="tb-replay" data-src="tutorials/1-movement.json" data-turn="5" data-zoom="6"></div>

<p class="tb-replay-caption">Every order in this match is valid, and the board still does things the
orders do not say. Turn 1 sends the ant east onto the food beside its hill: food refuses a move, so
the ant is still standing on the hill — and the food is gathered anyway, from where it stands. Turn
2 moves that ant one square south, and a second ant nobody ordered appears on the hill it just
left. Turns 3 and 4 move both ants east; the lesson's script writes that once, but what reaches the
engine is one order per ant, which is what your model has to answer. Turn 5 is the frame this opens
on: the same order east, refused by water for the ant in the top row and carried out for the one
below it. Turn 6 is past the end of the script, so both hold.</p>

<!-- replay-visualiser: actions-to-outcomes — filled.
Asset: tutorials/1-movement.json, turn 5 — one order, two outcomes, which is this section's claim.
Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->
