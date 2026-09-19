#!/usr/bin/env bash
# Upload a folder of map files into a season on a local stack, and enable them.
#
#     scripts/dev/upload-maps.sh <dir> <season-slug> [handle]    # upload every *.json, then enable each
#     NO_ENABLE=1 scripts/dev/upload-maps.sh ../maps season-1     # upload only: they stay disabled
#
# WHY THIS EXISTS. A season's boards are in no repository and no release: they are made with
# `mapgen` outside every repository -- `tinybrains/maps/` for now -- and reach the platform only by an
# admin's upload, which in production is the season page. This is that upload for a local stack, so
# the ladder here plays the same boards without anyone committing them.
#
# IT GOES THROUGH THE REAL ROUTE, not straight into the table: `POST .../seasons/{slug}/maps` checks
# the header, the cartridge's limits.boards and the season's engine, and runs the engine's own
# worldgen on every board. A board the engine refuses is refused here exactly as it would be there,
# and `tinybrains maps check <file>` says why. Only the admin session is minted by hand -- the same
# HS256 cookie smoke.sh mints -- because a local stack has no browser to sign in with.
#
# Uploads land DISABLED, and an upload changes nothing about pairing until a map is enabled; this
# enables each one it uploaded unless NO_ENABLE=1. A board the season already has is reported and
# skipped: a map is never uploaded twice, it is enabled again.
set -euo pipefail

DIR="${1:?usage: $0 <dir> <season-slug> [handle]}"
SEASON="${2:?usage: $0 <dir> <season-slug> [handle]}"
HANDLE="${3:-${SMOKE_HANDLE:-codetiger}}"
BASE="${BASE:-http://127.0.0.1:8080}"
GAME="${GAME:-ants}"
ENV_FILE="${ENV_FILE:-$(cd "$(dirname "$0")/../.." && pwd)/.env}"
DB_CONTAINER="${DB_CONTAINER:-tinybrains-db-1}"
DB_USER="${DB_USER:-$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER)}"
psql() { docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_USER" -qtAX "$@"; }

[ -d "$DIR" ] || { echo "$DIR is not a directory" >&2; exit 2; }
SECRET=$(grep '^SOMA_SESSION_SECRET=' "$ENV_FILE" | cut -d= -f2-)
[ -n "$SECRET" ] || { echo "no SOMA_SESSION_SECRET in $ENV_FILE" >&2; exit 1; }
UID_=$(psql -c "SELECT id FROM users WHERE handle = '$HANDLE' AND role = 'admin';")
[ -n "$UID_" ] || { echo "$HANDLE is not an admin here -- scripts/dev/grant-admin.sh $HANDLE" >&2; exit 1; }
SID=$(psql -c "INSERT INTO sessions (sid, user_id, expires_at, user_agent)
               VALUES (gen_random_uuid(), '$UID_', now() + interval '10 minutes', 'upload-maps.sh') RETURNING sid;")
trap 'psql -c "UPDATE sessions SET revoked_at = now() WHERE sid = '"'"'$SID'"'"';" > /dev/null' EXIT
TOKEN=$(python3 - "$SECRET" "$UID_" "$SID" "$HANDLE" <<'PY'
import base64, hashlib, hmac, json, sys, time
secret, sub, sid, handle = sys.argv[1:5]
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b'=').decode()
h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(',', ':')).encode()); now = int(time.time())
p = b64(json.dumps({"sub": sub, "handle": handle, "sid": sid, "iss": "soma", "iat": now, "exp": now + 600},
                   separators=(',', ':')).encode())
print(f"{h}.{p}.{b64(hmac.new(secret.encode(), f'{h}.{p}'.encode(), hashlib.sha256).digest())}")
PY
)
C=(-H "Cookie: soma_session=$TOKEN" -H 'content-type: application/json')
URL="$BASE/v1/games/$GAME/seasons/$SEASON/maps"

echo "==> uploading $DIR into $GAME / $SEASON"
added=(); ok=0; skipped=0; refused=0
for f in "$DIR"/*.json; do
  [ -e "$f" ] || { echo "    no *.json in $DIR" >&2; exit 1; }
  out=$(curl -sS -w '\n%{http_code}' -X POST "${C[@]}" --data-binary @"$f" "$URL")
  code=${out##*$'\n'}; body=${out%$'\n'*}
  id=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("id",""))' "$f" 2>/dev/null || true)
  case "$code" in
    201) ok=$((ok + 1)); added+=("$id"); printf '    %-24s uploaded\n' "$id" ;;
    409) skipped=$((skipped + 1))
         printf '    %-24s %s\n' "$id" "$(printf '%s' "$body" | python3 -c 'import json,sys; b=json.load(sys.stdin); d=b.get("detail"); print(b.get("error"), json.dumps(d) if isinstance(d, dict) else "")')"
         # A board the season already has is enabled rather than uploaded again.
         case "$body" in *map_id_taken*|*map_duplicate*) added+=("$id") ;; esac ;;
    *)   refused=$((refused + 1)); printf '    %-24s %s %s\n' "$id" "$code" "$body" ;;
  esac
done

if [ "${NO_ENABLE:-0}" != "1" ]; then
  echo "==> enabling ${#added[@]} map(s)"
  for id in "${added[@]}"; do
    code=$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH "${C[@]}" -d '{"enabled": true}' "$URL/$id")
    [ "$code" = "200" ] || { printf '    %-24s enable answered %s\n' "$id" "$code"; refused=$((refused + 1)); }
  done
fi

echo "==> $ok uploaded, $skipped already there, $refused refused"
curl -sS "$URL" | python3 -c '
import json, sys
maps = json.load(sys.stdin).get("maps", [])
on = sum(1 for m in maps if m["enabled"])
print(f"    the season has {len(maps)} map(s), {on} enabled")'
[ "$refused" -eq 0 ]
