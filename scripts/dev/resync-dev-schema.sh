#!/usr/bin/env bash
# Rebuild a LOCAL DEVELOPMENT database against the current schema, keeping the accounts.
#
#   scripts/dev/resync-dev-schema.sh
#
# The schema is pre-release: 0001_init.sql is rewritten in place rather than extended. `soma-bootstrap`
# applies the migrations only when the database is EMPTY -- re-running `CREATE TYPE` over an
# existing schema is an error, not an upgrade -- so it refuses a rewrite instead of applying one,
# and this is the command it names. It drops the schema, lets bootstrap apply it afresh, and puts
# the accounts back, so your sign-in survives. Everything an admin made -- seasons, their maps and
# baselines, runner keys -- goes with the schema and is made again on the admin pages.
#
# It needs no checkout of soma: the migrations come from the Soma image, through the same
# `soma-bootstrap` step the stack uses. That is also why it needs no upkeep when 0001 changes again.
#
# CARRYING ACCOUNTS ACROSS A REWRITE IS THE WHOLE DIFFICULTY, and a column-pinned dump cannot do it.
# `pg_dump --data-only` writes `COPY users (id, handle, github_id, ...)`, which is the OLD schema's
# column list, and restoring that into a schema that renamed, dropped or added a column fails on the
# column list rather than on any value -- so the script used to break on exactly the rewrites it
# exists for. It now keeps each table as one jsonb document per row, in a schema of its own that
# `DROP SCHEMA public CASCADE` does not reach (jsonb is a system type, so nothing in there depends
# on an enum or a domain that is about to go), and copies back only the columns BOTH schemas have.
# A dropped column is left behind; an added one takes its default. That is `soma/scripts/cutover/`'s
# own shape -- generic over the catalogue, never a hand-written column list -- scaled down to the
# three tables a developer actually wants back. The cutover script itself is not reusable here: it
# refuses any schema but the one production is on, and refuses to run twice.
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

echo "==> keeping a whole copy at $BACKUP, in case something below goes wrong"
# Belt and braces only: this dump is never restored by the script. It is the old schema's, so it
# restores only into the old schema -- which is the reason for everything below.
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges > "$BACKUP"

echo "==> setting the accounts aside"
# `games` is deliberately NOT carried across: bootstrap writes it with the engine digest its image
# carries, and an older row would come back holding another.
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS resync_keep CASCADE;
CREATE SCHEMA resync_keep;
DO $keep$
DECLARE t text;
BEGIN
  -- users first, then what hangs off it. A table the OLD schema does not have is kept empty, which
  -- is what makes the first resync onto a schema that ADDED one work.
  FOREACH t IN ARRAY ARRAY['users', 'identities', 'sessions'] LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      EXECUTE format('CREATE TABLE resync_keep.%I (d jsonb)', t);
    ELSE
      EXECUTE format('CREATE TABLE resync_keep.%I AS SELECT to_jsonb(r) AS d FROM public.%I r', t, t);
    END IF;
  END LOOP;
END
$keep$;
SQL
psql -tAc "SELECT '    ' || (SELECT count(*) FROM resync_keep.users)    || ' users, '
                          || (SELECT count(*) FROM resync_keep.identities) || ' identities, '
                          || (SELECT count(*) FROM resync_keep.sessions) || ' sessions'"

echo "==> dropping the schema"
psql -q -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE" -c "CREATE SCHEMA public"
# The recorded digest describes a schema that no longer exists. Clearing it is what makes the next
# bootstrap treat this as an empty database rather than one it has to judge.
psql -q -v ON_ERROR_STOP=1 -c "ALTER DATABASE \"$DB_NAME\" RESET tinybrains.schema_digest"

echo "==> applying the migrations"
# The stack's own step, so there is exactly one place that knows how a database is made.
docker compose run --rm --no-deps soma-bootstrap | sed 's/^/    /'

