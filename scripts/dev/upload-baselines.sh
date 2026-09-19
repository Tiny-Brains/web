#!/usr/bin/env bash
# Upload a folder of models into a season on a local stack as its baselines, wait for admission, and
# enable them.
#
#     scripts/dev/upload-baselines.sh <dir> <season-slug> [handle]    # every model under <dir>
#     scripts/dev/upload-baselines.sh ../ants-starter/models season-1  # the starter's three
#     NO_ENABLE=1 scripts/dev/upload-baselines.sh ../ants-starter/models season-1   # they stay off
#
# A model is a directory holding `model.onnx` and `manifest.json`, and its NAME is the directory's:
# `models/nano-bc/` is the baseline `nano-bc`, account `baseline.nano-bc`. <dir> may be one such
# directory or a folder of them.
#
# WHY THIS EXISTS (N29). No model ships with the platform: a season's baselines are uploaded into it
# by an admin, which in production is the season page, and a new season starts with none. This is
# that upload for a local stack, so the ladder here has opponents without anyone committing a model.
#
# IT GOES THROUGH THE REAL ROUTES, not straight into the tables: `POST .../seasons/{slug}/baselines`
# records the name and the two hashes and answers two presigned PUTs, the bytes go to the bucket the
# way a browser sends them, and the admit clock admits the version exactly as it admits a
# competitor's -- so a model this refuses is one the platform refuses. Only the admin session is
# minted by hand, the same HS256 cookie smoke.sh and upload-maps.sh mint.
#
# An admitted baseline lands DISABLED; this enables each one unless NO_ENABLE=1. A name the season
# already holds is reported and, once admitted, enabled rather than uploaded again.
set -euo pipefail

