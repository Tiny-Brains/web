# A turn

Every player chooses its actions from its own observation before the turn resolves. You see an
opponent's move, and can react to it, only in the next observation.

## The six steps, in order

| Step | Resolution | Consequence |
|---|---|---|
| 1. Move | Apply moves, then remove collisions | Friendly ants can kill each other |
| 2. Battle | Evaluate combat among survivors | An ant that dies on a hill razes nothing |
| 3. Raze | Surviving enemies destroy occupied hills | A destroyed hill cannot spawn |
| 4. Spawn | Stored food creates ants on free hills | An occupied hill blocks growth |
| 5. Gather | Nearby food enters the hive | This food cannot spawn until a later turn |
| 6. New food | Place fresh food | Ants can gather it on later turns |

After these steps, the engine advances the turn count and checks
[ending conditions](scoring.md).

## Moving and collisions

An ant moves one square north, east, south or west, or stays. The engine treats a move into water
**or onto food** as staying: both refuse the destination and leave the ant where it was. An ant
with no order also stays. Movement wraps at both edges; see [The world](world.md).

The engine checks collisions at each ant's final destination. If two or more ants arrive on one
square, **all of them die**, whoever owns them. Moving onto a friendly ant that stays is a
collision. Two adjacent ants that swap places do not collide, since their destinations differ;
combat still follows at their new positions.

**In practice a collision is always your own ants.** Two enemies that could arrive on one square
stood at most two squares apart the turn before (squared distance 4 at the furthest), so they were
already in each other's attack range. Two enemies in range can never both survive a battle, because
each would need a higher focus than the other. The exception is an ant that appeared after that
battle, since spawning runs later in the turn than the fighting.

The order array is positional, in `mine` order: row-major by square, whatever order your ants
appeared in. Entry 0 is the ant in your topmost occupied row, leftmost of any tie, and that can be
a different ant each turn.

<div class="tb-replay" data-src="tutorials/7-collide.json" data-turn="3" data-zoom="6"></div>

<p class="tb-replay-caption">Red gathers the food below its hill and steps east, and a new ant
appears on the hill behind it, so red's two ants sit side by side with the hill ant as entry 0.
Turn 3 sends entry 0 east onto the square the other ant holds: both end on that square and both
die, and the colony that had just grown ends the match with nothing. The opposing ant never moves,
so none of this is combat.</p>

<!-- replay-visualiser: turn-collision — filled.
Asset: tutorials/7-collide.json, turn 3 (its last). Regenerate with tutorials/build.sh.
Scripted deliberately: ["E", "-"] with the hill ant at entry 0, so the page is showing a rule
rather than reporting an accident.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Combat

An enemy is in attack range when the wrapped squared distance is at most **5**. After collisions,
the engine counts the enemies in range of each ant; that count is the ant's **focus**. Friendly
ants add nothing to it.

An ant dies if any enemy in range has focus less than or equal to its own. Put the other way, an
ant survives only if every enemy it faces has a higher focus. An ant with no enemy in range
survives combat.

The engine computes every focus before it removes any ant, so a dying ant still counts in that
turn's comparisons and deaths do not cascade.

| Position after movement | Focus values | Result |
|---|---|---|
| One ant against one, in range | Both 1 | Both die |
| Two allies each in range of one enemy, no other enemies | Allies 1 each; enemy 2 | Allies survive; enemy dies |
| Two against two, all in mutual range | All 2 | All die |
| Four adjacent cells in a row: A A B B | Outer ants 1; inner ants 2 | Inner ants die; outer ants survive |

The last two cases have the same number of ants and different outcomes. Your model has to weigh
position and support as well as the size of each army.

Two ants that close to within attack range with no support on either side have equal focus, and
both die. Step through it: turn 3 has them four columns apart, squared distance 16 and well outside
the range of 5. On turn 4 they close to 4, and neither survives that turn. You never see one ant
facing another in range, because the fight resolves on the turn the gap closes.

<div class="tb-replay" data-src="tutorials/2-fight.json" data-turn="3" data-zoom="6"></div>

<p class="tb-replay-caption">A one-against-one exchange on an eight-by-twelve board, played by the
engine from a written script. Use the arrow keys to step a turn at a time; click a cell to see what
is on it.</p>

<!-- replay-visualiser: turn-focus-combat — filled.
Asset: tutorials/2-fight.json, turn 3 — the last turn both ants are alive. Regenerate with
tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

