# A turn

A decision is 200 ms of simulated time. The robot takes one action per decision, the world advances
physics in 20 ms substeps, and the next observation is built from where it actually ended up. The
limit is 90,000 decisions; a scenario may set a shorter one.

## The action

```json
{
  "wheel_speed_mm_s": [180, 220],
  "map_update": {
    "read_origin": [-128, -128],
    "reset": false,
    "cells": [[0, 0, 1], [1, 0, 1], [12, 7, 2]]
  }
}
```

`wheel_speed_mm_s` is left and right, each an integer from −300 to 300 mm/s. A positive value drives
that wheel forward. The two values are independent, so the robot can turn in place.

`map_update` is the model's belief, written as part of the same action. Its fields:

| Field | Meaning |
|---|---|
| `read_origin` | The top-left cell of the map window the next observation will show. |
| `reset` | Clear the submitted map before applying this update. Private memory is not affected. |
| `cells` | Up to 2,048 `[x, y, label]` rows. Labels are 0 unknown, 1 free, 2 blocked. |

Writes apply in order after the optional reset, and the last write to a coordinate wins. A single
invalid coordinate, label or window rejects the **whole** action atomically: no wheel movement and
no map edits are applied. A map read window must fit within the coordinate limits, and a map may
allocate at most 4,096 64 × 64 tiles.

The model owns its map coordinates. A fresh run starts with an empty map at the initial window
`[-128, -128]`. A return visit starts with the saved map in the coordinates it was written in, so
the model must relocalize without an oracle.

## The tensor decoder

The platform's model head for SLAM is `wheel_map`, and it reads two tensors:

| Output | Shape | Decoder |
|---|---|---|
| `wheel_speed` | `i16[1, 2]` | Left and right mm/s. |
| `map_update` | `i32[1, 2049, 3]` | Row 0 is `[origin_x, origin_y, reset]`; the remaining 2,048 rows are `[x, y, label]`. |

A row whose label is `-1` is unused: its coordinates must be zero and it is omitted from the
decoded action. The reset value is 0 or 1. The adapter may fill the tensor from any graph shape; the
head is applied after inference, so a missing or invalid tensor becomes a strike rather than a
partially applied map.

## Private memory

A model may declare a private `memory` input and output. The runner carries the output bytes to the
next decision and injects them as the next memory input. Memory is flat: a version may use up to
262,144 bytes, and the class's memory price is charged for the bytes it declares. There is no
per-cell memory.

A successful inference updates memory even if the game head cannot be decoded; a failed inference
leaves the previous memory in place. Memory resets between visits: a saved map is the map, not the
model's recurrent state. A model that needs both should keep the map in its map and its short-term
state in memory.

## What physics does

At each decision the cartridge accepts the action, advances the wheels in 20 ms substeps, moves the
dynamic objects, resolves collisions and cliff contact, samples the sensors, resolves dock contact,
updates the battery, updates the activity counters, and checks the ending conditions.

The robot is a circle of radius 170 mm with a 233 mm wheel base. Out of bounds behaves as a wall. A
cliff traps the whole robot, rotation included, until the run ends. Encoder and gyro noise are real:
odometry alone will drift.

## Battery and charging

The default battery is 3,000,000 units. Away from the dock a decision costs 1,000 units; on the dock
a decision adds 2,000 units, capped at capacity. A scenario may set a smaller capacity, a different
starting charge and a different charge rate. A robot whose battery reaches zero away from the dock
ends the run with `battery_depleted`.

A valid dock pose is within 100 mm of the dock target and within 15° of its heading. Zero wheel
commands there establish charging contact. Charging below full resets the inactivity counter; once
full, the run ends after 50 inactive confirmation decisions. Scored time subtracts exactly those 50
intervals; raw time does not.

## Inactivity and ending order

An interval is active if the robot physically moves at least 1 mm or rotates at least 0.06°. Stop
commands and blocked movement are not activity. Away from the dock, 50 consecutive inactive
decisions end the run with `inactive`. On the dock, the 50-interval rule applies only after the
battery is full.

If more than one ending applies, the cartridge checks in this order:

1. successful dock completion (`docked`);
2. battery depletion away from the dock (`battery_depleted`);
3. inactivity away from the dock (`inactive`);
4. the scenario's time limit (`time_limit`).

An accepted run that ends for any of these reasons still advances the saved map. A forfeited or
malformed run does not.

## Strikes and forfeits

A model call that fails, a head that cannot be decoded, or an action outside the contract is a
no-op and a strike. Strikes are cumulative across a match. At the season's strike ceiling the seat is
forfeited for the rest of the match, and the run's result cannot count as a completion.

In a one-seat evaluation a forfeit commits no saved map and no score. The visit is retried from the
same pinned snapshot, under a new attempt, up to the suite's retry bound. A duplicate finish, a
stale claim or a retried attempt cannot commit twice.
