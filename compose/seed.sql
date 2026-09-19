-- Seed: the one game, its engine-digest placeholder and season 1. The baselines are compose/baselines.toml.
--
-- Applied by `soma bootstrap` (the soma-bootstrap service) on EVERY run, after the migrations -- not once per volume, as it
-- was under Postgres's init directory. Every statement below is guarded (ON CONFLICT DO NOTHING or
-- NOT EXISTS), so repeating it converges instead of failing, and a row deleted by hand comes back
-- on the next bring-up. Everything a competitor owns is written by Soma and Kalam; nothing
-- below is.

-- ---------------------------------------------------------------------- the game

-- A deliberately loud placeholder. Pair refuses to insert a match while it is NULL and Kalam
-- claims only rows matching it, so until a real engine exists this value's only job is to be
-- present and obviously wrong. `soma bootstrap` overwrites it with the engine its image carries.
INSERT INTO games (slug, name, active_engine_digest)
VALUES ('ants', 'Ants', 'sha256:0000000000000000000000000000000000000000000000000000000000000000')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------- season 1

-- Every version belongs to a season, so a game needs one before anything can be submitted. This
-- one opens now and takes submissions for a year, pinning the placeholder digest that `soma bootstrap`
-- overwrites on the first `up`. Later seasons are the admin's.
--
-- IT DECLARES NO RULES, and the empty document is the open contest: every block is optional and
-- absent means no limit. That is now true without exception -- `repo` was the one block whose
-- `enabled` defaulted true, and it went with the field it guarded.
--
-- AND IT HAS NO MAPS (N28): a season's boards are uploaded, never seeded, so nothing is paired here
-- until `scripts/dev/upload-maps.sh` -- or the admin page -- uploads some and enables them.
INSERT INTO seasons (game_id, number, name, slug, engine_digest, submissions_open_at, submissions_close_at)
SELECT g.id, 1, 'Season 1', 'season-1', g.active_engine_digest, now(), now() + interval '1 year'
  FROM games g
 WHERE g.slug = 'ants'
   AND NOT EXISTS (SELECT 1 FROM seasons s WHERE s.game_id = g.id);

-- ----------------------------------------------------------------- the baselines
--
-- Not here. They are compose/baselines.toml, a roster `soma bootstrap` applies after this file --
-- accounts, entries, live-season versions and their bytes in the models bucket -- so a deployment
-- names its own baselines in a config it hands the image, rather than in SQL only this stack runs.