Support changes the outcome, and you can see it. Two ants that arrive in range of a lone enemy
**on the same turn** each face one enemy while it faces two: its focus is 2 and theirs is 1, so it
dies and both of them live. Arriving a turn apart would be the case above, twice.

<div class="tb-replay" data-src="tutorials/5-focus.json" data-turn="9" data-zoom="6"></div>

<p class="tb-replay-caption">Red gathers the food beside its hill and spawns a second ant, walks
the two east in single file, then turns them south so both cross into range on the same turn.
Turn 8 has them one step short of it; turn 9 puts them at squared distance 4 and 5 of the
defender, which dies while both attackers live. Its colony has nothing in the hive to replace it,
so the match ends there, 3&ndash;0.</p>

<!-- replay-visualiser: turn-focus-support — filled.
Asset: tutorials/5-focus.json, turn 9 (its last). Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Razing a hill

A surviving enemy on a standing hill destroys it, earning +2 and costing its owner 1 point. An
attacker killed during collisions or battle razes nothing. Your own ant cannot raze your hill.

Most of the difficulty sits in that second sentence. An ant on its own hill covers every square
within squared distance 5 of it (two squares out in a line), so a lone attacker stepping into that
ring dies with the defender and razes nothing. To take a defended hill you need support, or a
defender that has left. The replay below shows the second case: the script walks blue's ant away
from its hill first, so red razes the hill without a fight.

<div class="tb-replay" data-src="tutorials/3-raze.json" data-turn="10" data-zoom="5"></div>

<p class="tb-replay-caption">Blue's ant walks four squares north and holds there. Red's walks four
south and six east and stands on the undefended hill on turn 10: the hill is gone from that frame,
the score goes from 1&ndash;1 to 3&ndash;0 (+2 to the razer, −1 to the owner), and the match stops
there. With no enemy hill left standing, the finishing order can no longer change, so the engine
ends it <code>rank_stabilized</code>. Red's own hill is untouched and can still spawn.</p>

<!-- replay-visualiser: turn-raze — filled.
Asset: tutorials/3-raze.json, turn 10 (its last). Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Food and new ants

Each stored food unit spawns one ant on an unoccupied friendly hill. With several hills free, the
one that has gone longest without spawning goes first. A tie goes to the hill listed first in the
map file, and the map file lists hills so that every seat's first hill is the same hill of the
board, moved by its shift. Each hill can spawn at most one ant per turn, because the new ant then
occupies it. Food waits in the hive while no hill is free.

Gathering uses squared radius **1**: the food square and its four orthogonal neighbours. If one
colony alone has surviving ants in range, it collects the food; with none in range, the food stays.
The engine also destroys food that several colonies contest. That case cannot arise under the
current attack and gathering radii, because opposing ants cannot both survive in gathering range of
the same food.

Food gathered this turn can spawn **next turn at the earliest**, so a useful growth pattern is to
step off a hill while another ant gathers nearby.

Spawning also runs *after* the fighting, which works for the defender: a colony whose defender dies
on its own hill can replace it in the same turn from food already in the hive. A hill stops
producing defenders once the hive behind it is empty.


<div class="tb-replay" data-src="tutorials/4-growth.json" data-turn="2" data-zoom="6"></div>

<p class="tb-replay-caption">On turn 1 red gathers the food beside its hill: the food is gone from
that frame and no ant has appeared. Turn 2 steps the gatherer off the hill, and the new ant stands
on it: food gathered on one turn becomes an ant on the next, and never sooner. Red then holds the
hill, walks the other ant away, and keeps both to the end. The opposing colony shows the other half
of the rule. It gathered the food beside *its* hill on turn 1 as well and never spawns, because its
own ant stands on the only square where its new ant could appear. Arrow keys step a turn at a time;
click a cell to see what is on it.</p>

<!-- replay-visualiser: turn-spawn-delay — filled.
Asset: tutorials/4-growth.json, turn 2. Regenerate with tutorials/build.sh.
The lesson ends on the turn limit with both of red's ants alive: growth is the rule here, and a
friendly collision is its own lesson (7-collide) under turn-collision above.
Frame N is the board after N turns, so turn 0 is the opening: a caption written in delta
indices is one turn early everywhere.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Sending nothing

The game leaves an ant with no order where it is. A failed model call is a different matter: the
platform counts a missing or failed answer as a strike, substitutes no movement, and forfeits the
seat at the strike limit. Make the call succeed every turn: your adapters must evaluate, and your
graph must return its declared head, inside the deadline. A policy that holds every ant still
answers, by scoring `-` highest for each one. See [actions](../../models/actions.md).
