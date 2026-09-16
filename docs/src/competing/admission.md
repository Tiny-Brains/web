# Admission

Admission checks whether the model and manifest you uploaded can be used by the arena. It starts
after a submission creates a `testing` version — **and after both files are in the bucket**. It does
not assess whether your strategy is strong enough to win.

## What is checked

The platform processes these stages in order:

1. Confirm both objects are in the bucket at your version's keys. If not: `ARTIFACT_MISSING` or
   `MANIFEST_MISSING`, which means the [upload step](submitting.md#upload-the-two-files) did not
   happen.
2. Re-hash the manifest against `manifest_hash`, and its length is half your size metric.
3. Register the model on the node from your manifest and a reference to the artifact.
4. Fetch the artifact through that reference, **re-hash it against the digest you declared**, read
   the graph from the protobuf — parameters, nodes, operators, IR version, opset — build a plan, and
   run five inferences on zero-filled inputs at your `probe_dims`.
5. Assign a size class from `artifact_bytes + len(manifest)` against **your season's** table, and
   apply its opset, operator and parameter policy.
6. Run your manifest over the game's reference observations under the operation budget, and check
   that the head decodes to a valid action every time.
7. Record either `verified` or `rejected`.

Nothing in that walk rejects a graph for being expensive. The turn deadline does that, at play, as
a strike against the seat that missed it.

Each adapter must produce a tensor of the dtype and shape your manifest declares, and the graph must
accept it. That does not replace your own action checks: the platform confirms your head *decodes*,
not that it decodes to good moves.

## Watching progress

`GET /v1/versions/{id}` returns `phase` and, during testing, `admit_attempt`. `queued` means
verification has not started; `verifying` means it has been claimed. The current admission clock
runs every 20 seconds and processes a bounded batch. The object fetch, the graph build, queueing and
retries all affect elapsed time; there is no fixed promise that a submission finishes in one clock
period.

The current verification claim allows 180 seconds per attempt, with at most three attempts before
`TIMED_OUT`. These are deployment values, not the match's turn deadline. The reference run allows
5,000 ms for the whole set, while an actual Ants turn allows 1,000 ms a seat.

## Verified

`verified` means the checks passed and the version is awaiting its trial. It is
not yet eligible for regular rated matches. The version response carries the
latest `trial` when one has been queued, including its match ID, status, preset,
queue time, and waiting seconds while pending.

There is no automatic “too long awaiting trial” expiry. If it stays verified,
inspect trial state rather than treating it as another admission attempt.

## Rejected

Anything that is your submission's fault — a hash mismatch, an unsupported operator, a shape the
graph will not take, an adapter over budget, a missing upload — produces a rejection reason. Correct
the files, check locally, and submit them as the next version. See
[rejection reasons](../reference/rejection-reasons.md).

A rejection does not replace that model's previous active version, and does not touch your other models. Keep using that
version's matches to evaluate your next change while fixing the candidate.

## When the platform cannot complete the check

A temporary storage or capacity failure is retried while the version remains `testing`, **and does
not spend one of your three attempts**. It should not be interpreted as proof that your model is
malformed. Repeated inability to finish can eventually produce `TIMED_OUT`. Report a version ID and
the observed phase and reason when asking the operator to investigate; do not change working weights
merely to work around an unavailable service.

**`ARTIFACT_MISSING` is not one of these.** An empty bucket is your submission's state, not the
platform's, and retrying cannot make bytes appear — so it is a rejection and the fix is to submit
the tag again and upload.
