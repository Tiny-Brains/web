# The maps

Ants has three generated map presets. A preset sets the board dimensions and
generation parameters; the seed selects a particular world. All current presets
use the same game rules and have **two seats**.

| Preset | Rows × columns | Cells | Water target before symmetry | Food target per player |
|---|---:|---:|---:|---:|
| `standard` | 64 × 96 | 6,144 | 12% | 12 |
| `maze` | 96 × 96 | 9,216 | 28% | 10 |
| `cell` | 128 × 128 | 16,384 | 18% | 16 |

Water percentages are generator inputs, not a promise of an exact count in every
finished map. Placement, overlap, and symmetry affect the resulting terrain.
Food is replenished by the engine; the target is not an amount guaranteed to stay
visible or available to your colony. Each preset also seeds food near starting
hills to support early growth.

## Standard

The smallest board has relatively sparse water. It is a useful first environment
for understanding movement and food collection, but its rectangular dimensions
also expose adapters that accidentally assume `rows == columns`.


<div class="tb-replay" data-src="tutorials/preset-standard.json"></div>

<p class="tb-replay-caption">A <code>standard</code> board: 64 by 96, moderate water. Turn zero, both hills visible. Scroll to zoom, drag to pan.</p>

<!-- replay-visualiser: maps-standard — filled.
Asset: tutorials/preset-standard.json, turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Maze

Maze uses a higher water target and smaller water-growth blobs. Denser obstacles
make route selection and congestion more prominent. Test whether your model
avoids repeatedly ordering ants into water or sending several ants into the same
narrow destination.


<div class="tb-replay" data-src="tutorials/preset-maze.json"></div>

<p class="tb-replay-caption">A <code>maze</code> board: 96 by 96 and far denser water, so routes matter more than distance.</p>

<!-- replay-visualiser: maps-maze — filled.
Asset: tutorials/preset-maze.json, turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Cell

Cell has the largest board and larger water formations. A full-board tensor has
more than twice as many cells as standard, so this preset is an important test
of inference cost and adapter headroom as well as strategy.


<div class="tb-replay" data-src="tutorials/preset-cell.json"></div>

<p class="tb-replay-caption">A <code>cell</code> board: 128 by 128, the largest, with water in fatter blobs and more open ground between them.</p>

<!-- replay-visualiser: maps-cell — filled.
Asset: tutorials/preset-cell.json, turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Symmetric starts, varied matches

For two players, generation translates starting terrain and resources by half
the board dimensions. The seed and engine together determine the world; preserve
both when reproducing an example. A preset name alone cannot reproduce a match.

The matchmaker spreads play across presets. Train and validate on every supported
size, and review results by preset before concluding that a change improves the
model overall. A fixed-size graph needs an explicit padding or other compatible
representation for every preset, with outputs mapped back to real coordinates.
