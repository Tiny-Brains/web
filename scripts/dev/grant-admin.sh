#!/bin/sh
# Grant (or revoke) the `admin` role on a local stack.
#
#     scripts/dev/grant-admin.sh <handle>            # promote
#     scripts/dev/grant-admin.sh --revoke <handle>   # demote back to competitor
#     scripts/dev/grant-admin.sh --list              # who holds it now
#
# WHAT THE ROLE DECIDES. Soma's admin-only routes (season create/close/update) read it off the
# caller's live session, and since the console was put behind a gate so does the Orion UI on 8081 --
# `soma-admin-check` answers 204 only for `role = 'admin'`. So this script is the whole access
# control list for both, which is why it prints what it changed rather than being quiet.
#
# THE USER MUST EXIST FIRST, and only signing in creates them: the row is written by the GitHub
# callback, so sign in once at APP_URL and then run this. There is deliberately no create-user path
# here -- a row with no github_id is a row nothing can ever sign in to.
#
# DEV ONLY. It talks straight to Postgres in the compose container and bypasses every route. A real
# deployment grants this through an admin route, an audit log, and someone accountable for it.
set -eu

DB_CONTAINER="${DB_CONTAINER:-tinybrains-db-1}"
DB_USER="${POSTGRES_USER:-soma}"
DB_NAME="${POSTGRES_DB:-soma}"

psql() { docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"; }

list() {
  echo "==> admins"
  psql -At -c "SELECT '    ' || handle || coalesce(' (' || display_name || ')', '') FROM users WHERE role = 'admin' ORDER BY handle" \
    | grep . || echo "    (none)"
}

case "${1:-}" in
  --list|-l) list; exit 0 ;;
  --revoke|-r) role=competitor; handle="${2:-}" ;;
  "" ) echo "usage: $0 [--revoke] <handle> | --list" >&2; exit 2 ;;
  -*) echo "unknown option: $1" >&2; exit 2 ;;
  *) role=admin; handle="$1" ;;
esac

[ -n "${handle:-}" ] || { echo "usage: $0 [--revoke] <handle> | --list" >&2; exit 2; }

# Compared with lower(), because that is what every other reader of `handle` does -- a
# case-sensitive lookup here and case-insensitive ones everywhere else protect different
# namespaces, which is how `Alice` and `alice` become two rows answering to one login.
current=$(psql -At -c "SELECT role FROM users WHERE lower(handle) = lower('$handle')")

if [ -z "$current" ]; then
  echo "no user '$handle'." >&2
  echo "  A row is created by signing in, not by this script. Sign in once at the site, then re-run." >&2
  echo >&2
  psql -c "SELECT handle, role FROM users WHERE role <> 'baseline' ORDER BY handle" >&2
  exit 1
fi

# `baseline` is the uploaded reference opponents and is not a person. Promoting one would hand the
# console to a row nobody can sign in to, and demoting one would break the checks that read it.
if [ "$current" = "baseline" ]; then
  echo "'$handle' is a baseline, not a person. Refusing." >&2
  exit 1
fi

if [ "$current" = "$role" ]; then
  echo "'$handle' is already $role. Nothing to do."
  list
  exit 0
fi

psql -q -c "UPDATE users SET role = '$role' WHERE lower(handle) = lower('$handle')"
echo "'$handle': $current -> $role"

# The gate caches a verdict for ten seconds per session, so say so rather than leaving someone
# refreshing and concluding it did not work.
if [ "$role" = admin ]; then
  echo "    They can open the console at http://localhost:8081 within ~10s."
  echo "    Use localhost, NOT 127.0.0.1 -- the session cookie is host-only."
else
  echo "    Their console access ends within ~10s."
fi
list
