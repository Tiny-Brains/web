# Saved maps and suites

A saved map is what a visit hands to the next visit. It is exactly the model's submitted map at the
end of an accepted run: no pose, no observations, no private memory and no ground truth.

## The format

```json
{
  "format": "slam-model-map-v1",
  "known_cells": 6,
  "tiles": [
    { "origin": [0, 0], "cells_b64": "<1024 bytes, 2 bits per cell>" }
  ]
}
```

Tiles are 64 × 64 cells, packed row-major at two bits per cell, and base64 encoded. Labels are 0
unknown, 1 free and 2 blocked; 3 is reserved and invalid. Origins are multiples of 64, tiles are
sorted by origin, a tile is never all unknown, and a map holds at most 4,096 tiles. Coordinates are
in the model's own frame, so the evaluator still has to align the map; a saved map is never an
oracle.

## Ownership and reset

| Property | Rule |
|---|---|
| Ownership | Exact model version (weights and manifest digest), sequence and `location_id` |
| New version | Starts empty; cannot read another version's maps |
| New sequence | Starts empty; cannot read another sequence's maps |
| Changed furniture | Same `location_id`; the model must relocalize and revise |
| Private step memory | Resets between visits; it is not the saved map |
| Snapshot | Pinned when a visit is queued; a retry reads the same bytes |
| Commit | Only after an accepted finish; a strike or forfeit commits nothing |
| Duplicate finish | Commits once; a later visit is never moved backwards |

An accepted run that ends by battery depletion, inactivity or the time limit still advances the
saved map. The run was played and its map is the result. A malformed output, a forfeit or a runner
failure does not.

## Visits

A visit names a scenario, a `location_id`, a seed, and whether it starts empty (`reset`) or from the
previous visit's snapshot (`resume`). The first visit of a sequence is `reset`; a return to the same
room is `resume` with the same location. A changed layout at the same location is still `resume`:
the stored map is the old furniture and the run must revise it.

A retry repeats the visit index and reads the **same** pinned snapshot. It never advances the
sequence and never inherits a later visit's map. The visit is complete only when an attempt commits
a saved map; a failed, reaped or struck attempt is replaced by a new attempt, up to the suite's
`retry_max`.

## A suite

A suite is the comparable set for a one-seat season: an ordered list of visits, a scoring identity,
a seed root, and a retry bound. The scheduler queues one visit at a time, for one active version at
a time, and only after the previous visit committed. The match is an ordinary one-seat match with
the suite and visit attached, so the same lease, claim token and finish fence recover a dead runner.

A suite is immutable in the ways that matter: the game, engine digest, scoring, seed and visits are
its identity. Changing the scoring or a scenario starts a new suite, which starts with no inherited
maps. A season's suite is public; its aggregate lists every version's total, mean, committed and
clean visits, components, and the run behind each visit.

## Locally

`tinybrains suite` runs a prescribed sequence one visit at a time, keeping snapshots on disk:

```sh
tinybrains suite suite.json --out replays --saved-maps saved-maps
tinybrains report suite.json --out replays --json
```

The suite file names each visit's `map`, `location`, `seed`, `saved_map` (`reset` or `resume`) and
seat. A second seat is refused: SLAM is one robot. `report` reads the replay files, checks that each
run's engine and scoring match, and writes `slam-evaluation-report-v1`, whose `published.models[]`
is the same shape the hosted aggregate returns.

The save/load rules are the owned, isolated store described above: one file per model version,
sequence, location and visit, and a retry can only read the file it was queued with. The
[starter](https://github.com/Tiny-Brains/slam-starter) ships a two-visit suite to try it.
