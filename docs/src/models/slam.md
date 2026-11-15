# A SLAM model

A SLAM model is an ONNX graph plus a manifest. The graph is ordinary inference: the platform gives
it tensors built from the observation and reads two game outputs and, optionally, private memory. A
model that validates locally runs on Kalam, and the replay it produces is decoded by the same
cartridge version in the viewer.

## What the graph receives

The [observation](../games/slam/world.md) is JSON. The manifest's `inputs` adapters turn it into
tensors. The starter's six inputs are one reasonable split:

| Input | Shape | Built from |
|---|---|---|
| `lidar` | `f32[360]` | `sensors.lidar_mm` |
| `encoders` | `i32[2]` | `sensors.encoders` |
| `gyro` | `f32[3]` | `sensors.gyro_urad_s` |
| `accel` | `f32[3]` | `sensors.accel_mm_s2` |
| `map` | `u8[1,1,256,256]` | `map_window.cells`, reshaped |
| `memory_in` | `f32[1,4]` | the private `memory` tensor, zero when absent |

An adapter can use any expression the [expression language](adapters/dialect.md) supports; the
names and shapes above are a starting point, not a fixed contract. Tensor shapes, dtypes and
element counts must fit the runtime's limits, and the same manifest runs in `check`, Kalam and the
viewer.

## What it answers

The head is `wheel_map`; see [A turn](../games/slam/turn.md) for the decoder. The graph declares:

| Output | Shape | Meaning |
|---|---|---|
| `wheel_speed` | `i16[1,2]` | Left and right wheel speed in mm/s. |
| `map_update` | `i32[1,2049,3]` | Row 0 origin and reset; up to 2,048 cell writes. |
| `memory` | optional | Bytes carried to the next decision. |

A model may output fewer rows and mark the unused ones with label `-1`, or build the tensor
directly. An invalid tensor is a strike and a no-op, never a partial map.

## Memory

Private memory is flat and optional. A version may declare up to 262,144 bytes, and the season's
weight class prices the declared memory. There is no per-cell memory. Memory is carried between
decisions within a visit, updates on a successful inference even if the head then fails, and resets
between visits.

## Validate and play

From a checkout with a built artifact set (or from the starter):

```sh
tinybrains check model.onnx manifest.json
tinybrains matches/simple-room.json --out replays
tinybrains view replays/first-run.json
tinybrains conform replays/first-run.json
```

`check` runs admission's checks against the cartridge's reference observations, including the
memory round trip and the operation and time budgets. A match plays one robot on a basic scenario;
`view` opens the replay in the cartridge's viewer, with the true world, the submitted map, the scan
and the path. `conform` rebuilds the recorded run from its envelope and diffs every turn of the
action stream.

## A visit sequence

A single match is not an evaluation. A suite runs prescribed visits and carries the saved map:

```sh
tinybrains suite suite.json --out replays --saved-maps saved-maps
tinybrains report suite.json --out replays --json
```

The report is the local counterpart of the hosted aggregate. See
[saved maps and suites](../games/slam/saved-maps.md).

## Train against the environment

`tinybrains env` is a JSON Lines environment, one observation per decision and one action back. It
is the supported way to collect training data without a runner or a database:

```sh
tinybrains env --maps simple-room --waves 1 --matches-per-wave 1 --max-turns 2000
```

The first line is a `hello` naming the game and the maps; each `step` returns the next turn's
observation for each seat. A `close` ends the run. The action is the same object the cartridge
accepts, so the same code that trains can be submitted.

The [starter](https://github.com/Tiny-Brains/slam-starter) ships a model, its manifest, a match, a
two-visit suite and a training example. It is a working adapter, not a baseline: it proves the
path, and improving it is the exercise.

## Before you submit

- The manifest and the graph agree on every name, shape and dtype.
- `check` passes with the memory round trip.
- The action stays within the wheel and map-update limits; an invalid action is a strike.
- The model declares only the memory it uses, and its class's cap covers it.
- A run with the model replays in `view` and conforms.
- The submission page names the game `slam` and the season you are entering.
