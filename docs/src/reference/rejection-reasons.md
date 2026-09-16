# Rejection reasons

Start with the version's `reject_reason` from `GET /v1/versions/{id}`. A submission request
refusal, an admission rejection, a trial failure, and a failed match are different events; use the
stage to decide what to do next.

## Request refusals

These occur before a new version is successfully recorded.

| Error or condition | Meaning | Next step |
|---|---|---|
| `hashes_required` | Missing or obviously malformed declared hashes | Supply both `weights_hash` and `manifest_hash` as `sha256:<64 hex>` |
| `season_not_open` | No season accepting submissions | Read the season dates and wait for an open window |
| `not_a_participant` | Account not admitted by the season's participant rule | Check eligibility with the organizer |
| `weights_already_entered` | Another owner already holds these weights under the season's rule | Check the rule scope and submit an eligible entry |
| `409` duplicate release | This model has already entered that tag this season | Publish a new tag for changed bytes |
| `version_in_flight` | This model already has a testing or verified candidate | Follow that candidate to a verdict; your other models are unaffected |
| `unknown_model` | No model of yours publishes from that repository | Create the model first — a submission never creates one |
| `model_retired` | The model takes no new releases | Revive it, or submit to another |
| `too_many_in_flight` | You are at the season's limit for versions in admission at once | Wait for one to reach a verdict |
| `too_many_versions` | You have entered as many versions as the season allows | The next season starts you fresh |
| `cooling_down` | The season asks for a gap between one model's submissions | The response carries the instant you may try again |
| `entries_max` | You hold as many models as the season allows | Retire one to free a slot |
| `repo_invalid` | The URL does not name exactly one repository | Give `owner/name`, or the repository's own page |
| `repo_unverified` | GitHub did not confirm who owns the repository — it may not exist, or we are briefly rate-limited | Check the spelling; if it is right, try again shortly |
| `repo_private` | The repository is private, and release assets are fetched without a token | Make it public, or publish from one that is |
| `repo_not_owned` | GitHub says the repository belongs to a different account | Use one your signed-in account owns, or an organisation the season allows |
| `repo_taken` | That repository already has a model on it, and it is not yours | One repository is one model, platform-wide |
| `repo_taken_by_you` | You already have a model on that repository | Submit a release to the model you have rather than making a second one |
| `model_name_taken` | You already have a model with that name | Names are how yours are told apart |
| `401` / `session_revoked` | Session absent, invalid, expired, or revoked | Sign in again |

The current uniqueness-conflict response comes from the platform's database error
mapping; do not depend on an invented `duplicate_release` error code.

`cooling_down` is the one refusal that can legitimately disagree with itself
between two calls a second apart, because it is a function of the current time.
That is why it reports the instant you may retry rather than a yes or no.

## The upload, and what arrived

