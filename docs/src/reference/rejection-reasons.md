# Rejection reasons

Start with the version's `reject_reason` from `GET /v1/me/versions/{id}`. A refused submission
request, an admission rejection, a trial failure and a failed match are separate events, and the
stage tells you what to do next.

## Request refusals

Soma refuses these requests before it records a new version.

| Error or condition | Meaning | Next step |
|---|---|---|
| `hashes_required` | Declared hashes missing, or malformed on their face | Supply both `weights_hash` and `manifest_hash` as `sha256:<64 hex>` |
| `unknown_game` | No game by that slug | Read `GET /v1/games` for the slugs |
| `season_not_open` | No season is accepting submissions | Read the season dates and wait for an open window |
| `not_a_participant` | The season's participant rule does not admit your account | Check eligibility with the organizer |
| `weights_already_entered` | The season refuses duplicate weights, and another competitor's entry (or, in scope `user`, any other model) already holds these | Check the rule scope and submit an eligible entry |
| `version_in_flight` | This model already has a testing or verified candidate | Follow that candidate to a verdict; your other models are unaffected |
| `unknown_model` | That model id is not one of yours | Create the model first; a submission never creates one |
| `model_retired` | The model takes no new versions | Revive it, or submit to another |
| `too_many_in_flight` | You are at the season's limit for versions in admission at once | Wait for one to reach a verdict |
| `too_many_versions` | You have entered as many versions as the season allows | The next season starts you fresh |
| `cooling_down` | The season asks for a gap between one model's submissions | The response carries the instant you may try again |
| `note_too_long`, `note_word_listed` | The version's note is over the length, or carries a word the site lists | Shorten it, or leave the note out |
| `entries_max` | You hold as many models as the season allows | Retire one to free a slot |
| `name_required` | The create call carried no name | Send a name: it is all an entry declares |
| `model_name_taken` | You already have a model with that name | A name tells *your* models apart; another competitor may hold the same one |
| `name_invalid` | A rename to a name the site does not accept | Pick another |
| `401` / `session_revoked` | Session absent, invalid, expired, or revoked | Sign in again |

`weights_already_entered` comes from the season's `unique_weights` rule, and it is the only
uniqueness conflict a submission can hit. A version has no release tag to duplicate, so no
`duplicate_release` error code exists.

`cooling_down` is the only refusal that depends on the current time, so two calls a second apart
can get different answers. For that reason it reports the instant you may retry, and gives no yes or
no.

## The upload, and what arrived

