# Quickstart

Your first target is a version that completes a trial and enters the ladder. Start with a simple
model whose inputs and outputs you understand, then use match results to improve its decisions.

## What you need

You need a GitHub account, a way to train and export an ONNX model, and a manifest for Ants. You
sign in with GitHub, and the platform uses it for nothing else. Check the game's
[seasons](competing/seasons.md) before you prepare an entry: a submission has to arrive inside an
open window and meet that season's participation rules.

The `tinybrains` command-line tool plays matches, runs admission's checks, and exposes the real
cartridge as a [training environment](models/testing.md#train-against-the-real-engine), so your
training loop drives the same engine the ladder plays.
[Installing it](models/testing.md#the-tinybrains-cli) takes one `brew install` or a release
download. You do not need to run the platform to enter a hosted competition.

## The short way: start from a working entry

[**`Tiny-Brains/ants-starter`**](https://github.com/Tiny-Brains/ants-starter) is a trained **nano**
entry that admission accepts unchanged. It comes with its generated manifest, the `metrics.json`
and `card.md` the platform measures, two match files, and a CI workflow that re-checks it on every
push.

```sh
brew tap tiny-brains/cli https://github.com/Tiny-Brains/cli    # once
brew install tiny-brains/cli/tinybrains                         # once
git clone https://github.com/Tiny-Brains/ants-starter
cd ants-starter
tinybrains check model.onnx manifest.json      # what admission will say
tinybrains matches/self-play.json              # play it against itself, through the real engine
python train.py                                # retrain it: about an hour
```

Submit it as it is to watch the whole loop end to end, then change something and retrain. It was
trained with its own seed, so the ladder takes it as a new entry, and `models/` beside it holds
three trained opponents to play it against.

## The long way

### 1. Train something small

Read [Ants](games/ants.md), then decide how to represent the [observation](models/observation.md).
For example, a spatial model can take planes for your ants, visible enemies, food and known water,
and produce five move scores per ant or per board square.

Train on the information the arena supplies, and against the same engine if you can:
[`tinybrains env`](models/testing.md#train-against-the-real-engine) drives it from Python, so you
never write the rules a second time. Export to `model.onnx` with named tensor inputs and outputs for
your manifest to name. Check the [model requirements](models/format.md) and
[size classes](models/weight-classes.md) before you commit to an architecture; a graph that exports
can still fail admission.

### 2. Write the manifest

Create `manifest.json`. It declares each of your graph's inputs and outputs by name, dtype and
shape, and carries one **adapter** per input: a small program that turns the observation into that
tensor. A dimension may be a *name*, so one entry plays every board size.

**You do not write the output side.** The referee reads your policy head, in a channel order the
game publishes ([why](models/adapters.md#why-you-do-not-write-the-head)).
[The manifest](models/adapters.md) has a complete small example, and
[a real manifest, piece by piece](models/adapters/walkthrough.md) walks through one that plays.

Run the pair through [local checks](models/testing.md). Exercise every basic board (two seats to
eight, 24 to 124 a side), empty lists, large colonies and fragmented known-water masks. Check that
execution returns, and check the operation counts and the actions it produced as well.

### 3. Hash the two files — or let the site do it

Keep the exact names `model.onnx` and `manifest.json`: the platform mints the upload URLs for those
names. **If you submit through the site, skip this step**: `/submit` hashes both files in your
browser. To hash them yourself, compute SHA-256 over those exact bytes:

```sh
# Linux
sha256sum model.onnx manifest.json

# macOS
shasum -a 256 model.onnx manifest.json
```

Do not change the files after you hash them. The submission carries `sha256:` followed by each
file's 64 hexadecimal digits.

### 4. Create the model, then submit to it

Sign in with GitHub and **the site's `/submit` form does all of this for you**: pick the model,
pick the two files, press the button. The form hashes the files in your browser and uploads them
straight to the object store, so it does step 3 for you.

Through the API it takes two calls. A model is your entry: a name, and every version you enter under
it. Create it once:

```json
POST /v1/games/ants/models
{ "name": "First try" }
```

The response carries a `model_id`. Submit the version against it:

```json
POST /v1/submissions
{
  "game": "ants",
  "model": "<the model_id from above>",
  "weights_hash": "sha256:<64 hex digits for model.onnx>",
  "manifest_hash": "sha256:<64 hex digits for manifest.json>"
}
```

Replace the placeholder hashes with your own. Save the returned `version_id`. The platform assigns
the version number, and this first one is v1.

**The `201` response carries two one-shot upload URLs**, and nothing happens until you use them:

```sh
curl -T model.onnx    "$MODEL_URL"       # upload.model_onnx
curl -T manifest.json "$MANIFEST_URL"    # upload.manifest_json
```

The platform stores no bytes of its own and downloads nothing from you, so it rejects a version
whose bucket is empty with `ARTIFACT_MISSING`. It re-hashes what arrives and compares it with what
you declared. [Submitting](competing/submitting.md) covers session usage and error handling, and
[Models and versions](competing/models.md) explains the two separate calls.

### 5. Watch the trial

Watch it on the version's page, or read `GET /v1/versions/{version_id}`. The platform caches that
read for ten seconds, so poll no faster. Its `phase` tells waiting for verification apart from
waiting for a trial. A version that passes admission becomes `verified`, then `active` after a
successful trial. **You can lose the trial and still pass**, and a forfeit fails it. The trial
checks that your version can play, and it never changes ratings.

A rejection carries `reject_reason`. Fix the named issue, validate again, and submit the corrected
files as the next version. If the version is still waiting, check its phase and trial status before
you submit to the same model again: each model can have one candidate in flight. You can submit to
another of your models in the meantime.

## If you get stuck

Ask on [Discord](https://discord.gg/xr9Z2mSkxr), where competitors and the people who run the
platform talk. Bring the version's id and its `reject_reason`, or the match's id: those are what
anyone helping you will look up first. The source of every part is on
[GitHub](https://github.com/Tiny-Brains).

## Where to go next

[Matches](competing/matches.md), [replays](competing/replays.md) and [ranking](competing/ranking.md)
explain your first results. Improve one behavior at a time, and enter another version while the
submission window is open. A model's active version keeps competing while the platform tests its
replacement, and your other models keep playing the whole time.


> **Replay visualiser (planned):** one admitted entry's trial, marking its first food collection, a fight and the final result, with the candidate's view beside the full replay.

<!-- replay-visualiser: quickstart-first-trial
Use a recorded replay and its matching engine digest; select the relevant turns.
Provide a text caption and retain the explanation above as the accessible fallback.
Replay asset and turn range: to be selected. No synthetic match result is implied.
-->
