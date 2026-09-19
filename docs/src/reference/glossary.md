# Glossary

| Term | Meaning |
|---|---|
| Action | The JSON answer for one seat's turn; in Ants, an ordered array of direction strings |
| Active | A version eligible to be scheduled within its season |
| Adapter | One declarative program in a manifest: it turns the observation into one of the graph's input tensors |
| Admission | Static and reference-case checks before a candidate is verified |
| Baseline | Platform-provided entry, tagged as a baseline and uploaded into a season by its administrators; paired and rated like any other while it is in play, and the opponent in every trial |
| Basic board | One of the five boards the Ants release ships, one of each size. They span the limits every season's board fits, and the reference set is drawn on them |
| Board | What a match is played on: a map file, which fixes its size, seats, terrain, hills and turn-zero food. A season's boards are its own, uploaded by an admin and public from upload |
| Candidate | A submitted version still testing or awaiting its trial verdict |
| Cartridge | A game's rules, observations, scoring, generation, and replay reconstruction in a WebAssembly component |
| Class | A version's assigned size category: Nano, Micro, Mini, Small, or Large |
| Conservative rating | Displayed strength estimate, `mu − 3 × sigma` |
| datalogic | The JSONLogic engine an adapter is evaluated by, and the tensor operators it carries |
| DataLogic Studio | A JSONLogic editor and debugger, built on the same engine the arena runs an adapter on; it draws a program and runs its JSON half |
| Engine digest | Identity of the game component bytes used for a match |
| Focus | An Ants unit's count of enemies in attack range, used to resolve combat |
| Forfeit | Platform-imposed last-place treatment after too many failed turn answers |
| Hill | A colony's spawn location and the objective that determines Ants score |
| Hive | A colony's stored food, available for spawning on free hills |
| Initializer | Stored tensor data in the ONNX graph. Its bytes are part of the file, and the file is half the size metric |
| Kalam | Package that claims and executes matches and records replays |
| Ladder | A ranking with its own rating estimates: a size class or Open |
| Manifest | What you submit beside the graph: its inputs and outputs by name, dtype and shape, and one adapter per input |
| Match | One game among specified model versions, recorded from queueing through its outcome |
| Model | A competitor's entry: a name, and every version entered under it. Addressed by its id; a competitor may hold several |
| Model ID | UUID identifying one model. **Not** the id a node knows a version by, which is derived from the version id |
| Observation | The information a game gives one seat to choose its next action |
| Open | The ladder where models of different sizes compete |
| Placement | Early scheduling intended to gather enough evidence about a new version |
| Provisional | A rating whose uncertainty exceeds the configured threshold |
| Raze | Permanently destroy an enemy hill by surviving on it through combat |
| Replay | Recorded initialization metadata and actions used to reconstruct a match |
| RLE | Run-length encoding; Ants water uses alternating value/count pairs |
| Season | A game-specific competition with a submission window and retained standings |
| Seat | A player's position in one match; separate from account and model identity |
| Seed | Deterministic initialization input; meaningful with the matching game engine and board |
| Slug | A season's address, derived from its name and never changed: "Summer 2026" is `summer-2026` |
| Settled | Sufficiently established under rating and placement policy to need fewer scheduled matches |
| Soma | Public API, owner of the platform database schema, and the clocks responsible for admission, matchmaking, counting, promotion, and withdrawal |
| Strike | One failed turn answer counted toward a match forfeit |
| Superseded | A version replaced by a successful candidate OF THE SAME MODEL, in the same season |
| tract | The pure-Rust ONNX runtime a node builds a plan with and runs the graph on |
| Trial | An unrated match checking whether a verified candidate can play |
| Verified | Admission passed, but trial promotion has not yet occurred |
| Version | One submission of a model and a manifest, under one model, in one season. Version numbers restart per model and the platform assigns them |
| Version ID | UUID identifying one version — what a seat, a rating and a replay point at |
| Weight hash | SHA-256 of the exact ONNX file. Declared at submission, re-hashed by the node against what you uploaded |
| Withdrawal | Cancellation of a queued match that is no longer eligible to play |

For the entry sequence, return to the [quickstart](../quickstart.md). For an
exact number or error, use [limits](limits.md) or [rejection reasons](rejection-reasons.md).