| Reason | Meaning | Next step |
|---|---|---|
| `ARTIFACT_MISSING` | The graph is not in the bucket at your version's key | **You did not upload.** Submit the same tag again for fresh URLs and `PUT` both files |
| `MANIFEST_MISSING` | The graph arrived and the manifest did not | The same fix, for the second file |
| `MANIFEST_MISMATCH` | What was uploaded does not hash to `manifest_hash` | Re-run `shasum -a 256` on the file you actually sent |
| `MANIFEST_INVALID` | The document carries no `inputs` or no `outputs` | It is not an `orion:model@1.0.0` manifest |
| `RESULT_NOT_ALLOWED` | The manifest carries a `result` expression | The platform reads the head. Delete it — see [the manifest](../models/adapters.md#why-you-do-not-write-the-head) |
| `DIGEST_FAILED` | The node re-hashed the graph and got something else | The same fix as `MANIFEST_MISMATCH`, for `model.onnx` |
| `SIZE_FAILED` | The object is past the node's own ceiling, before any class is considered | Reduce the file |

## Graph and policy

| Reason | Meaning | Next step |
|---|---|---|
| `PARSE_FAILED` | The ONNX parses and no plan builds | Re-export. A graph that computes indices internally cannot declare named spatial axes — give it concrete ones |
| `PROBE_FAILED` | It loads and will not run at your `probe_dims`, or takes longer than the node allows for five inferences | Check that the declared shapes are what the graph actually takes |
| `TOO_LARGE` | `S'` — the two files' bytes — is past the largest class this season runs | Measure both files and reduce the larger |
| `OPSET_UNSUPPORTED` | Opset outside deployed policy | Export within the supported range |
| `OP_NOT_ALLOWED` | Graph uses an operator this season does not allow | Inspect the exported nodes, including `If`/`Loop`/`Scan` bodies, and use supported operations |
| `CLASS_NOT_OFFERED` | It measured into a weight class this season does not run | Reach a class the season offers — this is not the same as being too large |
| `PARAMS_EXCEEDED` | More parameters than this season allows | Reduce the parameter count, not only the bytes. The count is every value the document carries, wherever it carries it |
| `TOO_SLOW` | Slower than this season's inference ceiling | Rare: most seasons set none. Simplify the graph |

A slow graph does not automatically move to a larger class. See
[model format](../models/format.md) and [weight classes](../models/weight-classes.md).

## Adapter and interface

| Reason | Meaning | Next step |
|---|---|---|
| `ADAPTER_INVALID` | An adapter did not produce a tensor the graph takes, or produced none for a declared input | Check operators, scopes, dtypes and shapes. A misspelt operator fails here, not at load |
| `ADAPTER_OVER_BUDGET` | An adapter exceeds its operation budget on a reference observation | Measure cases and reduce the work — [the budget](../models/adapters/budget.md) |
| `HEAD_UNREADABLE` | The policy output is not a shape the referee can read | It must be rank 2 or rank 4 — `[N, 5]` or `[1, 5, H, W]`. See [the two head shapes](../models/actions.md#the-two-head-shapes) |

`ADAPTER_OVER_BUDGET` and `ADAPTER_INVALID` are deliberately different words: "too expensive" and
"wrong" must not read the same. The detail carries the failing case index. Reproduce all three with
[`tinybrains check`](../models/testing.md#check-it-the-way-admission-will), which measures what
admission measures.

**Every rejection carries a `detail` beside the word** — the failing case index, the operator name,
the two hashes, the byte counts, the stage that stopped. The word is what a version page shows; the
detail is what tells you which observation or which node it was.

## Trials and administrative outcomes

| Reason | Meaning | Next step |
|---|---|---|
| `FORFEIT` | Candidate reached five cumulative strikes in a completed trial | Inspect timing and adapter failures, then retest |
| `FAULT:<reason>` | Failed trial attributed to the candidate seat | Investigate the underlying model fault |
| `UNPLAYABLE` | Trial repair limit exhausted | Check whether failures came from the model or infrastructure |
| `SEASON_CLOSED` | Waiting candidate could not proceed after closure | Enter an eligible later season |
| `TIMED_OUT` | Admission exhausted attempts without completing verification | Not your model. Check service availability before a new tagged submission |

A **queued match** that is withdrawn carries its own word rather than a rejection: `withdrawn_reason`
is `SEASON_CLOSED` when the season closed under it, `ENGINE_RETIRED` when the season's engine moved,
and names the successor when your own next version replaced you. A withdrawn match is not a loss and
changes no rating — see [the life of a version](../competing/version-life.md).

## Platform-side retries

A storage failure, a node that cannot be reached, or a game whose registration is incomplete leaves
a candidate `testing` while admission retries — and **does not spend one of your three attempts**.
An eventual timeout does not establish that the neural network is invalid. The words in this class
are `PROBE_UNREACHABLE` and `ADMISSION_UNREACHABLE`, which say a node could not be reached, and
`MANIFEST_INCOMPLETE` and `SEASON_RULES_INCOMPLETE`, which are guards against the platform rejecting
you for its own missing configuration and are meant never to reach you at all.

**The table above is what the platform publishes, not the whole of what it can emit.** A stage
failure is worded by upper-casing the stage that stopped, so a word ending `_FAILED` that is not
listed here is still a stage name rather than a blank — read the `detail` and report it.

`ARTIFACT_MISSING` and `MANIFEST_MISSING` are **not** in this class, although they look like it.
An empty bucket is your submission's state, not the platform's, and no amount of retrying makes
bytes appear.

A rejected candidate does not displace your active version. Once you understand
the cause, publish a new release tag and hashes for the next attempt. Preserve
the failed version and trial IDs in any report; they identify the evidence the
operator needs.
