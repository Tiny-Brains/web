# The world

A SLAM match is one robot on a rectangular grid of 50 mm cells. A scenario fixes the geometry, the
start, the dock, the battery, the move limit, and the noise; a model never sees the true layout. The
same scenario is used for every model in a suite, so a comparison is a comparison on one floor.

## The scenario

A scenario is a JSON object. The fields a competitor needs are:

```json
{
  "id": "simple-room",
  "location_id": "home-a",
  "players": 1,
  "rows": 80,
  "cols": 100,
  "grid_cell_mm": 50,
  "static_occupancy": [{ "x": 40, "y": 36, "width": 20, "height": 14 }],
  "cliff_masks": [],
  "dynamic_objects": [
    {
      "id": "hall-crate",
      "width_mm": 400,
      "height_mm": 500,
      "from": { "x_mm": 2800, "y_mm": 2300 },
      "to": { "x_mm": 2800, "y_mm": 3200 },
      "motion": "ping_pong",
      "period_steps": 80,
      "phase_steps": 20
    }
  ],
  "start": { "x_mm": 1000, "y_mm": 1000, "heading_turn16": 0 },
  "dock": { "x_mm": 1000, "y_mm": 1000, "heading_turn16": 0 },
  "battery": { "initial_units": 50000, "capacity_units": 50000, "charge_units_per_step": 2000 },
  "max_steps": 1000
}
```

Rectangles are in cells, with `x` and `y` at the top-left corner. A scenario is at least 8 and at
most 2,560 cells on each axis; there are at most 512 static and cliff rectangles, at most 64 moving
objects, and at most 48 KiB of scenario metadata. A moving object is a rectangle that moves between
two poses on decision boundaries, with `motion` `static`, `ping_pong` or `loop`. It blocks motion,
lidar and IR while it covers a cell, and the floor beneath it is still sweepable.

`start` and `dock` are poses in millimetres with headings in turn16 units: 65,536 is a full
rotation. `location_id` is the name a saved map is stored under. A return visit uses the same
`location_id` with a changed layout; a different room has a different one.

## The sensors

The observation is what the cartridge gives the adapter, before the runner injects private memory.
It carries:

| Field | What it is |
|---|---|
| `lidar_mm` | 360 ranges, one per degree. Index 0 points along the heading and the index turns counter-clockwise. `-1` is a dropped ray; 8,000 means nothing was hit within range. |
| `lidar_quality` | 360 bytes, 0 for a dropout and 255 for a valid return. |
| `encoders` | Two wheel tick counts, accumulated over the run. |
| `gyro_urad_s` | Three axes of angular rate. |
| `accel_mm_s2` | Three axes of linear acceleration. |
| `bump` | Two bump contacts. |
| `cliff` | Four cliff probes. |
| `dock_ir` | `bearing_turn16` (null outside the cone) and `strength`; a 6 m range, a ±60° emission cone, and line-of-sight occlusion. |
| `dock_connected` | Whether the robot is on the charging pose. |
| `battery` | `level_ppm` of capacity and whether it is `charging`. |

Range noise, angular noise, dropped rays, encoder noise, gyro noise and accelerometer noise are
seeded from the run seed, so a replay is deterministic. Bump, cliff, battery and dock contact are
exact. The observation also carries `step`, `sim_time_ms`, the profile name (`slam-v1-phase1`) and
the `location_id`.

## The map window

The robot's map is its own: it starts empty and the model writes it. Each observation includes a
256 × 256 window of it, flat row-major in `map_window.cells`, with the same labels the model writes:
0 unknown, 1 free, 2 blocked. `map_window.origin` is the window's top-left cell in the model's
coordinates, and the first window starts at `[-128, -128]`.

`map_budget.used_tiles` is how many 64 × 64 tiles the map has allocated of its 4,096, and `bounds`
is the known extent, or null for an empty map. A model that wants a different part of its map writes
a new `read_origin` in its next action; reading another window is part of the normal step and costs
no extra decision.

The map is capped at 4,096 tiles, cells span −1,048,575 to +1,048,575, and a single update may
write at most 2,048 cells. Allocation and coordinate limits bound the map without tying the model's
origin to the true pose — the evaluator finds the transform later.

## What is hidden

The observation contains no true pose, no global map, no layout, no location geometry and no dock
coordinates. The dock is a place the robot must find from IR, lidar and contact, and the room is a
place it must build from its own motion and ranges. A model may not be given the scenario at run
time; the adapter contract is the observation above.

A moved object is only visible when a sensor sees it. It is not removed from the scoring target, so
a map that leaves a chair in place is a map with a blocked claim on free ground.
