#!/usr/bin/env bash
# Point the seeded baselines at the trained artifacts, and put the bytes in the store.
#
#   scripts/dev/seed-baselines.sh [path-to-baselines]     # default ../ants/baselines
#
# compose/seed.sql creates one baseline per artifact naming PLACEHOLDER hashes, because a
# volume initialises long before any model exists. A node re-hashes what it fetches and refuses a
# mismatch, so until this runs, every match seating a baseline is released by the barrier -- the
# roster clock has nothing it can register.
#
# WHAT CHANGED, 10 SEPTEMBER 2026. This used to dump test fixtures: ONNX graphs with random weights,
# which hold every ant on every turn, so every trial ended `idle_food` and beating one proved that an
# entry emitted valid actions and nothing else. It now reads TRAINED artifacts from the baselines,
# each carrying the `metrics.json` that admission would otherwise have produced -- so a seeded
# baseline is indistinguishable from an admitted version, which is the point.
#
# The baselines were `Tiny-Brains/ants-baselines` until 16 September 2026 and are `ants/baselines/`
# now (decision N20), so the default is inside the cartridge's checkout rather than beside it.
#
# AND AGAIN, 14 SEPTEMBER 2026. The object keys are no longer content-addressed: a version's bytes
# live at `models/<version_id>/model.onnx`, which `model_versions.artifact_key` GENERATES, so the
# row has to exist before the upload can be addressed. The order below is therefore rows first,
# objects second -- the reverse of what it was.
#
# Delete this script the day admission can do it: these are ordinary submissions, and the only
# reason they are seeded rather than submitted is that a baseline has no trial opponent until a
# baseline exists.
set -euo pipefail
cd "$(dirname "$0")/../.."

SRC="${1:-../ants/baselines}"
[ -d "$SRC/models" ] || {
  echo "no $SRC/models -- clone Tiny-Brains/ants beside this repository, or pass the baselines' path" >&2
  echo "  its README has the two commands that build the artifacts" >&2
  exit 1
}

# The rating prior, read from the template `check/configs.sh` treats as the source of truth rather
# than typed here. Two priors on one ladder is a real failure -- a baseline's first fold reads
# [vars] while its seed row read something else -- and a third copy is a third thing to keep in step.
# The rating prior is Soma's, and it lives in Soma's instance config.
SOMA_TMPL="${SOMA_DIR:-../soma}/docker/soma.toml.tmpl"
PRIOR_MU=$(awk -F= '/^prior_mu[[:space:]]*=/{gsub(/ /,"",$2);print $2}' "$SOMA_TMPL")
PRIOR_SIGMA=$(awk -F= '/^prior_sigma[[:space:]]*=/{gsub(/ /,"",$2);print $2}' "$SOMA_TMPL")
[ -n "$PRIOR_MU" ] && [ -n "$PRIOR_SIGMA" ] || { echo "no prior_mu/prior_sigma in $SOMA_TMPL" >&2; exit 1; }

DB_CONTAINER="${DB_CONTAINER:-tinybrains-db-1}"
DB_USER="${DB_USER:-$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER)}"
DB_NAME="${DB_NAME:-$(docker exec "$DB_CONTAINER" printenv POSTGRES_DB)}"

# A signed PUT to the one bucket admission and every replica share. Signed by curl rather than by
# anything of ours: a seeder that depends on the code under test cannot tell you the store is
# wrong.
S3_ENDPOINT="${R2_ENDPOINT:-http://127.0.0.1:9000}"
S3_BUCKET="${MODELS_BUCKET:-tinybrains-models}"
S3_REGION="${R2_REGION:-us-east-1}"
S3_KEY="${R2_ACCESS_KEY:-tinybrains}"
S3_SECRET="${R2_SECRET_KEY:-tinybrains-dev-secret}"

