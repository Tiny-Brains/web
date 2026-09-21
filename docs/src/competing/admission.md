# Admission

Admission checks whether the arena can use the model and manifest you uploaded. It starts once a
submission has created a `testing` version **and both files are in the bucket**. It does not judge
whether your strategy is strong enough to win.

## What is checked

The platform runs these stages in order:

1. Confirm both objects are in the bucket at your version's keys. Admission waits for a missing one
   until the upload window closes, thirty minutes after your POST; after that the version gets
   `ARTIFACT_MISSING` or `MANIFEST_MISSING`, which means the
   [upload step](submitting.md#upload-the-two-files) did not happen.
2. Re-hash the manifest against `manifest_hash`. Its length is one of the two terms of your size
   metric.
3. Register the model on the node from your manifest and a reference to the artifact.
4. Fetch the artifact through that reference, **re-hash it against the digest you declared**, read
   the graph from the protobuf (parameters, nodes, operators, IR version, opset), build a plan, and
   run five inferences on zero-filled inputs at your `probe_dims`. Their median must fit the game's
   turn, 1,000 ms for Ants.
5. Assign a size class from `artifact_bytes + len(manifest)` against **your season's** table, and
   apply its opset, operator and parameter policy.
6. Run your manifest over the game's reference observations under the operation budget, and check
   that the head decodes to a valid action every time.
7. Record either `verified` or `rejected`.

No stage rejects a graph for being expensive. The turn deadline deals with cost during play, as a
strike against the seat that missed it.

Each adapter must produce a tensor of the dtype and shape your manifest declares, and the graph must
accept it. Keep your own action checks: the platform confirms that your head *decodes*, and says
nothing about whether it decodes to good moves.

## Watching progress

`GET /v1/versions/{id}` returns `phase` and, during testing, `admit_attempt`. `queued` means
verification has not started; `verifying` means a runner has claimed it. The admission clock runs
every 20 seconds and processes a bounded batch. The object fetch, the graph build, queueing and
retries all add to the elapsed time, and nothing guarantees that a submission finishes in one clock
period.

A verification claim allows 180 seconds per attempt, with at most three attempts. Both are
deployment values, separate from the match's turn deadline. Each reference inference allows
5,000 ms; an Ants turn allows 1,000 ms a seat.

## Verified

`verified` means the checks passed and the version is waiting for its trial. It
plays no regular rated matches yet. Once the platform queues a trial, the version
response carries the latest `trial`: its match ID, status, board, queue time, and,
while it is pending, its waiting seconds.

No timer expires a version that waits too long for its trial. If it stays
`verified`, inspect its trial state: admission is over.

## Rejected

A fault in your submission (a hash mismatch, an unsupported operator, a shape the graph will not
take, an adapter over budget, a missing upload) produces a rejection reason. Correct the files, check
them on your machine, and submit them as the next version.
[Rejection reasons](../reference/rejection-reasons.md) lists every reason.

A rejection leaves that model's previous active version in place and your other models untouched.
While you fix the candidate, keep using that version's matches to evaluate your next change.

## When the platform cannot complete the check

The platform retries a temporary storage or capacity failure while the version stays `testing`,
**and the retry does not spend one of your three attempts**. Such a failure says nothing about your
model. If admission keeps failing to finish, the version can end `TIMED_OUT`. To ask the operator to
investigate, report the version ID and the phase and reason you saw; do not change working weights
to work around an unavailable service.

**A slow probe is retried, and a slow probe on every attempt is yours.** The runner that measures
the probe may be busy, so a median over the turn sends the version back to be tried again and
spends an attempt. If the probe is over the turn on all three attempts, the version is rejected
`PROBE_TOO_SLOW`, and its `infer_us` holds the last median. `tinybrains check` runs the same probe.

**`ARTIFACT_MISSING` is not one of these.** An empty bucket belongs to your submission, and no retry
can make bytes appear, so the platform rejects the version. Submit again for a new version and fresh
URLs, and `PUT` both files.
