#!/bin/sh
# Mint a runner key on a local stack, so a match runner can be started without going through the
# admin UI.
#
#     scripts/dev/runner-key.sh <handle> [label]     # mint, and print the key ONCE
#     scripts/dev/runner-key.sh --list               # the keys that exist, by prefix
#     scripts/dev/runner-key.sh --revoke <prefix>    # retire one
#
# WHAT THE KEY IS FOR. `POST /v1/runner/token` exchanges it for a ten-minute `aud: runner` JWT, and
# that token is what every /v1/runner/* call carries. So this key is the whole of what a machine
# needs to play matches: no database URL, no bucket credential, no admin token.
#
# THE KEY IS PRINTED ONCE AND CANNOT BE READ BACK. `runner_keys` stores sha256 of it plus an 8-hex
# display prefix, so losing it means minting another -- which is free, because the table holds as
# many as you like and `--revoke` retires one without a gap. That is the same contract the real
# route has; this script is not a weaker path to the same row.
#
# THE OWNER MUST BE AN ADMIN, and must stay one: every runner statement joins `live_runners`, which
# joins through to `users.role = 'admin'`. Demote the owner and the machine's next call fails --
# which is the design, not a bug to work around here.
#
# DEV ONLY. It talks straight to Postgres in the compose container and bypasses the route that
# would otherwise check the caller's session. A real deployment mints these from the admin UI.
set -eu

DB_CONTAINER="${DB_CONTAINER:-tinybrains-db-1}"
DB_USER="${POSTGRES_USER:-soma}"
DB_NAME="${POSTGRES_DB:-soma}"

psql() { docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"; }

list() {
  echo "==> runner keys"
  psql -At -c "
    SELECT '    ' || k.key_prefix || '  ' || u.handle || '  ' || k.label
        || coalesce('  last used ' || to_char(k.last_used_at, 'YYYY-MM-DD HH24:MI'), '  never used')
        || CASE WHEN k.revoked_at IS NOT NULL THEN '  [REVOKED]' ELSE '' END
      FROM runner_keys k JOIN users u ON u.id = k.user_id
     ORDER BY k.created_at" | grep . || echo "    (none)"
  echo "==> runners that have registered on them"
  psql -At -c "
    SELECT '    ' || k.key_prefix || '  ' || r.label || '  ' || coalesce(r.arch, '?')
        || '  seen ' || to_char(r.last_seen_at, 'YYYY-MM-DD HH24:MI')
        || '  ' || coalesce(left(r.engine_digest, 19) || '...', 'no engine reported')
      FROM runners r JOIN runner_keys k ON k.id = r.key_id
     ORDER BY r.last_seen_at DESC" | grep . || echo "    (none)"
}

case "${1:-}" in
  --list|-l)   list; exit 0 ;;
  --revoke|-r)
    prefix="${2:-}"
    [ -n "$prefix" ] || { echo "usage: $0 --revoke <prefix>" >&2; exit 2; }
    n=$(psql -At -c "UPDATE runner_keys SET revoked_at = now() WHERE key_prefix = '$prefix' AND revoked_at IS NULL RETURNING 1" | grep -c . || true)
    [ "$n" -gt 0 ] || { echo "no live key with prefix $prefix" >&2; exit 1; }
    echo "==> revoked $prefix -- every runner on it fails its next call, not its next token"
    exit 0 ;;
  "")   echo "usage: $0 <handle> [label] | --list | --revoke <prefix>" >&2; exit 2 ;;
  -*)   echo "unknown option: $1" >&2; exit 2 ;;
esac

handle="$1"
label="${2:-dev}"

# The owner, and it must already be an admin -- scripts/dev/grant-admin.sh is how one is made.
# Checked before minting so a refusal costs nothing and names the reason.
owner=$(psql -At -c "SELECT id FROM users WHERE lower(handle) = lower('$handle') AND role = 'admin'")
[ -n "$owner" ] || {
  echo "no admin user with handle '$handle'" >&2
  echo "  sign in once at APP_URL, then: scripts/dev/grant-admin.sh $handle" >&2
  exit 1
}

# EXACTLY THE SHAPE soma-runner-keys-create MINTS: `tbr_` + 8 hex + `_` + 32 random bytes as
# base64url. The prefix identifies the key in a list and unlocks nothing; the material after it is
# 256 bits. If this shape ever drifts from the workflow's, the key still works -- the digest is
# what is matched -- but a key minted here stops being recognisable beside one minted there.
prefix="tbr_$(openssl rand -hex 4)"
material=$(openssl rand 32 | base64 | tr '+/' '-_' | tr -d '=\n')
key="${prefix}_${material}"

# sha256 of the whole key string, hex, which is what the token exchange probes by. Not a salted
# hash: the exchange has to FIND the row from the key alone, and that wants one indexed lookup.
key_hash=$(printf '%s' "$key" | openssl dgst -sha256 -hex | sed 's/^.*= *//')

psql -q -c "INSERT INTO runner_keys (user_id, label, key_hash, key_prefix)
            VALUES ('$owner', '$label', '$key_hash', '$prefix')"

echo "==> minted for $handle, label '$label'"
echo
echo "    $key"
echo
echo "    This is the only time it is shown. Start a runner with it:"
echo "      put it in kalam's .env as RUNNER_KEY, then from that checkout: docker compose up -d"
