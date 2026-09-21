# Rejection reasons

Start with the version's `reject_reason` from `GET /v1/versions/{id}`. A refused submission request,
an admission rejection, a trial failure and a failed match are separate events, and the stage tells
you what to do next.

## Request refusals

Soma refuses these requests before it records a new version.

| Error or condition | Meaning | Next step |
|---|---|---|
| `hashes_required` | Declared hashes missing, or malformed on their face | Supply both `weights_hash` and `manifest_hash` as `sha256:<64 hex>` |
| `season_not_open` | No season is accepting submissions | Read the season dates and wait for an open window |
| `not_a_participant` | The season's participant rule does not admit your account | Check eligibility with the organizer |
| `weights_already_entered` | Another owner already holds these weights under the season's rule | Check the rule scope and submit an eligible entry |
| `version_in_flight` | This model already has a testing or verified candidate | Follow that candidate to a verdict; your other models are unaffected |
| `unknown_model` | That model id is not one of yours | Create the model first; a submission never creates one |
| `model_retired` | The model takes no new versions | Revive it, or submit to another |
| `too_many_in_flight` | You are at the season's limit for versions in admission at once | Wait for one to reach a verdict |
| `too_many_versions` | You have entered as many versions as the season allows | The next season starts you fresh |
| `cooling_down` | The season asks for a gap between one model's submissions | The response carries the instant you may try again |
| `entries_max` | You hold as many models as the season allows | Retire one to free a slot |
| `name_required` | The create call carried no name | Send a name: it is all an entry declares |
| `model_name_taken` | You already have a model with that name | A name tells *your* models apart; another competitor may hold the same one |
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
| `PROBE_FAILED` | It loads and will not run at your `probe_dims`, or takes longer than the node allows for five inferences | Check that the declared shapes are the ones the graph takes |
| `TOO_LARGE` | `S'` (the two files' bytes) is past the largest class this season runs | Measure both files and reduce the larger |
| `OPSET_UNSUPPORTED` | Opset outside deployed policy | Export within the supported range |
| `OP_NOT_ALLOWED` | Graph uses an operator this season does not allow | Inspect the exported nodes, including `If`/`Loop`/`Scan` bodies, and use supported operations |
| `CLASS_NOT_OFFERED` | It measured into a weight class this season does not run | Reach a class the season offers. `TOO_LARGE` is the separate reason for a model past every class |
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
platform keeps the two words apart on purpose. The detail carries the failing case index. Reproduce
all three reasons with [`tinybrains check`](../models/testing.md#check-it-the-way-admission-will),
which measures what admission measures.

**Every rejection carries a `detail` beside the word**: the failing case index, the operator name,
the two hashes, the byte counts, the stage that stopped. A version page shows the word, and the
detail tells you which observation or which node it was.

## Trials and administrative outcomes

| Reason | Meaning | Next step |
|---|---|---|
| `FORFEIT` | Candidate reached five cumulative strikes in a completed trial | Inspect timing and adapter failures, then retest |
| `FAULT:<reason>` | The trial failed, and the platform attributed the fault to the candidate's seat | Find the model fault behind it |
| `UNPLAYABLE` | The trial used up its repair limit | Check whether failures came from the model or infrastructure |
| `RUNNER_UNAVAILABLE` | No runner could load the candidate for its trials, as many times as the repair limit | Not your model. Submit the same files again |
| `SEASON_CLOSED` | The season closed while the candidate waited | Enter an eligible later season |
| `TIMED_OUT` | Admission used all its attempts without finishing verification | Not your model. Check service availability before a new tagged submission |

A withdrawn **queued match** carries its own word in `withdrawn_reason`, and no rejection:
`SEASON_CLOSED` if the season closed under it, `ENGINE_RETIRED` if the season's engine moved, and
the successor's name if your own next version replaced you. A withdrawn match counts as no loss and
changes no rating; see [the life of a version](../competing/version-life.md).

## Platform-side retries

A storage failure, an unreachable node or a game with an incomplete registration leaves a candidate
`testing` while admission retries, and **does not spend one of your three attempts**. A timeout at
the end of those retries proves nothing about your network. The words in this class are
`PROBE_UNREACHABLE` and `ADMISSION_UNREACHABLE`, which say a node could not be reached, and
`MANIFEST_INCOMPLETE` and `SEASON_RULES_INCOMPLETE`. Those last two guard against the platform
rejecting you for its own missing configuration, and should never reach you.

**The table above lists what the platform publishes, and the platform can emit more.** Admission
words a stage failure by upper-casing the stage that stopped, so an unlisted word ending `_FAILED`
still names a stage. Read its `detail` and report it.

`ARTIFACT_MISSING` and `MANIFEST_MISSING` look like platform failures and are **not** in this class.
An empty bucket is your submission's state, and no amount of retrying makes bytes appear.

A rejected candidate leaves your active version in place. Once you know the cause, submit the
corrected files and their hashes as the next version. Keep the failed version and trial IDs in any
report you file: the operator needs them to find the evidence.
