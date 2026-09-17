# Quickstart

Your first target is a version that completes a trial and enters the ladder.
Start with a simple model whose inputs and outputs you understand, then improve
its decisions using match results.

## What you need

You need a GitHub account — it is how you sign in, and the only thing GitHub does
here — a way to train
and export an ONNX model, and a manifest for Ants. Check the game's
[seasons](competing/seasons.md) before preparing an entry: submissions must arrive
inside an open window and satisfy that season's participation rules.

The `tinybrains` command-line tool — one `cargo install`, [below](models/testing.md#the-tinybrains-cli) —
plays matches, runs admission's checks, and exposes the real cartridge as a
[training environment](models/testing.md#train-against-the-real-engine), so a training loop drives
the engine the ladder plays rather than a second implementation of it. You do not need to operate
the platform to enter a hosted competition.

## The short way: start from a working entry

[**`Tiny-Brains/ants-starter`**](https://github.com/Tiny-Brains/ants-starter) is a trained **nano**
entry that is admitted unchanged, with its generated manifest, the `metrics.json` and `card.md` the
platform measures, two match files, and a CI workflow that re-checks it on every push.

```sh
cargo install --locked --git https://github.com/Tiny-Brains/devops tinybrains   # once
git clone https://github.com/Tiny-Brains/ants-starter
cd ants-starter
tinybrains check model.onnx manifest.json      # what admission will say
tinybrains matches/self-play.json              # play it against itself, through the real engine
python train.py                                # retrain it: about an hour
```

Submit it as-is to watch the whole loop end to end, then change something and retrain. It is not one
of the platform's baselines — it was trained with its own seed, so the ladder takes it as a new
entry. The rest of this page is the same journey starting from nothing.

## The long way

### 1. Train something small

Read [Ants](games/ants.md), then decide how to represent the
[observation](models/observation.md). For example, a spatial model can consume
planes for your ants, visible enemies, food, and known water and produce five
move scores per ant or per board square.

Train using the same information the arena supplies — and preferably against the same engine, by
driving [`tinybrains env`](models/testing.md#train-against-the-real-engine) rather than writing the
rules again in Python. Export to `model.onnx`, with named tensor inputs and outputs that your
manifest can name. Check the
[model requirements](models/format.md) and [size classes](models/weight-classes.md)
before committing to an architecture. Export success alone does not establish
admission compatibility.

### 2. Write the manifest

Create `manifest.json`: it declares each of your graph's inputs and outputs by name, dtype and
shape, and carries one **adapter** per input — a small program that turns the observation into that
tensor. A dimension may be a *name*, so one entry plays every board size.

**You do not write the output side.** The referee reads your policy head, in a channel order the
game publishes ([why](models/adapters.md#why-you-do-not-write-the-head)). See the complete small
example in [The manifest](models/adapters.md), and
[a real manifest, piece by piece](models/adapters/walkthrough.md) for one that plays.

Run the pair through [local checks](models/testing.md). Exercise all three map sizes, empty lists,
large colonies, and fragmented known-water masks. Check the operation counts and the actual actions,
not only whether execution returns.

### 3. Hash the two files — or let the site do it

Keep the exact names `model.onnx` and `manifest.json` — they are what the upload URLs are minted
for. **If you submit through the site you can skip this step**: `/submit` hashes both files in your
browser. To do it yourself, compute SHA-256 over those exact bytes:

```sh
# Linux
sha256sum model.onnx manifest.json

# macOS
shasum -a 256 model.onnx manifest.json
```

Keep the files unchanged after hashing. The submission uses `sha256:` followed by each file's 64
hexadecimal digits.

### 4. Create the model, then submit to it

Sign in through the competition's GitHub sign-in flow and **the site's `/submit` form does all of
this for you**: pick the model, pick the two files, press the button. It hashes them in your browser
and uploads them straight to the object store, so step 3 above is something it does rather than
something you do.

Made directly, it is two calls. A model is your entry: a name, and every version you enter under it.
Create it once:

```json
POST /v1/games/ants/models
{ "name": "First try" }
```

That answers with a `model_id`. Submit the version against it:

```json
POST /v1/submissions
{
  "game": "ants",
  "model": "<the model_id from above>",
  "weights_hash": "sha256:<64 hex digits for model.onnx>",
  "manifest_hash": "sha256:<64 hex digits for manifest.json>"
}
```

Replace the illustrative hash values; they are not valid hashes. Save the returned `version_id`.
The version number is the platform's to assign — this one is v1.

**The `201` answers with two one-shot upload URLs**, and nothing happens until you use them:

```sh
curl -T model.onnx    "$MODEL_URL"       # upload.model_onnx
curl -T manifest.json "$MANIFEST_URL"    # upload.manifest_json
```

The platform stores no bytes of its own and downloads nothing from you, so a version whose bucket is
empty is rejected `ARTIFACT_MISSING`. It re-hashes what arrives against what you declared. See [Submitting](competing/submitting.md) for session
usage and error handling, and [Models and versions](competing/models.md) for why
the two calls are separate.

### 5. Watch the trial

Watch it on the version's page, or read `GET /v1/versions/{version_id}` — that read is cached for
ten seconds, so poll no faster. Its `phase` distinguishes waiting for verification
from waiting for a trial. If admission succeeds, status becomes `verified`, then
`active` after a successful trial. **Losing the trial is fine**; forfeiting it is
not. The trial checks playability and never changes ratings.

A rejection includes `reject_reason`. Fix the named issue, validate again, and
submit the corrected files as the next version. If the version is waiting, inspect its phase and trial
status before attempting another submission to the same model: one candidate per
model may be in flight. Another of your models can be submitted to meanwhile.

## Where to go next

Read [matches](competing/matches.md), [replays](competing/replays.md), and
[ranking](competing/ranking.md) to understand your first results. Improve one
behavior at a time and enter another version while the submission window remains
open. A model's active version stays in competition while its replacement is
tested, and your other models keep playing throughout.


> **Replay visualiser — planned:** Follow one admitted entry through its trial, highlighting the first food collection, a fight, and the final result. Show the candidate’s view alongside the full replay.

<!-- replay-visualiser: quickstart-first-trial
Use a recorded replay and its matching engine digest; select the relevant turns.
Provide a text caption and retain the explanation above as the accessible fallback.
Replay asset and turn range: to be selected. No synthetic match result is implied.
-->