DIR="${1:?usage: $0 <dir> <season-slug> [handle]}"
SEASON="${2:?usage: $0 <dir> <season-slug> [handle]}"
HANDLE="${3:-${SMOKE_HANDLE:-codetiger}}"
BASE="${BASE:-http://127.0.0.1:8080}"
GAME="${GAME:-ants}"
WAIT_S="${WAIT_S:-300}"
ENV_FILE="${ENV_FILE:-$(cd "$(dirname "$0")/../.." && pwd)/.env}"
DB_CONTAINER="${DB_CONTAINER:-tinybrains-db-1}"
DB_USER="${DB_USER:-$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER)}"
psql() { docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_USER" -qtAX "$@"; }

[ -d "$DIR" ] || { echo "$DIR is not a directory" >&2; exit 2; }
if [ -f "$DIR/model.onnx" ]; then
  models=("${DIR%/}")
else
  models=()
  for d in "$DIR"/*/; do [ -f "$d/model.onnx" ] && [ -f "$d/manifest.json" ] && models+=("${d%/}"); done
fi
[ "${#models[@]}" -gt 0 ] || { echo "no model.onnx + manifest.json under $DIR" >&2; exit 2; }

SECRET=$(grep '^SOMA_SESSION_SECRET=' "$ENV_FILE" | cut -d= -f2-)
[ -n "$SECRET" ] || { echo "no SOMA_SESSION_SECRET in $ENV_FILE" >&2; exit 1; }
UID_=$(psql -c "SELECT id FROM users WHERE handle = '$HANDLE' AND role = 'admin';")
[ -n "$UID_" ] || { echo "$HANDLE is not an admin here -- scripts/dev/grant-admin.sh $HANDLE" >&2; exit 1; }
SID=$(psql -c "INSERT INTO sessions (sid, user_id, expires_at, user_agent)
               VALUES (gen_random_uuid(), '$UID_', now() + interval '30 minutes', 'upload-baselines.sh') RETURNING sid;")
trap 'psql -c "UPDATE sessions SET revoked_at = now() WHERE sid = '"'"'$SID'"'"';" > /dev/null' EXIT
TOKEN=$(python3 - "$SECRET" "$UID_" "$SID" "$HANDLE" <<'PY'
import base64, hashlib, hmac, json, sys, time
secret, sub, sid, handle = sys.argv[1:5]
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b'=').decode()
h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(',', ':')).encode()); now = int(time.time())
p = b64(json.dumps({"sub": sub, "handle": handle, "sid": sid, "iss": "soma", "iat": now, "exp": now + 1800},
                   separators=(',', ':')).encode())
print(f"{h}.{p}.{b64(hmac.new(secret.encode(), f'{h}.{p}'.encode(), hashlib.sha256).digest())}")
PY
)
C=(-H "Cookie: soma_session=$TOKEN" -H 'content-type: application/json')
URL="$BASE/v1/games/$GAME/seasons/$SEASON/baselines"
sha() { printf 'sha256:%s' "$(shasum -a 256 "$1" | cut -d' ' -f1)"; }
field() { python3 -c 'import json,sys; b=json.load(sys.stdin); ks=sys.argv[1].split(".")
for k in ks: b=(b or {}).get(k) if isinstance(b, dict) else None
print("" if b is None else b)' "$1"; }

echo "==> uploading ${#models[@]} baseline(s) into $GAME / $SEASON"
names=(); refused=0
for m in "${models[@]}"; do
  name=$(basename "$m")
  body=$(python3 -c 'import json,sys; print(json.dumps({"name": sys.argv[1], "weights_hash": sys.argv[2], "manifest_hash": sys.argv[3]}))' \
           "$name" "$(sha "$m/model.onnx")" "$(sha "$m/manifest.json")")
  out=$(curl -sS -w '\n%{http_code}' -X POST "${C[@]}" -d "$body" "$URL")
  code=${out##*$'\n'}; resp=${out%$'\n'*}
  case "$code" in
    201|200)
      # The presigned URLs are signed for the PUBLIC endpoint, which is the one this host reaches.
      for f in model.onnx manifest.json; do
        key=$([ "$f" = model.onnx ] && echo upload.model_onnx || echo upload.manifest_json)
        put=$(printf '%s' "$resp" | field "$key")
        pc=$(curl -sS -o /dev/null -w '%{http_code}' -X PUT --data-binary @"$m/$f" "$put")
        [ "$pc" = "200" ] || { printf '    %-24s PUT %s answered %s\n' "$name" "$f" "$pc"; refused=$((refused + 1)); continue 2; }
      done
      names+=("$(printf '%s' "$resp" | field slug)")
      printf '    %-24s uploaded (%s)\n' "$name" "$([ "$code" = 201 ] && echo new || echo fresh URLs)" ;;
    409)
      err=$(printf '%s' "$resp" | field error)
      printf '    %-24s %s (%s)\n' "$name" "$err" "$(printf '%s' "$resp" | field detail.status)"
      [ "$err" = "baseline_name_taken" ] && names+=("$(printf '%s' "$resp" | field detail.slug)") ;;
    *) refused=$((refused + 1)); printf '    %-24s %s %s\n' "$name" "$code" "$resp" ;;
  esac
done

# Admission is the admit clock's, on its own schedule: wait until none of ours is still `testing`.
list() { curl -sS "${C[@]}" "$URL"; }
[ "${#names[@]}" -gt 0 ] || { echo "==> nothing to admit or enable" >&2; exit 1; }
echo "==> waiting for admission (at most ${WAIT_S}s)"
deadline=$((SECONDS + WAIT_S))
while :; do
  pending=$(list | python3 -c '
import json, sys
want = set(sys.argv[1:])
rows = [b for b in json.load(sys.stdin).get("baselines", []) if b["slug"] in want and b["status"] != "rejected"]
print(sum(1 for b in rows if b["status"] == "testing"))' "${names[@]}")
  [ "$pending" = "0" ] && break
  [ "$SECONDS" -lt "$deadline" ] || { echo "    $pending still being admitted after ${WAIT_S}s -- see the admit clock's rows" >&2; break; }
  sleep 3
done

if [ "${NO_ENABLE:-0}" != "1" ]; then
  echo "==> enabling"
  for slug in "${names[@]}"; do
    out=$(curl -sS -w '\n%{http_code}' -X PATCH "${C[@]}" -d '{"enabled": true}' "$URL/$slug")
    code=${out##*$'\n'}; resp=${out%$'\n'*}
    if [ "$code" = "200" ]; then
      printf '    %-24s %s\n' "$slug" "$(printf '%s' "$resp" | field status)"
    else
      printf '    %-24s %s %s\n' "$slug" "$code" "$resp"; refused=$((refused + 1))
    fi
  done
fi

python3 - "$(list)" <<'PY'
import json, sys
rows = json.loads(sys.argv[1]).get("baselines", [])
for b in rows:
    why = "  " + b["reject_reason"] if b["reject_reason"] else ""
    print(f"    {b['slug']:<24} v{b['version']}  {b['status']:<9} {b['class'] or '-':<6}{why}")
on = sum(1 for b in rows if b["enabled"])
print(f"==> the season has {len(rows)} baseline upload(s), {on} in play")
PY
[ "$refused" -eq 0 ]
