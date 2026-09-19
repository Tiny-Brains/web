# Limits and budgets

These values describe the checked-in Ants registration and deployment configuration
as of **19 September 2026**. A deployed competition's announced rules take precedence
when its configuration differs. Byte units are binary: 1 KiB = 1,024 bytes and
1 MiB = 1,048,576 bytes.

## Model and adapter

| Limit | Current value | Applies to |
|---|---:|---|
| Maximum size metric | 128 MiB | Largest eligible class |
| ONNX opset range | 13–19 inclusive | Admission policy |
| Manifest ABI | `orion:model@1.0.0` | `manifest.json` |
| Adapter operations | 1,000,000 | Each declared input's adapter, per evaluation |
| Adapter boundary dtypes | bool, i8, u8, i16, u16, i32, u32, i64, u64, f32, f64 | Tensors an adapter hands the graph |
| Probe inferences at admission | 5, at `probe_dims` | Whether the graph runs at all |

The size metric is `bytes(model.onnx) + bytes(manifest.json)`, uncompressed. The
[class table](../models/weight-classes.md) contains all five size boundaries; the
[format page](../models/format.md) lists configured ONNX operators. There is no per-class compute
cap.

## Ants matches

| Setting | Current value |
|---|---:|
| Players on a board | 2 to 8, fixed by each board |
| A board's sides | 24 to 124 squares each |
| Squares on a board | at most 14,880 |
| Maximum turns | 1,000 |
| Turn deadline, per seat, covering its adapters and its inference | 1,000 ms |
| View radius squared | 77 |
| Attack radius squared | 5 |
| Gathering radius squared | 1 |
| Strikes before forfeit | 5 cumulative per match |
| Stalemate duration | 150 consecutive qualifying turns |
| Domination threshold | At least 85% of living ants |

The [map table](../games/ants/maps.md) gives dimensions and generation inputs.
Strikes are platform accounting; ordinary illegal movement into water simply
stays in place under the game rules.

## Admission and submissions

| Setting | Current value |
|---|---:|
| In-flight candidate slots | 1 per model, covering testing and verified; a season may also cap the total across your models |
| Admission polling interval | 20 seconds |
| Admission batch | Up to 4 candidates per run |
| Verification claim timeout | 180 seconds |
| Admission attempts | At most 3 before timeout rejection |
| Reference probe deadline, for the whole set | 5,000 ms |
| Upload URL lifetime | 30 minutes, one-shot |
| Trial repair limit | 3 trial rows |
| Submission endpoint rate | 1 request/second, burst 5, per authenticated principal |

## Season quotas

These have no platform-wide value. Each is absent unless the season declares it,
and absent means no limit — so the table below is what a season *may* set, not
what any season does. `GET /v1/games/{game}/submission` reports your standing
against every one of them, before you make a request.

| Rule | What it caps |
|---|---|
| `entries.max_per_user` | how many models you may hold in the season |
| `entries.max_per_class` | how many of them may sit in one weight class |
| `entries.in_flight_max` | how many of your versions may be in admission at once |
| `entries.versions_max_per_model` | versions one model may enter |
| `entries.versions_max_per_user` | versions you may enter across every model |
| `entries.cooldown_s` | the gap between one model's submissions |
| `classes.allow` | which weight classes may be entered at all |
| `graph.params_max` | a parameter ceiling, independent of the byte cap |
| `graph.opset_min` / `opset_max` | the ONNX opset window |
| `graph.op_allowlist` | the operator set, narrowing the platform's |
| `unique_weights.scope` | whether two entries may stand on the same weights |

A rate limit does not override the one-candidate-per-model or unique-weights rules, nor any quota the season declares. The
admission timeout is not a guarantee of total turnaround time, and its validation
deadline is longer than the actual turn deadline.

## Ratings and scheduling

| Setting | Current value |
|---|---:|
| Initial rating mean | 25 |
| Initial uncertainty | 8.333333333333334 |
| Displayed rating | `mu − 3 × sigma` |
| Provisional uncertainty threshold | Greater than 3 |
| Placement target / initial request cap | 8 |
| Steady-state request cap | 2 |
| Successor uncertainty multiplier | 2, capped at initial uncertainty |
| Requested cross-class fraction | 0.20, with pool-dependent fallback |

These are policy settings, not per-competitor match-rate guarantees. Read
[Ranking](../competing/ranking.md) before interpreting an idle or provisional entry.

## Where values come from

Ants' `cartridge.json` declares the limits every season's board must fit (`limits.boards`, the
three board rows above), turn limits, and the adapter budget. A season's boards are its own,
uploaded by an admin and listed at `GET /v1/games/ants/seasons/{slug}/maps`. The engine source
implements geometry and game-ending rules. The **season** fixes the size boundaries and every quota
in the table above, in the database; Soma's admission clock judges against them. The DevOps Orion templates configure
opsets, trials, ratings, scheduling and the operation budget the node enforces. The
[repositories page](../platform/repositories.md) identifies each owner.
