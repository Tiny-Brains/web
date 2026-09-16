# Submitting a version

A submission declares the two files you are entering — by hash — and says which of your
[models](models.md) it is a version of. The API records a new version and answers with **two
one-shot upload URLs**; you `PUT` the files to them, and then [admission](admission.md) and an
unrated [trial](trial.md) decide whether the version becomes that model's active one.

**The platform stores no bytes of its own and downloads nothing from you.** That is why the upload
step exists: there is no process on the platform with a fetch allowlist, because there is no
process that fetches.

Create the model first. A submission never creates one: a repository with no model
behind it is refused `unknown_model` rather than adopted, because a typo in a
repository path would otherwise start a second lineage with its own version
numbers and its own rating.

## Prepare the release

Attach these exact asset names to a release in a public repository:

| Asset | Content |
|---|---|
| `model.onnx` | Self-contained ONNX model |
| `manifest.json` | What your graph takes and returns, and one adapter per input |

**The release is the public record of what you entered, and the audit trail a reader follows.** The
platform reads its *metadata* — the commit the tag points at — and never its assets. A release that
is missing or private costs you nothing at admission, and is still required: a leaderboard entry
nobody can audit is not an entry.

Compute SHA-256 over each final file using `sha256sum model.onnx manifest.json` on Linux or
`shasum -a 256 model.onnx manifest.json` on macOS. Prefix each digest with `sha256:` in the request.
Whitespace changes in JSON change the hash too.

Publish a new tag for a new attempt: one model cannot enter the same tag twice in one season, even
if the earlier version was rejected. The next season is a fresh start, and the same tag may be
entered again there.

## Make the call

**The site has a form for this**, and it is the shortest path: sign in with GitHub, go to
`/submit`, pick the model — it offers to create one if you have none — and give it the tag and the
two hashes. It stays on the page after the `201` and hands you the two upload commands, because the
submission is not finished until the files are in the bucket.

What follows is the same request made directly, for scripting. The API authenticates with the
HttpOnly `soma_session` browser cookie; standalone API tokens are not implemented, so a script runs
same-origin in the browser rather than from a shell. Replace the repository, tag, and both
illustrative hashes:

```javascript
const response = await fetch('/v1/submissions', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    game: 'ants',
    model: 'your-handle/your-repository',
    release_tag: 'v1',
    weights_hash: 'sha256:<64 hexadecimal digits>',
    manifest_hash: 'sha256:<64 hexadecimal digits>'
  })
});
const result = await response.json();
if (!response.ok) throw new Error(JSON.stringify(result));
console.log(result);
```

`model` names the model this release belongs to, either as its repository path or
as the `model_id` the create call returned.

The hashes must be actual 64-digit values; the placeholders intentionally are not valid. A
successful response has status `201` and fields `version_id`, `model_id`, `model`, `repo`,
`version`, `status`, `season`, `weights_hash`, `manifest_hash` — and **`upload`**. Store the version
ID to follow this exact version.

## Upload the two files

```json
"upload": {
  "model_onnx":    "https://…/models/<version_id>/model.onnx?X-Amz-…",
  "manifest_json": "https://…/models/<version_id>/manifest.json?X-Amz-…",
  "expires_in": "30m"
}
```

`PUT` each file to its URL with the file as the whole body. No headers, no credentials:

```sh
curl -T model.onnx    "$MODEL_URL"
curl -T manifest.json "$MANIFEST_URL"
```

Both URLs are **one-shot and expire in thirty minutes**. Submitting the same release tag again mints
fresh ones, so a link that expired is not a dead end.

**Nothing happens until both files land.** A version whose bucket is empty is rejected
`ARTIFACT_MISSING` or `MANIFEST_MISSING`, naming the key it looked under — which is the most likely
mistake a first-time entrant makes, and it is recoverable by re-submitting the tag.

**The platform re-hashes what arrives.** Anything whose SHA-256 is not what you declared is refused
at admission with the hash it measured. That is what makes a signed upload URL safe to hand out, and
it is why the declaration is checked twice: once by the node against the graph's digest, and once by
the database against the manifest's.

**Version numbers restart per model.** Your second model's first release is v1,
not v4 — a lineage whose history began at 4 because you had an earlier model would
be a number the Version screen could not explain.

## Season and candidate restrictions

The API chooses the game's open season. You cannot use this endpoint to target a
closed or future season. What else a season restricts is the season's own to
declare — see [Seasons](seasons.md) for the whole list — and every restriction is
reported before the request as well as after it, in the same words.

**One `testing` or `verified` version per model may exist at a time.** That rule
is per model, so a competitor with three models may have three versions in
admission at once; a season may additionally cap how many of yours may be in
flight together. A model's currently active version does not prevent a
replacement submission to it.

`GET /v1/games/{game}/submission` reports your standing against every one of those rules before you
make a request, in the same words the refusal would use.

## What happens next

Watch it on the version's page, or read `GET /v1/versions/{version_id}`. Initially status is
`testing`, with phase `queued` or `verifying`. A successful admission changes it to `verified` and
`awaiting_trial`; successful trial completion promotes it to `active`. That read is cached for ten
seconds, so poll on that period or slower — a tighter loop returns the same body.

A request error is different from a later rejection. Missing hashes return `400`;
season or duplicate/candidate conflicts return `409`; an invalid session returns
`401`. Fix the request before retrying. If the request succeeded but a later check
fails, read `reject_reason` and the [rejection reference](../reference/rejection-reasons.md).
Do not repeatedly submit just because verification is asynchronous.
