# Submitting a version

A submission declares the two files you are entering, by hash, and says which of your
[models](models.md) it is a version of. The API records a new version and answers with **two
one-shot upload URLs**. You `PUT` the files to them, then [admission](admission.md) and an unrated
[trial](trial.md) decide whether the version becomes that model's active one.

**The platform stores no bytes of its own and downloads nothing from you**, so you upload the files
yourself, and no process on the platform needs a fetch allowlist.

Create the model first. A submission never creates one: the platform refuses an unknown model with
`unknown_model`, so a typo cannot start a second lineage with its own version numbers and its own
rating.

## Prepare the two files

| File | Content |
|---|---|
| `model.onnx` | Self-contained ONNX model |
| `manifest.json` | What your graph takes and returns, and one adapter per input |

**There is no release to cut and no repository to own. The audit trail is the artifact.** The
platform holds your bytes under `models/<version_id>/model.onnx`, a key it generates from the version
id. No one can retag that key, you cannot delete it, and every reader of that version resolves the
same one.

## The short way: the site's form

**Sign in and go to [`/submit`](/submit).** Pick the model, pick the two files, press the button.
The page then:

1. reads each file and computes its SHA-256 with the browser's own `crypto.subtle`;
2. POSTs those two digests as the submission;
3. `PUT`s both files from your browser to the object store. **Nothing passes through the site**,
   which holds no bytes of its own.

**The digest and the bytes come from one read**, so they cannot disagree: the page hashes a buffer
and uploads that same buffer. The page shows both digests as you pick the files, since they are the
contract and a rejection would name them.

If a transfer fails (a blocked request, a proxy, a firewall), **the platform still records the
version**, and the page hands you the two `curl` commands for the URLs it was using.

## The long way: the API

To script a submission, make the same calls yourself.

Compute the SHA-256 of each final file with `sha256sum model.onnx manifest.json` on Linux or
`shasum -a 256 model.onnx manifest.json` on macOS, and prefix each digest with `sha256:` in the
request. A whitespace change in JSON changes the hash too.

The API authenticates with the HttpOnly `soma_session` browser cookie and has no standalone API
tokens, so a script runs same-origin in the browser, and not from a shell. Replace the model id and
both illustrative hashes:

```javascript
const response = await fetch('/v1/submissions', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    game: 'ants',
    model: '<the model_id the create call returned>',
    weights_hash: 'sha256:<64 hexadecimal digits>',
    manifest_hash: 'sha256:<64 hexadecimal digits>'
  })
});
const result = await response.json();
if (!response.ok) throw new Error(JSON.stringify(result));
console.log(result);
```

`model` is the `model_id` the create call returned, and `GET /v1/models` lists yours.

The hashes must be real 64-digit values; the placeholders are invalid on purpose. A successful
response has status `201` and the fields `version_id`, `model_id`, `model`, `version`, `status`,
`season`, `weights_hash`, `manifest_hash` and **`upload`**. Store the version ID to follow this
version.

## Upload the two files

The site's form does this step for you. The `201` carries:

```json
"upload": {
  "model_onnx":    "https://…/models/<version_id>/model.onnx?X-Amz-…",
  "manifest_json": "https://…/models/<version_id>/manifest.json?X-Amz-…",
  "expires_in": "30m"
}
```

`PUT` each file to its URL with the file as the whole body, and no headers or credentials:

```sh
curl -T model.onnx    "$MODEL_URL"
curl -T manifest.json "$MANIFEST_URL"
```

Both URLs are **one-shot**, and your version has **thirty minutes from its first POST** for both
files to land. POST the submission again with **the same two hashes** inside that window and the same
version answers `200` with fresh URLs that expire when the window does, so a failed `PUT` costs you
no version number. After the window, or with a *different* hash while one is in flight, the platform
answers `version_in_flight`.

**Nothing happens until both files land.** Admission waits out the window for them. A version still
missing a file when the window closes is rejected with `ARTIFACT_MISSING` or `MANIFEST_MISSING`, and
the reason names the key admission looked under. A first-time entrant is most likely to make this
mistake.

**The platform re-hashes what arrives.** Admission refuses a file whose SHA-256 differs from what you
declared, and reports the hash it measured. The re-hash makes a signed upload URL safe to hand out,
and the platform checks your declaration twice: the node against the graph's digest, and the
database against the manifest's.

**Version numbers restart per model, and the platform assigns them.** Your second model's first
version is v1. A lineage whose history began at 4 because you had an earlier model would carry a
number the Version screen could not explain.

## Season and candidate restrictions

The API picks the game's open season; this endpoint cannot target a closed or
future season. Each season declares its other restrictions itself
([Seasons](seasons.md) has the whole list), and the platform reports each limit on models, versions
and cooldown before the request as well as after it, in the same words.

**One `testing` or `verified` version per model may exist at a time.** The rule
is per model, so a competitor with three models may have three versions in
admission at once; a season can also cap how many of yours are in flight
together. A model's active version does not block a replacement submission to
it.

`GET /v1/games/{game}/submission` reports your standing against every one of those rules before you
make a request, in the same words the refusal would use.

## What happens next

Watch the version's page, or read `GET /v1/versions/{version_id}`. The status starts at `testing`,
with phase `queued` or `verifying`. Passing admission moves it to `verified` and `awaiting_trial`;
passing the trial promotes it to `active`. The platform caches that read for ten seconds, so poll
every ten seconds or slower: a tighter loop returns the same body.

A request error and a later rejection are separate things. Missing hashes return `400`;
season or duplicate/candidate conflicts return `409`; an invalid session returns
`401`. Fix the request before retrying. If the request succeeded and a later check
fails, read `reject_reason` and the [rejection reference](../reference/rejection-reasons.md).
Verification is asynchronous, so wait for it; submitting again will not hurry it.