put() {   # put <file> <key>   -- the key `artifact_key` generates, which needs the row's id
  local file="$1" key="$2"
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --aws-sigv4 "aws:amz:$S3_REGION:s3" \
      --user "$S3_KEY:$S3_SECRET" -X PUT --data-binary "@$file" "$S3_ENDPOINT/$S3_BUCKET/$key")
  case "$code" in
    200) echo "    $key" ;;
    *) echo "PUT $key answered HTTP $code -- is the bucket there? \`docker compose run --rm buckets\`" >&2; exit 1 ;;
  esac
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
: > "$TMP/rows.json"

echo "==> reading $SRC/models"
found=0
for dir in "$SRC"/models/*/; do
  name=$(basename "$dir")
  [ -f "$dir/metrics.json" ] || { echo "    $name has no metrics.json -- run its export" >&2; continue; }
  for f in model.onnx manifest.json; do
    [ -f "$dir/$f" ] || { echo "    $name has no $f" >&2; exit 1; }
  done

  wh=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['weights_hash'])" "$dir/metrics.json")
  ah=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['manifest_hash'])" "$dir/metrics.json")

  # The hashes in metrics.json came from `tinybrains check`, which hashed these exact files. Verify
  # rather than trust: a stale metrics.json beside a rebuilt model is the one way this goes wrong,
  # and it would seed a row naming bytes the store does not hold.
  for pair in "model.onnx:$wh" "manifest.json:$ah"; do
    f=${pair%%:*}; want=${pair#*:}
    got="sha256:$(shasum -a 256 "$dir/$f" | cut -d' ' -f1)"
    [ "$got" = "$want" ] || {
      echo "    $name/$f hashes to $got but metrics.json says $want -- re-run the export" >&2
      exit 1
    }
  done

  echo "  $name"

  python3 - "$dir" "$name" >> "$TMP/rows.json" <<'PY'
import json, sys, pathlib
d, name = pathlib.Path(sys.argv[1]), sys.argv[2]
m = json.load(open(d / "metrics.json"))
print(json.dumps({
    "handle": f"baseline.{name}",
    "weight_class": m["class"],
    "weights_hash": m["weights_hash"],
    "manifest_hash": m["manifest_hash"],
    "manifest": (d / "manifest.json").read_text(),
    "size_bytes": m["size_metric_bytes"],
    "param_count": m["params"],
    "infer_us": m["infer_us_max"],
    "orion_version": m.get("orion_version", "1.8.1"),
    "dir": str(d),
}))
PY
  found=$((found + 1))
done
[ "$found" -gt 0 ] || { echo "no exported models in $SRC/models" >&2; exit 1; }

echo "==> pointing the baselines at them"
# One statement over a jsonb array rather than a loop of UPDATEs: every baseline moves together or
# none does, which matters because pair may be inserting trials against them while this runs.
python3 -c "import json,sys;print(json.dumps([json.loads(l) for l in sys.stdin if l.strip()]))" \
  < "$TMP/rows.json" > "$TMP/rows-array.json"

psql_seed() {
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"
}

psql_seed -v rows="$(cat "$TMP/rows-array.json")" -v mu="$PRIOR_MU" -v sigma="$PRIOR_SIGMA" <<'SQL'
BEGIN;

CREATE TEMP TABLE seeding ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset((:'rows')::jsonb)
     AS r (handle text, weight_class text, weights_hash text, manifest_hash text, manifest text,
           size_bytes bigint, param_count bigint, infer_us bigint, orion_version text, dir text);

-- A baseline is a competitor: a user, so it can be told apart on a leaderboard that shows an entry
-- as its owner's handle. github_id stays null; they never sign in, and the handle lives under the
-- reserved `baseline.` prefix -- a dot, which a GitHub login cannot contain -- so a real account
-- can never be locked out of sign-in by colliding with one. The conflict target is the expression
-- users_handle_uniq was declared with, not the column.
INSERT INTO users (handle, role)
SELECT handle, 'baseline' FROM seeding
ON CONFLICT (lower(handle)) DO NOTHING;

-- THE CLASS IS CHECKED, NOT SET. `ratings` and `rating_events` are keyed by ladder, and a ladder
-- IS a weight class, so moving a baseline between classes here would strand every rating row it
-- already has and leave it rated on a ladder it no longer plays. seed.sql fixes the class from
-- the handle; if an artifact has been retrained into a different class it needs a new handle, which
-- is the same rule a competitor lives under.
DO $$
DECLARE bad text;
BEGIN
    SELECT string_agg(format('%s is seeded as %s but its artifact measures %s',
                             s.handle, m.weight_class, s.weight_class), E'\n  ')
      INTO bad
      FROM seeding s
      JOIN users u ON u.handle = s.handle
      JOIN models e ON e.owner_id = u.id
      JOIN model_versions m ON m.model_id = e.id
     WHERE m.weight_class IS DISTINCT FROM s.weight_class::ladder;
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION E'a baseline changed weight class:\n  %\n\nRatings are keyed by ladder, so this needs a new handle rather than an update.', bad;
    END IF;
END $$;

-- A baseline this database has never seen: a version, its two ratings and their origin events, in
-- exactly the shape compose/seed.sql writes on every bring-up. Without this an existing
-- stack could only ever have the baselines its volume was initialised with, and adding one would
-- mean `docker compose down -v` -- which throws away every session and every match played.
WITH missing AS (
    SELECT s.*, u.id AS owner_id, g.id AS game_id, se.id AS season_id
      FROM seeding s
      JOIN users u ON u.handle = s.handle
      CROSS JOIN games g
      JOIN seasons se ON se.game_id = g.id AND se.closed_at IS NULL
     WHERE g.slug = 'ants'
       AND NOT EXISTS (SELECT 1 FROM models e WHERE e.owner_id = u.id AND e.game_id = g.id)
), entry AS (
    -- The ENTRY first: a baseline is a model with a name, exactly as a competitor's is. The
    -- three used to share one repository, legal only because models_repo_uniq was partial on
    -- owner_github_id; with no repository they are simply three named entries.
    INSERT INTO models (owner_id, game_id, name)
    SELECT owner_id, game_id, substring(handle from 'baseline\.(.*)')
      FROM missing
    RETURNING id, owner_id, game_id
), made AS (
    INSERT INTO model_versions (model_id, game_id, season_id, version,
                                status, weight_class, size_bytes, param_count, infer_us,
                                weights_hash, manifest_hash, manifest, orion_version)
    SELECT entry.id, entry.game_id, missing.season_id, 1,
           'active', missing.weight_class::ladder, missing.size_bytes, missing.param_count,
           missing.infer_us, missing.weights_hash, missing.manifest_hash, missing.manifest,
           missing.orion_version
      FROM entry JOIN missing ON missing.owner_id = entry.owner_id
    RETURNING id, weight_class
), rated AS (
    -- Two ladders each -- the class and open -- at the prior, so a baseline starts in placement like
    -- any version (decision 28) rather than being an unrated void the fold silently drops.
    INSERT INTO ratings (version_id, ladder, mu, sigma)
    SELECT made.id, l.ladder, (:'mu')::float8, (:'sigma')::float8
      FROM made CROSS JOIN LATERAL (VALUES (made.weight_class), ('open'::ladder)) AS l (ladder)
    ON CONFLICT (version_id, ladder) DO NOTHING
    RETURNING version_id, ladder, mu, sigma
)
-- seq 0, exactly as promotion writes one: no match and no `before`, as rating_events_seed_shape
-- requires. Without it the first fold starts a chain with no origin.
INSERT INTO rating_events (version_id, ladder, seq, mu_after, sigma_after)
SELECT version_id, ladder, 0, mu, sigma FROM rated
ON CONFLICT (version_id, ladder, seq) DO NOTHING;

-- Scoped through the ENTRY and to the versions of THIS handle's model. Scoped by owner alone --
-- as it was when a competitor could hold only one model -- this would overwrite every version of
-- every model that owner has, which for a baseline is now three rows and not one.
UPDATE model_versions m
   SET weights_hash = s.weights_hash,
       manifest_hash = s.manifest_hash,
       manifest      = s.manifest,
       size_bytes    = s.size_bytes,
       param_count   = s.param_count,
       infer_us      = s.infer_us,
       orion_version = s.orion_version
  FROM seeding s, users u, models e
 WHERE u.handle = s.handle AND e.owner_id = u.id AND m.model_id = e.id;

-- Any other model still carrying a hash no node can verify: the hand-made candidates inserted to
-- drive the clocks before anything could play. They get the smallest baseline, which is the cheapest.
-- Qualified on both sides: `seeding` has a `weights_hash` too, and an UPDATE ... FROM makes the
-- bare name ambiguous rather than defaulting to the target.
UPDATE model_versions m SET weights_hash = s.weights_hash, manifest_hash = s.manifest_hash,
       manifest = s.manifest
  FROM (SELECT * FROM seeding ORDER BY size_bytes LIMIT 1) s
 WHERE m.status IN ('testing', 'verified', 'active', 'superseded')
   AND m.weights_hash !~ '^sha256:[0-9a-f]{64}$';

-- Re-point pending rows only: anything already played keeps what it played, which is the record.
UPDATE match_seats s SET weights_hash = v.weights_hash, manifest_hash = v.manifest_hash
  FROM model_versions v, matches mt
 WHERE s.version_id = v.id AND mt.id = s.match_id AND mt.status = 'pending'
   AND (s.weights_hash IS DISTINCT FROM v.weights_hash
     OR s.manifest_hash IS DISTINCT FROM v.manifest_hash);

-- Last, and inside the same transaction: the roster the pair clock reads has changed, and it must
-- not see the new epoch before it can see the rows the epoch is about.
UPDATE clocks SET epoch = epoch + 1, updated_at = now() WHERE key = 'roster';

COMMIT;

SELECT u.handle, e.name AS model, v.weight_class, v.size_bytes, v.param_count, v.infer_us,
       left(v.weights_hash, 18) AS weights
  FROM model_versions v JOIN models e ON e.id = v.model_id JOIN users u ON u.id = e.owner_id
 WHERE u.role = 'baseline' ORDER BY v.size_bytes;
SQL

# ---------------------------------------------------------------------------- the objects
#
# AFTER the rows, because the key is the row's: `artifact_key` is GENERATED from the version id, so
# there is no key to upload to until the version exists. Every node fetches from exactly these two
# keys and re-hashes what it gets, so a mismatch here is caught there rather than played.
echo "==> uploading to the models bucket"
while read -r line; do
  [ -n "$line" ] || continue
  handle=$(printf '%s' "$line" | python3 -c "import json,sys;print(json.load(sys.stdin)['handle'])")
  dir=$(printf '%s' "$line" | python3 -c "import json,sys;print(json.load(sys.stdin)['dir'])")
  # `</dev/null` is load-bearing: `docker exec -i` reads stdin, which here is the loop's own input,
  # so without it the first iteration swallows the remaining rows and exactly one baseline uploads.
  key=$(psql_seed -At -c "SELECT v.artifact_key FROM model_versions v
                            JOIN models e ON e.id = v.model_id
                            JOIN users u ON u.id = e.owner_id
                           WHERE u.handle = '$handle' ORDER BY v.version DESC LIMIT 1" </dev/null)
  [ -n "$key" ] || { echo "no version row for $handle" >&2; exit 1; }
  put "$dir/model.onnx" "$key"
  put "$dir/manifest.json" "${key%model.onnx}manifest.json"
done < "$TMP/rows.json"
