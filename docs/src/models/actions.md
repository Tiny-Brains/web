# What your model answers

The Ants action is a JSON array with one string per ant in the observation's `mine` list. **The
referee produces it** by reading your graph's policy head, so this page is the contract your
*output tensor* has to meet.

| String | Move |
|---|---|
| `N` | Row −1 |
| `E` | Column +1 |
| `S` | Row +1 |
| `W` | Column −1 |
| `-` | Stay |

Every move wraps at the map boundary. The contract has no diagonal moves, destinations, ant
identifiers or action objects.

## One order per ant

For `mine: [[12, 30], [13, 30]]`, the action `["N", "E"]` moves the first ant toward `[11, 30]` and
the second toward `[13, 31]`. The action holds one order per ant in `mine`, in `mine`'s order, and
zero ants means `[]`.

## The two head shapes

Your manifest declares one output, in one of these two shapes. **Both carry five channels, in the
order `N, E, S, W, -`**, and the referee takes the argmax.

| Declared shape | What it means |
|---|---|
| `[1, 5, "H", "W"]` | **A per-cell policy.** A score for every move at every square of the board. The referee gathers the five channels at each of your ants' cells, in `mine` order, and takes the argmax of each. A fully convolutional network produces this shape with no extra work |
| `[N, 5]` | **One row per ant, already in `mine` order.** The referee takes the argmax of each row. `N` is a named dimension that binds to your ant count, so the same manifest serves every turn |

The referee decodes both the same way from there, so pick the one that suits your architecture; the
rules treat them alike. The per-cell head costs a gather that the platform pays for. The per-ant
head is cheaper on large boards, but your graph has to do the indexing, which limits the axes you
can name ([why](adapters.md#a-dimension-may-be-a-name)).

**Keep training labels, output channels and this table in the same order.** With the channel order
off by one, your model plays a rotation of what it learned, scores low, and nothing reports an
error.

## Illegal and missing orders

An ant ordered into water stays where it is. The engine also treats an unrecognised direction
string as staying, and ignores surplus positional orders. Your model cannot cause either of those
two: the referee produces only the five strings, so those fallbacks guard against a cartridge
change.

**Admission checks legality.** It confirms that each adapter produces a tensor of the dtype and
shape the manifest declares, that the graph runs, and that the head decodes to a valid action on
every reference observation. It does not judge whether the action is any *good*. A model that
answers `["-", "-", …]` every turn is a legal entry that never moves, and an untrained graph does
that. Check the distribution of your own actions during [testing](testing.md).

## The turn clock

The standard turn deadline is **1,000 ms** for your adapters and your inference together, and it is
**yours alone**: each seat is its own call with its own deadline, so a slow opponent cannot spend
your clock. A failed or timed-out call adds a strike, and none of the seat's ants move that turn.
At five cumulative strikes the seat forfeits, and successful calls between failures do not reset
the count.

A deliberate hold array such as `["-", "-"]` is a normal answer, and the referee treats it apart
from a call that returns no action. The Ants contract has no resign action; see
[scoring and forfeits](../games/ants/scoring.md).

## A move is an intention

An accepted action does not guarantee that the ant survives or reaches a useful position.
Opponents move at the same time, friendly ants can collide, and battle runs before hill razing.
Judge your model by the outcomes the [turn rules](../games/ants/turn.md) produce, beyond whether its
direction strings are valid.


<div class="tb-replay" data-src="tutorials/1-movement.json" data-turn="5" data-zoom="6"></div>

<p class="tb-replay-caption">Every order in this match is valid, and the board still does things the
orders do not say. Turn 1 sends the ant east onto the food beside its hill. Food refuses a move, so
the ant stays on the hill, and it still gathers the food from where it stands. Turn 2 moves that
ant one square south, and a second ant nobody ordered appears on the hill it left. Turns 3 and 4
move both ants east. The lesson's script writes that order once, but the engine receives one order
per ant, and that is what your model has to answer. The viewer opens on turn 5: the same order
east, which water refuses for the ant in the top row and the ant below it carries out. Turn 6 is
past the end of the script, so both hold.</p>

<!-- replay-visualiser: actions-to-outcomes — filled.
Asset: tutorials/1-movement.json, turn 5 — one order, two outcomes, which is this section's claim.
Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->