| Reason | Meaning | Next step |
|---|---|---|
| `ARTIFACT_MISSING` | The graph was not in the bucket at your version's key when its thirty-minute upload window closed | **You did not upload.** Submit again for a new version and fresh URLs, and `PUT` both files |
| `MANIFEST_MISSING` | The graph arrived and the manifest had not when the window closed | The same fix, for the second file |
| `MANIFEST_MISMATCH` | The file you uploaded does not hash to `manifest_hash` | Re-run `shasum -a 256` on the file you sent |
| `MANIFEST_INVALID` | The document carries no `inputs` or no `outputs` | Make it an `orion:model@1.0.0` manifest, which carries both |
| `RESULT_NOT_ALLOWED` | The manifest carries a `result` expression | The platform reads the head. Delete the expression; see [the manifest](../models/adapters.md#why-you-do-not-write-the-head) |
| `DIGEST_FAILED` | The node re-hashed the graph and got something else | The same fix as `MANIFEST_MISMATCH`, for `model.onnx` |
| `SIZE_FAILED` | The object is past the node's own ceiling, before admission considers any class | Reduce the file |

## Graph and policy

| Reason | Meaning | Next step |
|---|---|---|
| `PARSE_FAILED` | The ONNX parses and no plan builds | Re-export. A graph that computes its own indices cannot declare named spatial axes, so give it concrete ones |
| `PROBE_FAILED` | It loads and will not run at your `probe_dims` | Check that the declared shapes are the ones the graph takes |
| `PROBE_TOO_SLOW` | The probe's median, five inferences at your `probe_dims`, was over the game's turn (1,000 ms for Ants) on every attempt | Make the graph faster at `probe_dims`. The version's `infer_us` is the last median, and `tinybrains check` measures the same probe |
| `TOO_LARGE` | `S'` (the two files' bytes) fits no class in this season's table | Measure both files and reduce the larger |
| `OPSET_UNSUPPORTED` | Opset outside this season's window | Export within the range the season publishes |
| `OP_NOT_ALLOWED` | Graph uses an operator this season does not allow | Inspect the exported nodes, including `If`/`Loop`/`Scan` bodies, and use supported operations |
| `CLASS_NOT_OFFERED` | It fits only a class this season does not run | Reach a class the season offers. `TOO_LARGE` is the separate reason for a model past every class |
| `PARAMS_EXCEEDED` | More parameters than this season allows | Reduce the parameter count as well as the bytes. The count covers every value the document carries, wherever it carries it |
| `TOO_SLOW` | Slower than this season's inference ceiling | Rare: most seasons set none. Simplify the graph |

A slow graph stays in its class; admission does not move it to a larger one. See
[model format](../models/format.md) and [weight classes](../models/weight-classes.md).

## Adapter and interface

| Reason | Meaning | Next step |
|---|---|---|
| `ADAPTER_INVALID` | An adapter did not produce a tensor the graph takes, or produced none for a declared input | Check operators, scopes, dtypes and shapes. A misspelt operator fails here: loading accepts it |
| `ADAPTER_OVER_BUDGET` | An adapter exceeds its operation budget on a reference observation | Measure the cases and reduce the work; see [the budget](../models/adapters/budget.md) |
| `HEAD_UNREADABLE` | The policy output is not a shape the referee can read | Make it rank 2 or rank 4: `[N, 5]` or `[1, 5, H, W]`. See [the two head shapes](../models/actions.md#the-two-head-shapes) |

`ADAPTER_OVER_BUDGET` means the adapter costs too much, and `ADAPTER_INVALID` means it is wrong; the
platform keeps the two words apart on purpose. Reproduce all three reasons with
[`tinybrains check`](../models/testing.md#check-it-the-way-admission-will), which measures what
admission measures and names the observation and the operator that failed.

**The word is all a version carries.** The platform stores no detail beside it, so `check` on your
machine is where you find out which observation or which node it was.

## Memory

These apply only to a manifest that declares an output named `memory` or `ant_memory`; see
[Memory](../models/memory.md#what-admission-checks).

| Reason | Meaning | Next step |
|---|---|---|
| `MEMORY_NOT_ALLOWED` | The manifest declares a memory output, and its class allows no memory in this season | Remove the output, or enter a class the season gives memory |
| `MEMORY_TOO_LARGE` | The memory costs more than the class's cap on the smallest or the largest board | Shrink its shape or its dtype, or enter a larger class |
| `MEMORY_SHAPE` | A memory output names too many dimensions, names one twice, or lacks a dtype or a shape | `memory` may name two dimensions, `ant_memory` one |
| `MEMORY_ROUND_TRIP` | Fed its own memory on the reference observations, the model's call failed | Make each memory input take exactly what its output writes, and play a match with `tinybrains` |

## Trials and administrative outcomes

| Reason | Meaning | Next step |
|---|---|---|
| `FORFEIT` | Candidate reached the strike limit, five unless the season sets another, in a completed trial | Inspect timing and adapter failures, then retest |
| `UNPLAYABLE` | The trial used up its repair limit | Check whether failures came from the model or infrastructure |
| `RUNNER_UNAVAILABLE` | No runner could load the candidate for its trials, as many times as the repair limit | Not your model. Submit the same files again |
| `SEASON_CLOSED` | The season closed while the candidate waited | Enter an eligible later season |
| `TIMED_OUT` | Admission used all its attempts without finishing verification | Not your model. Check service availability, then submit again |

A withdrawn **queued match** carries its own word in `withdrawn_reason`, and no rejection:

- `SUPERSEDED`: a successor passed its trial and replaced a seat's version, and `successor` names
  the new version.
- `REJECTED`: the platform rejected a seat's version.
- `BASELINE_DISABLED`: an admin disabled a baseline that held a seat.
- `MAP_DISABLED`: an admin disabled the match's board.
- `SEASON_CLOSED`: the season closed.
- `ENGINE_RETIRED`: the season moved to another engine.
- `SEAT_LEFT`: a seat's version left play for any other reason.

A withdrawn match counts as no loss and changes no rating; see
[the life of a version](../competing/version-life.md).

## When the platform fails

A failure on the platform's side leaves the candidate `testing` and sends it back to the queue: the
object store could not be reached, no runner was up, the runner that claimed it could not fetch the
artifact, reach its node or report in time. A failure while the version waited for a runner spends
nothing. A failure on the runner that had claimed it spends one of the three attempts, and three
spent attempts end as `TIMED_OUT`. A timeout at the end of those retries proves nothing about your
network. You never see the intermediate words: a version's `reject_reason` is one of the words on
this page, and nothing else.

`ARTIFACT_MISSING` and `MANIFEST_MISSING` look like platform failures and are **not** in this class.
An empty bucket is your submission's state, and no amount of retrying makes bytes appear.

A rejected candidate leaves your active version in place. Once you know the cause, submit the
corrected files and their hashes as the next version. Keep the failed version and trial IDs in any
report you file: the operator needs them to find the evidence.

## Asking for help

Ask on [Discord](https://discord.gg/xr9Z2mSkxr) when a reason does not say enough, or when the
fault looks like ours. A bug in a part of the platform can also go to that repository's issues on
[GitHub](https://github.com/Tiny-Brains).
