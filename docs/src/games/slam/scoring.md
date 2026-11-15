# Ending and scoring

SLAM scores what the robot achieved and what it cost. The final result is one integer number of
score units, and 10,000 units are one point. A report or the standings may show either; the
component fields are always integer parts per million (ppm).

## The formula

Let `C`, `M`, `E` and `T` be the coverage, mapping, energy and time components, each an integer from
0 to 1,000,000. Let `D` be 1 when the robot finished docked and fully charged, and 0 otherwise:

```text
total = floor( [ (50·C + 40·M)·10¹² + D·C·M·(5·E + 5·T) ] / 10¹⁴ )
```

The floor happens once, at the end. The weights are 50/40/5/5. An incomplete run keeps its coverage
and mapping points but earns no efficiency bonus, because `D` is zero. A run that does not produce
a usable final map scores no mapping points; a forfeit scores nothing.

## Coverage

`C` is the fraction of the **reachable sweepable floor** the robot has cleaned at least once.

The denominator is not every non-solid cell. A cell centre is navigable when it is outside obstacles
and cliffs and at least four cells from either (Chebyshev distance); the reachable component is a
four-way flood fill from the start over navigable cells. A cell is sweepable when a free, non-cliff
cell centre lies within the robot's 170 mm footprint of a reachable centre. The floor under a moving
object is sweepable, so the denominator does not move as the object travels; only the credit waits.

Each cell is credited once. Cliff cells, solid cells and cells outside the reachable component never
count. Driving over clean floor again earns nothing.

## Mapping

`M` compares the final submitted map with the world after aligning it. The target is the reachable
sweepable floor plus the **blocked boundary band**: solid or cliff cells with at least one sweepable
eight-neighbour. The inside of a wall is not part of the target.

The model's map frame is its own, so the evaluator searches a bounded set of rigid transforms:

- rotations every 15° for the coarse pass, then ±7° in 1° steps around the best;
- translation bases from the free centroid, the free bounding-box centre and the blocked centroid,
  with ±24-cell offsets in six-cell steps, then ±2 cells in one-cell steps.

No reflection or scaling is allowed, and the search never sees a pose or a hidden layout. Ties keep
the earlier candidate.

After alignment, the metric is exact. A model free cell on target free ground is a true positive; a
free claim on blocked ground or outside the evaluation region is a false positive; target free cells
the model never claimed are missed. The blocked F1 is the same over the boundary band. `M` is the
harmonic mean of the two F1 scores, so a perfect floor with no walls does not average to a high
number. A free-only or blocked-only map has `M = 0`, and an empty map is zero by definition. A map
with more than 1,000,000 known cells is sampled, and the result says so.

## Energy and time

`E` is `1 − consumed_units / energy_budget` and `T` is `1 − scored_steps / time_budget_steps`, both
in ppm. Consumed units are counted across the whole run, charging included. Scored time subtracts
the final 50 dock-confirmation decisions; raw time does not.

A scenario may fix `score.energy_budget_units` and `score.time_budget_steps`. Zero means the derived
default: the battery capacity and the scenario's `max_steps`. A fixed budget keeps a competitor's
normalization stable as other runs enter a suite.

## Live and calibrated results

A terminal run reports `score_status: "calibrated_v1"`. While a match is running, the same result is
`"live"`: coverage, energy and time are scored, and mapping is null because alignment is not paid
for on every training decision. A replay carries the components it was scored with, and a report
aggregates only calibrated runs.

## In a suite

A season's evaluation is a suite of visits. Each committed visit contributes its total and its
components; a model's suite total is the sum over committed visits and its mean divides by the
number of visits. An incomplete visit is reported as uncommitted and is not averaged away. A suite
is a comparable set: the game, engine digest, scoring identity and ordered visits are part of its
identity, so a scoring change or a scenario change is a new suite, not a rescored old one.

The local `tinybrains report` and the hosted aggregate use the same per-model shape: rank, total,
mean, visits/committed/clean, completeness, components, and one entry per visit with the run behind
it.
