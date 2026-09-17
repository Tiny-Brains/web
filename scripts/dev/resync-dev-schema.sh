#!/usr/bin/env bash
# Rebuild a LOCAL DEVELOPMENT database against the current schema, keeping the accounts.
#
#   scripts/dev/resync-dev-schema.sh
#
# The schema is pre-release: 0001_init.sql is rewritten in place rather than extended. `soma-bootstrap`
# applies the migrations only when the database is EMPTY -- re-running `CREATE TYPE` over an
# existing schema is an error, not an upgrade -- so it refuses a rewrite instead of applying one,
# and this is the command it names. It drops the schema, lets bootstrap apply and seed it afresh,
# and puts `users` and `sessions` back, so your GitHub sign-in survives.
#
# It needs no checkout of soma: the migrations come from the Soma image, through the same
# `soma-bootstrap` step the stack uses. That is also why it needs no upkeep when 0001 changes again.
#
# DEVELOPMENT ONLY. It drops every table in the database.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB_CONTAINER="${DB_CONTAINER:-tinybrains-db-1}"
DB_USER="${DB_USER:-$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER)}"
DB_NAME="${DB_NAME:-$(docker exec "$DB_CONTAINER" printenv POSTGRES_DB)}"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="/tmp/tinybrains-resync-$STAMP.sql"

psql() { docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"; }

echo "==> checking this volume is safe to rebuild"
# Accounts and submissions can be recreated by signing in; a ladder cannot, and a volume holding
# one is not a scratch volume.
PLAYED=$(psql -tAc "
    SELECT coalesce((SELECT count(*) FROM ratings), 0)
         + coalesce((SELECT count(*) FROM matches), 0)" 2>/dev/null || echo 0)
if [ "${PLAYED:-0}" -gt 0 ]; then
    echo "REFUSING: this database holds $PLAYED match/rating rows." >&2
    echo "That is not a scratch volume. Back it up and drop the tables by hand if you meant it." >&2
    exit 1
fi

echo "==> saving accounts to $BACKUP"
# `games` is deliberately NOT carried across: the seed writes it with the engine-digest placeholder
# that pair refuses to insert without, and an older row would come back holding NULL.
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
    --data-only --table=users --table=sessions --no-owner --no-privileges > "$BACKUP"
psql -tAc "SELECT '    ' || count(*) || ' users, ' ||
                  (SELECT count(*) FROM sessions) || ' sessions' FROM users"

echo "==> dropping the schema"
psql -q -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE" -c "CREATE SCHEMA public"
# The recorded digest describes a schema that no longer exists. Clearing it is what makes the next
# bootstrap treat this as an empty database rather than one it has to judge.
psql -q -v ON_ERROR_STOP=1 -c "ALTER DATABASE \"$DB_NAME\" RESET tinybrains.schema_digest"

echo "==> applying the migrations and the seed"
# The stack's own step, so there is exactly one place that knows how a database is made.
docker compose run --rm --no-deps soma-bootstrap | sed 's/^/    /'

echo "==> restoring accounts"
# After the seed, so the baseline users are already in place.
psql -q -v ON_ERROR_STOP=1 < "$BACKUP"

psql -q <<'SQL'
\pset footer off
SELECT 'users' AS table, count(*) FROM users
UNION ALL SELECT 'sessions', count(*) FROM sessions
UNION ALL SELECT 'games', count(*) FROM games
UNION ALL SELECT 'models', count(*) FROM models
UNION ALL SELECT 'ratings', count(*) FROM ratings
UNION ALL SELECT 'clocks', count(*) FROM clocks;
SQL

echo "==> done. The dump is kept at $BACKUP in case something above went wrong."
echo "    soma-bootstrap declared the engine and registered the cartridge the Soma image carries."
echo "    The cron clocks will pick up the new tables on their next tick; no restart needed."