echo "==> restoring the accounts"
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $put$
DECLARE t text; cols text; kept text[]; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'identities', 'sessions'] LOOP
    -- What the OLD rows carry. Read off the documents rather than a catalogue that no longer
    -- exists: the old table went with the schema. An empty kept table has no keys, so nothing is
    -- restored for it and the loop moves on.
    EXECUTE format('SELECT coalesce(array_agg(DISTINCT key), ARRAY[]::text[])
                      FROM resync_keep.%I k, jsonb_object_keys(k.d) key', t) INTO kept;
    -- The columns BOTH schemas have. A column the new schema dropped is simply not named here, so
    -- its value is left behind; a column it added is not named either, so it takes its default.
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO cols
      FROM pg_attribute a
     WHERE a.attrelid = to_regclass(format('public.%I', t))
       AND a.attnum > 0 AND NOT a.attisdropped
       AND a.attname::text = ANY (kept);
    IF cols IS NULL THEN CONTINUE; END IF;
    -- jsonb_populate_record casts by name through each column's own input function, so an enum, a
    -- timestamptz and a uuid all come back typed without the script knowing any of them.
    EXECUTE format(
      'INSERT INTO public.%I (%s) SELECT %s FROM resync_keep.%I k, jsonb_populate_record(null::public.%I, k.d) r',
      t, cols, cols, t, t);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '    % rows into %', n, t;
  END LOOP;
END
$put$;
SQL

echo "==> deriving what the rewrite added"
psql -q -v ON_ERROR_STOP=1 <<'SQL'
-- THE ONE HAND MAPPING, the same one soma/scripts/cutover/transfer.sql makes: an account's GitHub
-- id was `users.github_id` and is now its `github` identity, keyed (provider, subject) with the
-- subject as text -- exactly what the sign-in upsert looks up, so the next GitHub sign-in finds
-- this row and the same user rather than making a new one. Without it the accounts come back and
-- signing in silently creates a second set. `login` is the cache of the provider's current
-- username, which the old handle WAS. Baselines have no GitHub id and get no identity, which
-- users_baseline_handle_reserved requires.
--
-- It runs only when the kept rows carried a github_id and no identities of their own, so a resync
-- on a database that is already past the rewrite does nothing here.
INSERT INTO public.identities (user_id, provider, subject, login, created_at)
SELECT (k.d ->> 'id')::uuid, 'github', k.d ->> 'github_id', k.d ->> 'handle',
       coalesce((k.d ->> 'created_at')::timestamptz, now())
  FROM resync_keep.users k
 WHERE k.d ? 'github_id' AND k.d ->> 'github_id' IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM resync_keep.identities)
ON CONFLICT DO NOTHING;
SQL

echo "==> checking the invariant no CHECK can hold"
# A human account is exactly one with an identity, and a baseline exactly one without. The schema
# says so in a comment because a CHECK cannot span two tables; if the carry-over broke it, say so
# now rather than at the next sign-in, which would quietly make a second account.
ORPHANS=$(psql -tAc "
    SELECT count(*) FROM users u
     WHERE u.role <> 'baseline'
       AND NOT EXISTS (SELECT 1 FROM identities i WHERE i.user_id = u.id)")
if [ "${ORPHANS:-0}" -gt 0 ]; then
    echo "WARNING: $ORPHANS account(s) came back with no identity, so signing in will make a NEW" >&2
    echo "         account for each rather than finding these. The whole copy is at $BACKUP." >&2
fi

psql -q <<'SQL'
\pset footer off
SELECT 'users' AS table, count(*) FROM users
UNION ALL SELECT 'identities', count(*) FROM identities
UNION ALL SELECT 'sessions', count(*) FROM sessions
UNION ALL SELECT 'games', count(*) FROM games
UNION ALL SELECT 'models', count(*) FROM models
UNION ALL SELECT 'ratings', count(*) FROM ratings
UNION ALL SELECT 'clocks', count(*) FROM clocks;
SQL

# Kept until the next run, so a resync that went wrong can still be read out of it by hand.
echo "==> done. The old rows are still in schema \`resync_keep\`, and the whole copy at $BACKUP."
echo "    soma-bootstrap declared the engine and registered the cartridge the Soma image carries."
echo "    The cron clocks will pick up the new tables on their next tick; no restart needed."
echo "    There is no season now: create one, with its boards and baselines, on the admin pages."
