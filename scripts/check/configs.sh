#!/usr/bin/env bash
# Assert what the config split put in two places.
#
#   scripts/check/configs.sh
#
# Soma's instance template, the runner's, and the values derived across the boundary between them,
# the migrations, kalam's generator and the images. Each fails SILENTLY when it disagrees: a runner
# that claims nothing, a model given less time than it is scored against, a season whose matches
# cannot finish, a class nothing can be admitted into.
#
# It also parses the templates through orion-server, so a config that would refuse to boot fails
# here instead of at 3am. That half needs the Soma image; without docker it is skipped and said so.
#
# The images are the ones the stacks run: SOMA_IMAGE / KALAM_IMAGE / WEB_IMAGE from the environment,
# else from web's and kalam's .env (what compose reads), else the published :latest (web: its build).
#
# Exit 0 means the templates are consistent and parse.
set -uo pipefail
cd "$(dirname "$0")/../.."

# It lives in web because web's compose file is where Soma, a runner and the stack's own numbers meet.
# The templates live with the images that bake them: Soma's in soma, the runner's in kalam.
# Sibling checkouts by default.
SOMA_DIR="${SOMA_DIR:-../soma}"
KALAM_DIR="${KALAM_DIR:-../kalam}"
WEB_DIR="${WEB_DIR:-.}"
# THE COMPOSE FILES LEFT THE REPOS. They are deployment, and they live in tinybrains/devops/
# with the environments they belong to; this still reads them, because the pairs it checks
# (RUNNER_BLOB_ENDPOINT above all) have one half in a compose file and the other in a package.
# A missing devops/ is not a pass: the reads below are guarded and say so.
DEVOPS_DIR="${DEVOPS_DIR:-../devops}"
COMPOSE_DIR="$DEVOPS_DIR/compose"
# The DEV environment's settings, which name the images this checkout is checked against.
DEV_ENV="$DEVOPS_DIR/dev"
[ -d "$COMPOSE_DIR" ] || echo "    NOTE: no $COMPOSE_DIR -- the compose-file checks below cannot run" >&2
SOMA="$SOMA_DIR/docker/soma.toml.tmpl"
# THE RUNNER'S TEMPLATE, and the one nobody is watching: it runs on a machine outside the deployment,
# where a disagreement is not a `docker compose logs` away. Every assertion below that names it is
# there because getting it wrong is silent on that machine and visible only as a runner that plays
# nothing, or plays under the wrong numbers.
RUNNER="$KALAM_DIR/docker/runner.toml.tmpl"
fail=0

# THE IMAGES THE STACKS RUN, not whichever `:latest` happens to be pulled: checking a stale published
# image against a local build reports a disagreement that is not there. Each compose file reads its
# image from its own .env, so do the same.
envfile() {  # $1 file, $2 key -- the last value set, unquoted, or nothing
  [ -r "$1" ] || return 0
  sed -n "s/^[[:space:]]*$2=\(.*\)$/\1/p" "$1" | tail -1 | sed "s/^[\"']//; s/[\"']$//"
}
KALAM_IMAGE="${KALAM_IMAGE:-$(envfile "$DEV_ENV/kalam/.env" KALAM_IMAGE)}"
KALAM_IMAGE="${KALAM_IMAGE:-ghcr.io/tiny-brains/kalam:latest}"
SOMA_IMAGE="${SOMA_IMAGE:-$(envfile "$DEV_ENV/web/.env" SOMA_IMAGE)}"
SOMA_IMAGE="${SOMA_IMAGE:-ghcr.io/tiny-brains/soma:latest}"
# web's compose default: the checkout, built. A published tag here is the image the stack serves.
WEB_IMAGE="${WEB_IMAGE:-$(envfile "$DEV_ENV/web/.env" WEB_IMAGE)}"
WEB_IMAGE="${WEB_IMAGE:-tinybrains/web:dev}"

ok()   { printf '  ok    %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1" >&2; fail=1; }
skip() { printf '  skip  %s\n' "$1"; }
# A deployment property this repository cannot decide, but can refuse to let pass silently.
note() { printf '  note  %s\n' "$1"; }

for f in "$SOMA" "$RUNNER"; do
  [ -r "$f" ] || { echo "missing $f" >&2; exit 1; }
done

# A [vars] scalar, as written. Not a TOML parse: these are templates with ${NAME:-default} in them,
# which no TOML reader accepts until orion-server has expanded them.
var() {  # $1 file, $2 key
  sed -n "s/^[[:space:]]*$2[[:space:]]*=[[:space:]]*\(.*\)$/\1/p" "$1" \
    | head -1 | sed 's/[[:space:]]*#.*$//' | sed 's/[[:space:]]*$//'
}

# The same key under one [section] only: `ops_budget` is typed under [vars] and [engine] of the
# runner's template on purpose (a var cannot read [engine]), and `var` would answer the first.
section_var() {  # $1 file, $2 section, $3 key
  awk -v s="[$2]" -v k="$3" '
    /^[[:space:]]*\[/ { insec = ($0 ~ ("^[[:space:]]*" s_re "[[:space:]]*$")) }
    insec && $0 ~ ("^[[:space:]]*" k "[[:space:]]*=") { sub(/^[^=]*=[[:space:]]*/, ""); sub(/[[:space:]]*#.*$/, ""); sub(/[[:space:]]*$/, ""); print; exit }
    BEGIN { s_re = s; gsub(/[][]/, "\\\\&", s_re) }
  ' "$1"
}

# `${NAME:-123}` -> `123`. A template default IS the value for anything that reads these files
# without orion-server, and two of them are capacity numbers entrypoint.sh derives at boot: what is
# committed here is what a node falls back to, so that is what this check holds to the contract.
tmpl_default() {  # $1 a template value
  printf '%s' "$1" | sed -n 's/^\${[A-Za-z_][A-Za-z0-9_]*:-\(.*\)}$/\1/p'
}

echo "==> values that must agree across the split"

# ---- 1. the forfeit rule -----------------------------------------------------
# THIS USED TO BE AN EQUALITY and is now an absence, which is the stronger check. The ceiling is
# pinned onto matches.strike_ceiling by pair and read from the row by both the wave that applies it
# and the clock that judges its result, so there is no longer a second copy to keep in step. A
# `strike_ceiling` reappearing in Kalam's config is dead config that a future edit would wire back
# up, recreating exactly the hazard the column removed.
fs=$(var "$SOMA" forfeit_strikes)
sc=$(var "$RUNNER" strike_ceiling)
if [ -z "$fs" ]; then
  bad "forfeit_strikes is missing from $SOMA -- it is pair's fallback when a season declares none, and matches.strike_ceiling is NOT NULL"
elif [ -n "$sc" ]; then
  bad "$RUNNER still sets strike_ceiling = $sc -- Kalam reads the ceiling off the match row now, and a second copy is what the column exists to prevent"
else
  ok "forfeit_strikes = $fs in $SOMA only; Kalam reads matches.strike_ceiling"
fi

# ---- 1b. what crosses the Soma/Kalam boundary in two places ------------------
#
# Three new values cross the boundary, and each fails silently on its own:
#
#   model_prefix     a replica registers `tb.v<uuid>`, a match row names `tb.v<uuid>`. Disagree and
#                    the barrier releases every row for ever, with both sides looking healthy
#   ops_budget       admission judges an adapter by soma's adapter_ops_max and play prices it by
#                    the replica's engine.ops_budget. Disagree and a model is admitted under one
#                    ceiling and struck under another
#   orion_version    recorded on every verdict and every finished match; a sweep is per upgrade,
#                    so two numbers make the sweep unanswerable
mp_s=$(var "$SOMA" model_prefix)
mp_k=$(var "$RUNNER" model_prefix)
if [ -z "$mp_s" ]; then
  bad "model_prefix is missing from $SOMA -- it is what makes a version id a model id, and Soma is now the only side that composes one"
elif [ -n "$mp_k" ]; then
  bad "$RUNNER sets model_prefix = $mp_k -- a runner takes the model id whole, off the roster and the claim; a second copy could only disagree"
else
  ok "model_prefix = $mp_s in $SOMA only; the runner is told each model's id"
fi

aom=$(var "$SOMA" adapter_ops_max)
obg=$(section_var "$RUNNER" engine ops_budget)
obv=$(section_var "$RUNNER" vars ops_budget)
if [ -z "$obg" ]; then
  bad "$RUNNER sets no engine.ops_budget -- an adapter would be priced at admission and unpriced at play"
elif [ -n "$aom" ] && [ "$aom" != "$obg" ]; then
  bad "adapter_ops_max = $aom in $SOMA but engine.ops_budget = $obg in $RUNNER -- admitted under one ceiling, struck under another"
elif [ -z "$obv" ]; then
  bad "$RUNNER declares no [vars] ops_budget -- the token exchange reports it, and Soma refuses a runner whose reported ceiling disagrees with a season's (409 ops_budget_mismatch), which a missing report makes every runner"
elif [ "$obv" != "$obg" ]; then
  bad "[vars] ops_budget = $obv but [engine] ops_budget = $obg in $RUNNER -- the runner reports one ceiling and plays under another"
else
  ok "engine.ops_budget = $obg on the replica, reported as [vars] ops_budget, and the cartridge's manifest carries the same number for admission"
fi

# The longest match a runner reports it can hold is its match channel's timeout: Soma's claim hands
# a row only to a runner whose reported timeout covers the row, so a [vars] copy that drifts from
# the channel's number either starves a runner of matches it could play or hands it matches it
# cannot finish -- and those are not re-claimed for ever, the reap fails them at the third lapse,
# which is worse: they are played by nobody and end `failed`. entrypoint.sh derives both numbers
# from one variable at boot and load-package.sh writes it into the channel, so what is compared
# here is the pair a node falls back to when neither is derived.
mt_v=$(section_var "$RUNNER" vars match_timeout_ms)
mt_v=$(tmpl_default "$mt_v" || true); [ -n "$mt_v" ] || mt_v=$(section_var "$RUNNER" vars match_timeout_ms)
mt_c=$(python3 -c "import json;print(json.load(open('$KALAM_DIR/shared/kalam.json'))['constants']['match_channel_config']['timeout_ms'])" 2>/dev/null)
if [ -z "$mt_v" ] || [ -z "$mt_c" ]; then
  bad "could not read [vars] match_timeout_ms from $RUNNER or the match channel's timeout_ms from kalam's shared constants -- the fit Soma's claim checks is unchecked"
elif [ "$mt_v" != "$mt_c" ]; then
  bad "[vars] match_timeout_ms falls back to $mt_v but the match channel's timeout_ms = $mt_c in $RUNNER's package -- the runner would report a bound it does not run under"
else
  ok "the runner reports its match channel's timeout, $mt_c ms, as match_timeout_ms"
fi

ov_s=$(var "$SOMA" orion_version)
ov_k=$(var "$RUNNER" orion_version)
if [ -z "$ov_s" ] || [ -z "$ov_k" ]; then
  bad "orion_version is missing from one of the templates -- a sweep is per Orion upgrade"
elif [ "$ov_s" != "$ov_k" ]; then
  bad "orion_version = $ov_s in $SOMA but $ov_k in $RUNNER -- a match recorded against one Orion and admitted against another"
else
  ok "orion_version = $ov_s in both"
fi

# ---- 1d. the deploy fallbacks agree with the cartridge -------------------------
#
# The claim reads `coalesce(season rule, games.manifest -> limits, [vars])`, so these two
# vars are the BOTTOM of a three-level chain and a real deployment never reaches them. That is
# exactly what makes a disagreement invisible: it surfaces only on a season that declares nothing
# against a cartridge whose manifest is missing the key, which is the least-tested path there is.
# The cartridge is the authority for both, so the vars must simply agree with it.
#
# The manifest is the one kalam's package carries, out of the ants release it was built from; set
# CARTRIDGE_JSON to check another (an ants checkout's dist/cartridge.json, say).
CART="${CARTRIDGE_JSON:-}"
if [ -z "$CART" ] && command -v docker > /dev/null 2>&1 \
   && docker image inspect "$KALAM_IMAGE" > /dev/null 2>&1; then
  CART=$(mktemp)
  docker run --rm --entrypoint cat "$KALAM_IMAGE" /pkg/kalam/plugins/tb-ants/cartridge.json > "$CART" 2>/dev/null \
    && [ -s "$CART" ] || CART=""
fi
if [ -z "$CART" ] || [ ! -r "$CART" ]; then
  note "no cartridge.json to compare turn_ms/max_turns against -- set CARTRIDGE_JSON to check them"
else
  for k in turn_ms max_turns; do
    c_v=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('limits',{}).get(sys.argv[2],''))" "$CART" "$k" 2>/dev/null)
    s_v=$(var "$SOMA" "$k")
    if [ -z "$c_v" ]; then
      bad "$(basename "$CART") declares no limits.$k -- the claim's middle fallback does not exist"
    elif [ "$c_v" != "$s_v" ]; then
      bad "limits.$k = $c_v in the cartridge but $k = $s_v in $SOMA -- a season declaring nothing would play by one and the deploy fallback says the other"
    else
      ok "limits.$k = $c_v agrees with the deploy fallback"
    fi
  done

  # The seats an upload may have are the cartridge's `limits.boards`: Soma refuses a season map
  # above them, and a board a runner cannot seat is a row no replica claims, for ever, while the
  # queue fills with it. So kalam's seat list -- the fixed task list's width -- must reach the top of
  # the envelope, and the envelope must exist at all: a cartridge without one is an engine from
  # before season maps, and every upload to a season on it is refused.
  # The width of the fixed per-seat task list, read from what SHIPS: `constants.seats` is the list
  # `$each` repeats those tasks over, so its length is the seat count the workflow can play.
  kalam_max=$(python3 -c "import json;print(len(json.load(open('$KALAM_DIR/shared/kalam.json'))['constants']['seats']))" 2>/dev/null)
  env_out=$(python3 - "$CART" "${kalam_max:-}" <<'PYEOF'
import json, sys
cart, kmax = sys.argv[1], sys.argv[2]
b = json.load(open(cart)).get("limits", {}).get("boards")
if not b:
    print("FAIL the cartridge declares no limits.boards -- no season map can be uploaded against it")
    sys.exit()
top = b["players"][1]
if kmax and top != int(kmax):
    print(f"FAIL limits.boards allows {top} seats and kalam's constants.seats is {kmax}: the seat list is "
          f"the engine's envelope, not kalam's opinion of it -- narrower and a board that wide is claimed "
          f"and mis-seated, wider and the package carries seats no board can have")
else:
    print(f"OK limits.boards: {b['players'][0]}-{top} seats, sides {b['sides'][0]}-{b['sides'][1]}, "
          f"at most {b['cells_max']} cells" + (f"; kalam's seat list is the same {kmax}" if kmax else ""))
PYEOF
)
  while IFS= read -r line; do
    case "$line" in
      FAIL\ *) bad "${line#FAIL }" ;;
      OK\ *) ok "${line#OK }" ;;
    esac
  done <<< "$env_out"

  # AND THE NODE COVERS WHAT THE RULES ALLOW, WHICH IS THE WHOLE OF WHAT IS LEFT TO CHECK. Soma's
  # claim used to price each row against the timeout a runner reported, so a small machine removed
  # boards from the ladder: the row stayed pending for ever, pair skipped the board, and the season
  # played its narrow ones in silence. Nothing prices a row now, which moves the burden here -- the
  # match channel's timeout is a bound on a WEDGE, and it must exceed the longest match soma's own
  # rules can declare, or a node claims a row and is killed playing it. entrypoint.sh derives that
  # from the two ceilings below and refuses to boot under it; these are the committed fallbacks and
  # the ceilings they were derived from, which is what can go stale in a file.
  ep="$KALAM_DIR/docker/entrypoint.sh"
  spec_turn=$(sed -n "s/.*'execution', *'turn_ms'[^0-9]*[0-9][0-9]*, *\([0-9][0-9]*\).*/\1/p" \
    "$SOMA_DIR/migrations/0001_init.sql" | head -1)
  spec_turns=$(sed -n "s/.*'execution', *'max_turns'[^0-9]*[0-9][0-9]*, *\([0-9][0-9]*\).*/\1/p" \
    "$SOMA_DIR/migrations/0001_init.sql" | head -1)
  ep_turn=$(sed -n 's/^SEASON_TURN_MS_MAX="\${SEASON_TURN_MS_MAX:-\([0-9][0-9]*\)}"/\1/p' "$ep")
  ep_turns=$(sed -n 's/^SEASON_MAX_TURNS_MAX="\${SEASON_MAX_TURNS_MAX:-\([0-9][0-9]*\)}"/\1/p' "$ep")
  if [ -z "$spec_turn" ] || [ -z "$spec_turns" ] || [ -z "$ep_turn" ] || [ -z "$ep_turns" ]; then
    bad "could not read execution.turn_ms/max_turns ceilings from soma's migration or their defaults from $ep -- what a runner must be able to hold is UNCHECKED"
  elif [ "$spec_turn" != "$ep_turn" ] || [ "$spec_turns" != "$ep_turns" ]; then
    bad "a season may set turn_ms up to $spec_turn and max_turns up to $spec_turns, but kalam derives from ${ep_turn} x ${ep_turns} -- the runner sizes itself for a shorter match than the rules allow, claims one it cannot hold, and is killed playing it"
  else
    ok "kalam sizes itself from soma's own ceilings (turn_ms $spec_turn, max_turns $spec_turns)"
  fi
  fit_out=$(python3 - "$CART" "$mt_v" "$(tmpl_default "$(section_var "$RUNNER" vars seat_concurrency)")" \
    "${ep_turn:-0}" "${ep_turns:-0}" <<'PYEOF'
import json, sys, math
cart, mt, sc, turn, turns = sys.argv[1:6]
b = json.load(open(cart)).get("limits", {}).get("boards")
if not (b and mt.isdigit() and sc.isdigit() and turn.isdigit() and turns.isdigit() and int(turn) and int(turns)):
    print(f"FAIL could not price the longest legal match against the runner's occurrence bound "
          f"(boards {'present' if b else 'missing'}, timeout '{mt}', seats '{sc}', ceilings {turn}x{turns})")
    sys.exit()
top, mt, sc, turn, turns = b["players"][1], int(mt), int(sc), int(turn), int(turns)
need = -(-(turn * turns * math.ceil(top / sc) * 11) // 10)
if need > mt:
    print(f"FAIL the longest match these rules allow is {need} ms ({turn} ms x {turns} turns x "
          f"{math.ceil(top / sc)} batch(es) of a {top}-seat board), above the runner's {mt} ms "
          f"occurrence bound: such a row is claimed and then killed, and fails LEASE_LAPSED having "
          f"been played by nobody")
else:
    print(f"OK the runner holds {mt} ms, past the {need} ms longest match these rules allow "
          f"({turn} ms x {turns} turns, a {top}-seat board at {sc} seat(s) at once)")
PYEOF
)
  while IFS= read -r line; do
    case "$line" in
      FAIL\ *) bad "${line#FAIL }" ;;
      OK\ *) ok "${line#OK }" ;;
    esac
  done <<< "$fit_out"
fi

# ---- 1e. the runner's reach, and the one assertion that matters backwards ------
#
# `kalam-api` is the only connector that addresses the platform FROM WHEREVER THE RUNNER IS. The
# others reach things inside the deployment, so a private address is normal for them; this one is
# the boundary, and `allow_private_urls` on it means a runner that will follow a redirect into a
# private network. Backwards, this check passes a production runner that should have been refused.
#
# KALAM_ALLOW_PRIVATE_URLS=1 is a COMPOSE-ONLY opt-out: `soma:8080` is a private name, so the dev
# stack needs it and nothing else does.
if [ "${KALAM_ALLOW_PRIVATE_URLS:-0}" = "1" ]; then
  api_url=$(grep -oE 'SOMA_URL=[^ ]*' "$DEV_ENV/kalam/.env" 2>/dev/null | head -1 | cut -d= -f2-)
  case "${KALAM_API_URL:-${api_url:-http://soma:8080}}" in
    http://soma:*|http://localhost:*|http://127.0.0.1:*|http://host.docker.internal:*)
      # host.docker.internal is how devops/compose/runner.yml is rehearsed against a local stack:
      # the runner is a separate compose project with no network to it, so it reaches the gate
      # through the host's published ports. Still a private address, and still needs the opt-out --
      # which is exactly why that rehearsal proves everything about that file EXCEPT this.
      ok "kalam-api may reach a private address, and the address it names is a local one" ;;
    *)
      bad "KALAM_ALLOW_PRIVATE_URLS=1 while kalam-api names ${KALAM_API_URL} -- a runner outside the compose bridge must not follow a redirect into a private network" ;;
  esac
else
  ok "kalam-api refuses private addresses (KALAM_ALLOW_PRIVATE_URLS unset)"
fi


# ---- 1f. the credentials a runner is allowed to hold --------------------------
#
# The point of the whole track is what a replica does NOT hold, so it is worth asserting rather
# than believing. An `api`-mode replica must reach the object store with a key that can only read
# `models/*`; if it is handed the deployment's own R2 key instead, everything works and the
# property is silently gone -- which is the failure mode this repo is most careful about.
mrk=$(var "$RUNNER" models_bucket_connector)
if [ -n "${MODELS_READ_ACCESS_KEY:-}" ] && [ "${MODELS_READ_ACCESS_KEY:-}" = "${R2_ACCESS_KEY:-}" ]; then
  bad "MODELS_READ_ACCESS_KEY is the deployment's own R2 key -- a runner would hold a credential that can write. devops/scripts/setup/init.sh mints the narrow one and the buckets one-shot creates it"
else
  ok "the runner's object-store key is not the deployment's write key"
fi

# The gate's own role. The eight machine-facing routes run as `runner_gate` and the five admin ones
# as the owner, and that split is what keeps the gate confined to its column grants. A deployment that leaves RUNNER_GATE_DB_URL unset runs them all as the owner again,
# which works perfectly and quietly undoes the boundary.
if [ -z "${RUNNER_GATE_DB_URL:-}" ] && ! grep -q "RUNNER_GATE_DB_URL" "$COMPOSE_DIR/web.yml" 2>/dev/null; then
  bad "no RUNNER_GATE_DB_URL -- the runner routes would fall back to the owner connector and the column grant would stop being what confines them"
else
  ok "the machine-facing runner routes have a role of their own"
fi

# The models entity is ON on every runner and OFF on Soma. A runner plays models, and admits them
# when its role is `admit`; off there is a stack that looks healthy and admits or plays nothing. Soma
# runs none: the node that serves the site and holds the database owner never parses a competitor's
# ONNX, and [models] on there would be a model runtime nothing should be using.
for f in "$RUNNER"; do
  if ! awk '/^\[models\]/{f=1} f&&/^enabled[[:space:]]*=[[:space:]]*true/{print;exit}' "$f" | grep -q true; then
    bad "$f does not enable [models] -- nothing can be admitted or played"
  else
    ok "$(basename "$f") enables [models]"
  fi
done
if awk '/^\[models\]/{f=1} f&&/^enabled[[:space:]]*=[[:space:]]*false/{print;exit}' "$SOMA" | grep -q false; then
  ok "$(basename "$SOMA") runs no model: admission executes on an admitting runner"
else
  bad "$SOMA does not set [models] enabled = false -- Soma runs no model; admission is an admitting runner's"
fi

# ADMISSION'S ONLY WALL-CLOCK VERDICT. An admitting runner admits under the runner template's
# max_probe_ms, and every match runner's roster admits the same versions under the same file, so a
# model admitted on one machine is admitted on the rest -- but only if the number is PINNED there:
# inherited, it is whatever Orion's default is in the image, which nothing here can see.
# And the number is the GAME'S TURN: a model whose median inference at its probe_dims fits
# limits.turn_ms can answer a turn, so a stricter gate refuses a model the game would let play, and
# `tinybrains check` measures the probe against that same turn_ms with no copy of this number.
mp=$(var "$RUNNER" max_probe_ms)
case "$mp" in
  ''|*[!0-9]*) bad "$(basename "$RUNNER") does not pin models.max_probe_ms -- admission's one timing gate would be Orion's default, unseen" ;;
  *)
    ct=""
    [ -n "$CART" ] && [ -r "$CART" ] && ct=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('limits',{}).get('turn_ms',''))" "$CART" 2>/dev/null)
    if [ -z "$ct" ]; then
      ok "$(basename "$RUNNER") pins admission's probe at max_probe_ms $mp"
      note "no cartridge.json to compare max_probe_ms with limits.turn_ms -- set CARTRIDGE_JSON to check it"
    elif [ "$mp" != "$ct" ]; then
      bad "$(basename "$RUNNER") pins max_probe_ms = $mp but the cartridge's limits.turn_ms is $ct -- admission would judge a model's speed by a turn the game does not play, and tinybrains check by the other"
    else
      ok "$(basename "$RUNNER") pins admission's probe at max_probe_ms $mp, the cartridge's turn_ms"
    fi
    ;;
esac

# THE REFERENCE OBSERVATIONS AN ADMISSION PLAYS. Soma's claim sends admit_observations of them, each
# under admit_infer_ms, and kalam's kalam-admit fans one inference out over every one, one at a time,
# inside its channel's timeout_ms. Every observation at its deadline must fit, or a slow model's
# admission is cut off before it reports -- its lease lapses and it expires TIMED_OUT with every
# runner healthy.
ao=$(var "$SOMA" admit_observations)
aim=$(var "$SOMA" admit_infer_ms)
ato=$(python3 -c "import json;print(json.load(open('$KALAM_DIR/shared/kalam.json'))['constants']['admit_channel_config']['timeout_ms'])" 2>/dev/null)
if [ -z "$ao" ] || [ -z "$aim" ] || [ -z "$ato" ]; then
  bad "could not read soma's admit_observations / admit_infer_ms or kalam-admit's timeout_ms -- an admission's length is unchecked"
elif [ $((ao * aim)) -lt "$ato" ]; then
  ok "an admission's $ao observations at ${aim} ms each fit kalam-admit's ${ato} ms"
else
  bad "soma sends $ao observations at ${aim} ms each ($((ao * aim)) ms) but kalam-admit times out at ${ato} ms -- a slow model's admission would never report"
fi

# kalam-admit plays the observations as a workflow loop, one sweep each and one more that reports,
# so the loop's max must exceed admit_observations: at or under it, the report sweep never runs and
# every admission's lease lapses unreported.
alm=$(python3 -c "import json;print(json.load(open('$KALAM_DIR/workflows/kalam-admit-run.json'))['loop']['max'])" 2>/dev/null)
if [ -z "$ao" ] || [ -z "$alm" ]; then
  bad "could not read soma's admit_observations or kalam-admit-run's loop max -- the report sweep is unchecked"
elif [ "$alm" -gt "$ao" ]; then
  ok "kalam-admit-run's loop max ($alm) leaves a report sweep after $ao observations"
else
  bad "kalam-admit-run's loop max is $alm but soma sends $ao observations -- the report sweep never runs"
fi

# ---- 1g. the runner template is a runner, and cannot be talked out of it -------
#
# runner.toml.tmpl exists to hold LESS than kalam.toml.tmpl, and every one of these is a thing that
# would work if it crept back in -- and quietly undo the reason the file exists.
# SECTION-SCOPED, unlike `var`, which takes the first match in the file: [trace_storage] also has
# a `mode`, and a bare lookup finds it the moment [vars] stops declaring one -- reporting the
# runner as configurable into a mode that no longer exists.
rmode=$(awk '/^\[vars\]/{v=1;next} /^\[/{v=0} v' "$RUNNER" | sed -n 's/^[[:space:]]*mode[[:space:]]*=[[:space:]]*\(.*\)$/\1/p' | head -1)
if [ -z "$rmode" ]; then
  ok "the runner declares no mode -- there is one way to reach the queue, and it is the gate"
else
  bad "$RUNNER sets mode = $rmode; there is no mode any more. A runner that can be switched into reading the database directly is a runner that can be handed a connection string"
fi

# THE NINE NUMBERS A MATCH IS PLAYED UNDER. They arrive on the claim, from the season that owns the
# match. One of them present here is a value an operator will eventually tune, and
# then the runner plays a season by numbers the season did not set -- with nothing to see, because
# both halves work.
creep=""
for k in turn_ms max_turns lease_seconds renew_after_ms retry_after_ms renew_every_n_turns replay_prefix model_prefix blob_endpoint; do
  [ -n "$(var "$RUNNER" "$k")" ] && creep="$creep $k"
done
if [ -n "$creep" ]; then
  bad "$RUNNER carries$creep -- in api mode these arrive on the claim and a local copy is one the season cannot correct"
else
  ok "the runner carries none of the nine contract values: every one arrives on the claim"
fi

# `arch` answers "what is that machine" on the Runners screen and is the one field whose whole
# value is being true. A literal is a label that lies in exactly the situation the screen exists for
# -- and it did: every replica on this arm64 laptop reported amd64 until this was derived.
for f in "$RUNNER"; do
  a=$(var "$f" arch)
  case "$a" in
    *RUNNER_ARCH*) ok "$(basename "$f") derives arch from the machine" ;;
    *)             bad "$(basename "$f") sets arch = $a -- derive it from uname (entrypoint.sh does), or the Runners screen reports the architecture someone typed" ;;
  esac
done

# A runner is not in a cluster and must never be: a shared `forbid` row would make the match clock a
# fleet-wide singleton, so exactly one machine would ever play while the rest polled a held row
# looking perfectly healthy. Same assertion as for a replica, and it matters more out here.
for f in "$RUNNER"; do
  if grep -q '^\[cluster\]' "$f"; then
    bad "$(basename "$f") has a [cluster] block -- the match clock would become a fleet-wide singleton"
  else
    ok "$(basename "$f") declares no cluster"
  fi
done

# ---- 1h. the deadline a model is actually given -------------------------------
#
# THE SILENT CLAMP. `model_infer` asks for the claim's turn_ms and Orion reduces it to
# models.max_timeout_ms without a word (`v.min(max_timeout_ms)`), so a node with 1000 here playing
# a season with execution.turn_ms = 5000 gives every model one second while the match is scored as
# if it had five. No error, no trace: the models simply lose turns they were owed.
#
# The bound is not a taste: season_rule_spec() caps execution.turn_ms, and that cap is the largest
# number an admin can put in a season. Read it out of the migration rather than repeating it.
# `[0-9][0-9]*`, not `[0-9]\+` -- BSD sed (macOS, where this repo is developed) does not take the
# GNU spelling and silently matches nothing, which this check would have read as "cannot find it".
spec_max=$(sed -n "s/.*'execution', *'turn_ms'[^0-9]*[0-9][0-9]*, *\([0-9][0-9]*\).*/\1/p" \
             ../soma/migrations/0001_init.sql | head -1)
if [ -z "$spec_max" ]; then
  note "could not read execution.turn_ms's ceiling out of soma/migrations/0001_init.sql -- the clamp below is unchecked"
else
  for f in "$RUNNER"; do
    mt=$(var "$f" max_timeout_ms); mt=${mt##*:-}; mt=${mt%\}}
    case "$mt" in
      ''|*[!0-9]*) bad "$(basename "$f") has no numeric models.max_timeout_ms" ;;
      *) if [ "$mt" -ge "$spec_max" ]; then
           ok "$(basename "$f") gives a model the season's full turn (max_timeout_ms $mt >= the spec's ceiling $spec_max)"
         else
           bad "$(basename "$f") sets max_timeout_ms = $mt but a season may ask for $spec_max -- Orion would clamp SILENTLY and the match would be scored as if the model had the time it did not get"
         fi ;;
    esac
  done
fi

# ---- 1h2. the longest match a season may ask for can finish ---------------------
#
# A match lane plays one turn per loop sweep plus the sweep that finishes, and stops at its loop
# max. A season whose max_turns needs more never finishes: the row is reaped, replayed from its seed
# and failed on the third lapse, and nothing says why. So season_rule_spec()'s ceiling on
# execution.max_turns must leave that last sweep inside kalam's MATCH_LOOP_MAX.
turns_max=$(sed -n "s/.*'execution', *'max_turns'[^0-9]*[0-9][0-9]*, *\([0-9][0-9]*\).*/\1/p" \
              "$SOMA_DIR/migrations/0001_init.sql" | head -1)
loop_max=$(python3 -c "import json;print(json.load(open('$KALAM_DIR/workflows/kalam-match-run.json'))['loop']['max'])" 2>/dev/null)
# `bad`, not `note`: this reads kalam-match-run.json BY PATH, so a renamed workflow makes the
# read fail rather than disagree -- and a yellow line nobody reads is how a check disappears.
if [ -z "$turns_max" ] || [ -z "$loop_max" ]; then
  bad "could not read execution.max_turns's ceiling (soma migration) or kalam-match-run's loop.max -- a season's match length is UNCHECKED, and the usual cause is that one of the two files moved"
elif [ "$((turns_max + 1))" -le "$loop_max" ]; then
  ok "a season's longest match ($turns_max turns) finishes inside kalam's loop ($loop_max sweeps)"
else
  bad "a season may set max_turns = $turns_max, but kalam's match loop stops at $loop_max sweeps -- a match that long can never finish"
fi

# ---- 1h3. no weight class a node would refuse ---------------------------------
#
# Every node refuses an artifact past [models] max_artifact_bytes before any class is considered, so
# a class cap above it names a class nothing can ever be admitted into -- and the refusal is
# SIZE_FAILED, not TOO_LARGE. weight_classes_ok() in the migration refuses a cap above its ceiling;
# every template must admit at least that much.
cap_max=$(sed -n "s/.*(e ->> 'max_bytes')::numeric > \([0-9][0-9]*\).*/\1/p" \
            "$SOMA_DIR/migrations/0001_init.sql" | head -1)
if [ -z "$cap_max" ]; then
  note "could not read the class-cap ceiling out of weight_classes_ok() -- class caps are unchecked against max_artifact_bytes"
else
  for f in "$RUNNER"; do
    ab=$(var "$f" max_artifact_bytes)
    case "$ab" in
      ''|*[!0-9]*) bad "$(basename "$f") has no numeric models.max_artifact_bytes" ;;
      *) if [ "$ab" -ge "$cap_max" ]; then
           ok "$(basename "$f") admits every class a season may define (max_artifact_bytes $ab >= the cap ceiling $cap_max)"
         else
           bad "$(basename "$f") sets max_artifact_bytes = $ab but a season may define a class up to $cap_max -- a model in between is refused SIZE_FAILED"
         fi ;;
    esac
  done
fi

# ---- 1h4. a model's memory fits the node, and plays on one device --------------
#
# A seat's memory is an output the runner hands back as an input on the seat's next view, so the
# largest memory a season may allow rides in BOTH directions every turn. weight_classes_ok() bounds
# each class's memory_flat_bytes and memory_cell_bytes, and at those tops a one-byte memory on the
# largest board (cells_max) is flat + cell x cells_max elements. Beside it, the inputs carry the
# board's seven i8 planes and the outputs a per-cell policy of five. Past `max_input_elements` or
# `max_output_elements` Orion refuses the call, so a model admitted under its class's cap is struck
# on every turn of a large board, and admission, which never plays the largest board, does not see it.
# The bounds are read out of the migration, the envelope out of the cartridge.
mem_bounds=$(python3 - "$SOMA_DIR/migrations/0001_init.sql" <<'PYEOF'
import re, sys
sql = open(sys.argv[1]).read()
m = re.search(r"CREATE FUNCTION weight_classes_ok.*?\$\$(.*?)\$\$", sql, re.S)
body = m.group(1) if m else ""
out = []
for key in ("memory_flat_bytes", "memory_cell_bytes"):
    tops = []
    for line in body.splitlines():
        if key in line:
            tops += [int(n) for n in re.findall(r"(?:>|<=|BETWEEN\s+\S+\s+AND)\s*(\d+)", line)]
    out.append(str(max(tops)) if tops else "")
print(" ".join(out))
PYEOF
)
mem_flat=$(echo "$mem_bounds" | awk '{print $1}')
mem_cell=$(echo "$mem_bounds" | awk '{print $2}')
cells_max=""
[ -n "$CART" ] && [ -r "$CART" ] && cells_max=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('limits',{}).get('boards',{}).get('cells_max',''))" "$CART" 2>/dev/null)
if [ -z "$mem_flat" ] || [ -z "$mem_cell" ]; then
  bad "could not read memory_flat_bytes / memory_cell_bytes's ceilings out of weight_classes_ok() in $SOMA_DIR/migrations/0001_init.sql -- a season's memory is UNCHECKED against what a runner accepts"
elif [ -z "$cells_max" ]; then
  note "no cartridge.json to read limits.boards.cells_max from -- the memory ceilings are unchecked against max_input_elements; set CARTRIDGE_JSON to check them"
else
  mem_top=$((mem_flat + mem_cell * cells_max))
  mie=$(var "$RUNNER" max_input_elements); mie=${mie##*:-}; mie=${mie%\}}
  moe=$(var "$RUNNER" max_output_elements); moe=${moe##*:-}; moe=${moe%\}}
  need_in=$((mem_top + 7 * cells_max))
  need_out=$((mem_top + 5 * cells_max))
  case "$mie" in
    ''|*[!0-9]*) bad "$(basename "$RUNNER") has no numeric models.max_input_elements -- the largest memory a season may allow is checked against Orion's default, unseen" ;;
    *) if [ "$need_in" -le "$mie" ]; then
         ok "the largest memory ($mem_flat + $mem_cell x $cells_max) and the board's 7 planes ($need_in elements) fit max_input_elements $mie"
       else
         bad "a season may allow $mem_top elements of memory, and with the board's 7 planes an input is $need_in elements, past $(basename "$RUNNER")'s max_input_elements $mie -- every call of such a model is refused"
       fi ;;
  esac
  case "$moe" in
    ''|*[!0-9]*) bad "$(basename "$RUNNER") has no numeric models.max_output_elements -- the largest memory a season may allow is checked against Orion's default, unseen" ;;
    *) if [ "$need_out" -le "$moe" ]; then
         ok "the largest memory and a per-cell policy of 5 ($need_out elements) fit max_output_elements $moe"
       else
         bad "a season may allow $mem_top elements of memory, and with a per-cell policy an output is $need_out elements, past $(basename "$RUNNER")'s max_output_elements $moe -- every call of such a model is refused"
       fi ;;
  esac
fi

# ONE DEVICE, AND IT IS WRITTEN DOWN. Both seats of a match play on one runner, so a device cannot
# favour a seat, but it can shift a whole match, and a memory feeds a last-digit difference back for
# a thousand turns: `conform`, or the same match on another machine, then plays other moves. A
# template that sets nothing runs Orion's default, which nothing here can see, and a substitution is
# an operator's override that turns an accelerator on without a word. So every template that runs a
# model pins the literal "cpu" for tract. Orion reads the device per runtime, under
# [models.runtimes.tract]; a `device` directly under [models] is an unknown field, and the node
# refuses the whole file.
section() {  # $1 file, $2 the header as written -- that section's lines
  awk -v h="$2" '$0 == h {m=1; next} /^\[/ {m=0} m' "$1"
}
for f in "$KALAM_DIR"/docker/*.toml.tmpl "$SOMA_DIR"/docker/*.toml.tmpl; do
  [ -r "$f" ] || continue
  section "$f" '[models]' | grep -qE '^enabled[[:space:]]*=[[:space:]]*true' || continue
  if section "$f" '[models]' | grep -qE '^[[:space:]]*device[[:space:]]*='; then
    bad "$(basename "$f") sets device directly under [models] -- Orion reads it under [models.runtimes.tract], and refuses the file"
    continue
  fi
  dev=$(section "$f" '[models.runtimes.tract]' \
        | sed -n 's/^[[:space:]]*device[[:space:]]*=[[:space:]]*\(.*\)$/\1/p' | head -1 \
        | sed 's/[[:space:]]*#.*$//; s/[[:space:]]*$//')
  if [ "$dev" = '"cpu"' ]; then
    ok "$(basename "$f") pins [models.runtimes.tract] device = \"cpu\""
  else
    bad "$(basename "$f") runs models with device = ${dev:-(unset)} -- pin the literal \"cpu\" under [models.runtimes.tract]: a match with memory must replay the same on every machine"
  fi
done

# ---- 1i. admitted under one ceiling, played under another ---------------------
#
# engine.ops_budget is what an adapter may spend at PLAY. budgets.adapter_ops_max in the cartridge
# manifest is what admission judges by. Different numbers mean a model that passed admission is
# struck at play, or the reverse -- and neither half reports anything but a normal result.
#
# The manifest is read out of kalam's package, which carries it beside the component from the one
# ants release that package was built from; the loader registers that copy.
kalam_ref="$KALAM_IMAGE"
if command -v docker > /dev/null 2>&1 && docker image inspect "$kalam_ref" > /dev/null 2>&1; then
  amax=$(docker run --rm --entrypoint cat "$kalam_ref" /pkg/kalam/plugins/tb-ants/cartridge.json 2>/dev/null \
         | tr -d ' \n' | sed -n 's/.*"adapter_ops_max":\([0-9]*\).*/\1/p')
  if [ -z "$amax" ]; then
    skip "adapter_ops_max (could not read it out of $kalam_ref)"
  else
    for f in "$RUNNER"; do
      ob=$(var "$f" ops_budget)
      if [ "$ob" = "$amax" ]; then
        ok "$(basename "$f") plays adapters under the budget admission judges by ($amax)"
      else
        bad "$(basename "$f") sets engine.ops_budget = $ob but the cartridge declares adapter_ops_max = $amax -- a model would be admitted under one ceiling and played under another"
      fi
    done
  fi
else
  skip "adapter_ops_max (no docker, or $kalam_ref is not built)"
fi

# ---- 1j. the cartridge is wasm32, so the digest does not vary by host ----------
#
# The whole reason an arm64 Mac may play in an amd64 deployment's ladder. `engine_digest` is the
# sha256 of a wasm32 component, so every machine derives the same string from the same image -- and
# if that ever stopped being true, a runner would claim nothing, for ever, and look healthy. Cheap
# to assert: the component's own target.
if command -v docker > /dev/null 2>&1 && docker image inspect "$kalam_ref" > /dev/null 2>&1; then
  # `\0asm` then a 4-byte version. A component is wasm whatever built it; what matters is that
  # nothing in the pipeline produced a native object for one architecture.
  magic=$(docker run --rm --entrypoint head "$kalam_ref" -c 4 /pkg/kalam/plugins/tb-ants/tb-ants.wasm 2>/dev/null | od -An -tx1 | tr -d ' ')
  if [ "$magic" = "0061736d" ]; then
    ok "the cartridge is a wasm component -- engine_digest is the same string on every architecture"
  else
    bad "/pkg/kalam/plugins/tb-ants/tb-ants.wasm in $kalam_ref does not begin with the wasm magic (got ${magic:-nothing}) -- if the engine is ever architecture-specific, a runner's derived digest stops matching the ladder's"
  fi
fi

# ---- 1k. one bucket, THREE addresses, and two of them must be the same string --
#
# The gate signs a replay PUT for RUNNER_BLOB_ENDPOINT; the runner PUTs it through a connector whose
# base URL is R2_ENDPOINT as set on the RUNNER. SigV4 signs the host, so a URL signed for one and
# sent to the other is SignatureDoesNotMatch -- a 403 naming neither setting, on a machine nobody is
# watching. They are two variables in two files on two hosts and nothing else makes them agree.
gate_be=$(grep -oE 'RUNNER_BLOB_ENDPOINT:-[^}]*' "$COMPOSE_DIR/web.yml" 2>/dev/null | head -1 | sed 's/^RUNNER_BLOB_ENDPOINT:-//')
# `kalam-blobs-put` names `env://RUNNER_BLOB_ENDPOINT` in the committed connector, so what this
# reads is the variable kalam's compose supplies under that name -- the same name Soma signs under.
# Before Orion 1.9.0 an http connector's `url` could not be a reference and the loader staged it in
# from R2_ENDPOINT, which is why the two sides used to have different names for one address.
run_be=$(grep -oE 'RUNNER_BLOB_ENDPOINT: \$\{[A-Z_]+' "$COMPOSE_DIR/runner.yml" 2>/dev/null | head -1 | sed 's/.*{//')
if ! grep -q 'env://RUNNER_BLOB_ENDPOINT' "$KALAM_DIR/connectors/kalam-blobs-put.json" 2>/dev/null; then
  bad "kalam-blobs-put does not name env://RUNNER_BLOB_ENDPOINT -- the runner would PUT to an address the gate did not sign for"
elif [ -z "$run_be" ]; then
  bad "devops/compose/runner.yml does not set RUNNER_BLOB_ENDPOINT -- kalam-blobs-put resolves nothing and the connector is skipped"
elif [ "$run_be" = "RUNNER_BLOB_ENDPOINT" ]; then
  ok "the runner PUTs a replay to the endpoint the gate signs for (both read RUNNER_BLOB_ENDPOINT)"
else
  note "the runner's replay base comes from \$$run_be while the gate signs for ${gate_be:-RUNNER_BLOB_ENDPOINT} -- a deployment must make these the same string"
fi

# THE SAME PAIR AGAIN IN THE PRODUCTION COPIES, which is where it was actually wrong: kalam's
# prod compose set R2_ENDPOINT and never RUNNER_BLOB_ENDPOINT, so `kalam-blobs-put` resolved
# nothing, the connector was skipped, `put` could not activate and the boot apply stopped the
# node -- a production runner that cannot start. The dev pair passing says nothing about this
# one: they are two more files, on two more hosts, that nothing else makes agree.
gate_be_p=$(grep -oE 'RUNNER_BLOB_ENDPOINT: \$\{[A-Z0-9_]+' "$COMPOSE_DIR/web.prod.yml" 2>/dev/null | head -1 | sed 's/.*{//')
run_be_p=$(grep -oE 'RUNNER_BLOB_ENDPOINT: \$\{[A-Z0-9_]+' "$COMPOSE_DIR/runner.prod.yml" 2>/dev/null | head -1 | sed 's/.*{//')
if [ -z "$run_be_p" ]; then
  bad "devops/compose/runner.prod.yml does not set RUNNER_BLOB_ENDPOINT -- kalam-blobs-put resolves nothing, so a production runner stops at its boot apply"
elif [ -z "$gate_be_p" ]; then
  bad "devops/compose/web.prod.yml does not set RUNNER_BLOB_ENDPOINT -- the gate would sign a replay PUT for an address it never declared"
elif [ "$run_be_p" = "$gate_be_p" ]; then
  ok "in production both sides read \$$run_be_p for the replay endpoint"
else
  bad "production disagrees: the runner's replay base is \$$run_be_p and the gate signs for \$$gate_be_p -- SigV4 signs the host, so every replay PUT is a 403"
fi

# ---- 2. the rating prior -----------------------------------------------------
# Both readers are in soma.toml.tmpl today; this compares against kalam.toml.tmpl only if it ever
# grows a copy, so the day it matters the check already exists.
for k in prior_mu prior_sigma; do
  a=$(var "$SOMA" "$k"); b=$(var "$RUNNER" "$k")
  if [ -z "$a" ]; then
    bad "$k is missing from $SOMA"
  elif [ -n "$b" ] && [ "$a" != "$b" ]; then
    bad "$k = $a in $SOMA but $b in $RUNNER -- two priors on one ladder"
  elif [ -n "$b" ]; then
    ok "$k == $a in both"
  else
    ok "$k = $a (soma only, as expected: the routes and the clocks share one config)"
  fi
done

# NO MODEL SHIPS WITH THE PLATFORM. A season's baselines are uploaded into it by an admin and
# admitted like any submission, and no model is committed but the starter's. A roster file that
# seeds baselines from a file is the wrong design.
for f in "$SOMA_DIR/docker/baselines.toml" "$SOMA_DIR/docker/baselines.py" "$WEB_DIR/compose/baselines.toml"; do
  if [ -e "$f" ]; then
    bad "$f exists -- baselines are uploaded into a season, never seeded from a roster"
  fi
done
ok "no baseline roster: a season's baselines are uploaded to it"

# ---- 2b. the fallbacks a season's rules coalesce against ---------------------
# Every rule in seasons.rules is read `coalesce(rule, <var>)`, so "a season that declares nothing
# behaves exactly as the deploy does" is only true while the var it falls back to still exists.
# Deleting one "because it moved to the season" is how that quietly stops being true.
for k in burst steady_cap settled_sigma cross_class_fraction repair_cap \
         opset_min opset_max op_allowlist prior_mu prior_sigma sigma_inflation \
         ts_beta ts_tau ts_draw_probability; do
  if [ -z "$(var "$SOMA" "$k")" ]; then
    bad "$k is missing from $SOMA -- it is the fallback a season's rules coalesce against"
  fi
done
ok "every [vars] fallback a season rule coalesces against is present"

# ---- 2c. the ONNX surface, in three places -----------------------------------
# Soma's `op_allowlist`, `opset_min` and `opset_max` are what admission refuses a graph on. The
# CLI's `check` carries a copy (cli/src/onnx.rs), so a competitor hears OP_NOT_ALLOWED at their
# desk and not from the admit clock, and the book publishes the list (docs/src/models/format.md).
# A runtime that executes an operator says nothing about the list -- `GreaterOrEqual` runs on
# tract and is refused here -- so the three copies have to be one list.
CLI_DIR="${CLI_DIR:-../cli}"
ops_of() { tr -d '[];"\n ' | tr ',' '\n' | sed '/^$/d' | sort; }
soma_ops=$(awk '/^op_allowlist = \[/,/^\]/' "$SOMA" | sed 's/^op_allowlist = //' | ops_of)
book_ops=$(awk '/^The allowlist names these operators:/,/^```$/' "$WEB_DIR/docs/src/models/format.md" | grep -vE '^(The allowlist|```)' | tr ' ' '\n' | sed '/^$/d' | sort)
if [ "$soma_ops" != "$book_ops" ]; then
  bad "the book's Format page lists other operators than $SOMA's op_allowlist: $(diff <(echo "$soma_ops") <(echo "$book_ops") | grep '^[<>]' | tr '\n' ' ')"
fi
if [ -f "$CLI_DIR/src/onnx.rs" ]; then
  cli_ops=$(awk '/^pub const OP_ALLOWLIST/,/^\];/' "$CLI_DIR/src/onnx.rs" | sed 's/^pub const OP_ALLOWLIST[^=]*= &//' | ops_of)
  if [ "$soma_ops" != "$cli_ops" ]; then
    bad "cli's OP_ALLOWLIST (src/onnx.rs) lists other operators than $SOMA's op_allowlist: $(diff <(echo "$soma_ops") <(echo "$cli_ops") | grep '^[<>]' | tr '\n' ' ')"
  fi
  for k in min max; do
    want=$(var "$SOMA" "opset_$k"); have=$(grep -oE "^pub const OPSET_$(echo $k | tr a-z A-Z): i64 = [0-9]+" "$CLI_DIR/src/onnx.rs" | grep -oE '[0-9]+$')
    [ "$want" = "$have" ] || bad "opset_$k is $want in $SOMA and $have in cli/src/onnx.rs"
  done
  ok "the ONNX allowlist and opset range are one list in soma, the book and cli ($(echo "$soma_ops" | wc -l | tr -d ' ') operators)"
else
  ok "the ONNX allowlist is one list in soma and the book (no cli checkout beside web to compare)"
fi

# ---- 2b. GitHub is sign-in and nothing else ----------------------------------
# There is no repository per entry and no release per version, so nothing outside sign-in calls
# GitHub. `github_token` and `release_base` were the two vars that served the old contract; if
# either comes back, so has a dependency this platform deliberately removed.
for dead in github_token release_base; do
  if grep -q "^$dead" "$SOMA"; then
    bad "$SOMA declares $dead; GitHub is the sign-in identity only, and no task reads it"
  fi
done
ok "no GitHub var outside sign-in"

# ---- 3. the engine digest is derived, never typed ----------------------------
ed=$(var "$RUNNER" engine_digest)
case "$ed" in
  '"${KALAM_ENGINE_DIGEST'*)
    ok "engine_digest is the derived substitution, not a literal" ;;
  *sha256:*)
    bad "engine_digest is a literal ($ed) -- it must be \${KALAM_ENGINE_DIGEST}, derived from the vendored wasm. A pinned digest that disagrees makes the wave claim nothing, for ever" ;;
  *)
    bad "engine_digest is $ed -- expected \"\${KALAM_ENGINE_DIGEST}\"" ;;
esac

# ---- 4. neither unit is left unchecked ---------------------------------------
# An empty `public_keys` is not an error anywhere: the node loads whatever it is sent and says
# nothing. A posture that is on for one unit and off for the other is worse than off for both,
# because the unchecked node is the one nobody remembers.
for f in "$SOMA" "$RUNNER"; do
  keys=$(grep -A1 '^\[plugins\.trust\]' "$f" | grep '^public_keys' | cut -d= -f2- | tr -d ' ')
  case "$keys" in
    '[]'|'')
      bad "$f has no plugins.trust.public_keys -- that node verifies no signature and reports nothing about it" ;;
    *'${TB_TRUST_PUBLIC_KEY'*)
      # `${TB_TRUST_PUBLIC_KEY}` or `${TB_TRUST_PUBLIC_KEY:?why}` -- a reference either way, which
      # is the whole of what this asserts. The `:?` form additionally stops the boot, by name, when
      # a deployment forgot to set it.
      ok "$f trusts \${TB_TRUST_PUBLIC_KEY}" ;;
    *)
      bad "$f pins a literal trust key ($keys) -- it must be \${TB_TRUST_PUBLIC_KEY}, so a deployment sets its own from a secret store" ;;
  esac
done

# ---- 5. the admin plane is not open -------------------------------------------
# The same shape of silence as an empty trust list: the plane answers everyone and nothing says so.
for f in "$SOMA" "$RUNNER"; do
  if ! grep -q '^\[admin_auth\]' "$f"; then
    bad "$f has no [admin_auth] block -- its admin plane installs anything anyone asks it to"
  elif grep -A2 '^\[admin_auth\]' "$f" | grep -q '^enabled = true'; then
    ok "$f enables admin_auth"
  else
    bad "$f has [admin_auth] but does not enable it"
  fi
done

echo "==> the split itself"

# A shared `forbid` row makes the wave a fleet-wide singleton, so N-1 replicas idle while looking
# healthy.
if grep -q '^\[cluster\]' "$RUNNER"; then
  bad "$RUNNER has a [cluster] block -- a replica must be its own scheduler, or exactly one replica ever plays"
else
  ok "kalam has no [cluster] block"
fi

# Soma must be, for the mirror-image reason.
if grep -q '^\[cluster\]' "$SOMA"; then
  ok "soma is in cluster mode"
else
  bad "$SOMA has no [cluster] block -- the clocks are cluster-wide singletons only when the state database is shared"
fi

# A cluster may not migrate at boot; entrypoint.sh runs `migrate` as the deploy step.
if grep -qE '^[[:space:]]*auto_migrate[[:space:]]*=[[:space:]]*false' "$SOMA"; then
  ok "soma sets auto_migrate = false"
else
  bad "$SOMA must set auto_migrate = false -- cluster.enabled with auto_migrate is refused at startup"
fi

# The OUTER bound on a draining wave is shutdown_force_timeout_secs, not the cron key, because the
# cron worker is a supervised task. A force below the cron timeout silently caps the drain.
kf=$(var "$RUNNER" shutdown_force_timeout_secs); kf=${kf##*:-}; kf=${kf%\}}
kc=$(var "$RUNNER" shutdown_timeout_secs);       kc=${kc##*:-}; kc=${kc%\}}
if [ -n "$kf" ] && [ -n "$kc" ] && [ "$kf" -ge "$kc" ] 2>/dev/null; then
  ok "kalam drain: force ${kf}s >= cron ${kc}s, so the cron deadline is the one that bites"
else
  bad "kalam shutdown_force_timeout_secs (${kf:-?}) is below cron.shutdown_timeout_secs (${kc:-?}) -- the force key is the OUTER deadline, so the wave would be cut at ${kf:-?}s whatever cron says"
fi

echo "==> all three templates parse, and each image's package compiles"
# EACH TEMPLATE THROUGH ITS OWN IMAGE, because `validate-config` now checks the `[packages] apply`
# artifact too -- it must exist, and be a real promotion artifact. So this step compiles the package
# that image carries first, which makes it prove two things at once: the config parses AND the set
# in the image resolves. A `$sql` file the generator forgot to ship fails here.
#
# The variables are every one WITHOUT a default in any of the three, so a parse failure is about the
# file and not about this list. A reference in a COMMENT needs no value: since Orion 1.9.0
# substitution skips the file's comments.
# WHAT THE SET NEEDS, from its own package document -- the range `lint`, `compile` and `apply` all
# check a binary against. An image built before this range is not a failure of the config: it is an
# image that has not been rebuilt, and saying so is the difference between a five-second fix and a
# hunt through a TOML file.
requires_orion=$(sed -n 's/.*"orion"[^"]*"\([^"]*\)".*/\1/p' "$SOMA_DIR/shared/package.json" 2>/dev/null)
image_orion() { docker run --rm --entrypoint orion-server "$1" --version 2>/dev/null | head -1 | awk '{print $2}'; }

parse_with() {   # $1 the template, $2 the image, $3 the package dir in it, $4 the artifact path
  local f="$1" img="$2" pkg="$3" artifact="$4" have
  have=$(image_orion "$img")
  # A plain numeric compare on the minor, which is all these ranges have ever turned on.
  if [ -n "$have" ] && [ -n "$requires_orion" ]; then
    want=$(printf '%s' "$requires_orion" | sed -n 's/.*>=\([0-9]*\.[0-9]*\).*/\1/p')
    if [ -n "$want" ] && [ "$(printf '%s\n%s\n' "$want" "${have%.*}" | sort -V | head -1)" != "$want" ]; then
      skip "$f against $img: its orion-server is $have, and the package requires $requires_orion -- rebuild the image"
      return
    fi
  fi
  if docker run --rm --entrypoint sh \
       -e ORION_STATE_DB_URL=postgres://u:p@db:5432/orion_state \
       -e REDIS_URL=redis://redis:6379 \
       -e KALAM_ENGINE_DIGEST=sha256:0000000000000000000000000000000000000000000000000000000000000000 \
       -e R2_ENDPOINT=http://minio:9000 \
       -e RUNNER_ARCH=amd64 \
       -e RUNNER_KEY=tbr_00000000_0000000000000000000000000000000000000000000 \
       -e TB_TRUST_PUBLIC_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
       -e ORION_ADMIN_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
       -e PLUGIN_SIG_DIR=/tmp/sig \
       -e OAUTH_REDIRECT_URI='http://localhost:8080/v1/auth/{provider}/callback' \
       -e SOMA_AUTH_PROVIDERS='[{"slug":"github","label":"GitHub"}]' \
       -e SOMA_ARTIFACT="$artifact" -e KALAM_ARTIFACT="$artifact" \
       -v "$(cd "$(dirname "$f")" && pwd)/$(basename "$f"):/tmp/c.toml:ro" "$img" -c \
       "mkdir -p /tmp/sig && orion-server compile $pkg --version content -o $artifact \
        && orion-server -c /tmp/c.toml validate-config" > /dev/null 2>&1; then
    ok "$f parses, and $pkg compiles"
  else
    bad "$f does not parse, or $pkg does not compile -- run the same command without >/dev/null"
  fi
}

if command -v docker > /dev/null 2>&1 && docker image inspect "$SOMA_IMAGE" > /dev/null 2>&1; then
  parse_with "$SOMA" "$SOMA_IMAGE" /pkg/soma /tmp/soma.package.json
else
  skip "soma config parse (no docker, or no $SOMA_IMAGE: pull it, or point SOMA_IMAGE at a local build)"
fi
if command -v docker > /dev/null 2>&1 && docker image inspect "$KALAM_IMAGE" > /dev/null 2>&1; then
  for f in "$RUNNER"; do
    parse_with "$f" "$KALAM_IMAGE" /pkg/kalam /tmp/kalam.package.json
  done
else
  skip "kalam config parse (no docker, or no $KALAM_IMAGE: pull it, or point KALAM_IMAGE at a local build)"
fi

# ---- one engine, and every copy of it ---------------------------------------------------------
#
# Kalam used to vendor the cartridge, so two committed copies of one component existed and could
# drift -- and when they did NOTHING ERRORED: the ladder played a component ants does not ship, with
# a viewer built against the other. It happened once, from an edit that changed no behaviour at all.
#
# Every image fetches the cartridge's release when it builds -- the latest, unless ANTS_RELEASE names
# one -- so they agree only if they were built on the same side of every release since, and a copy
# that disagrees fails NOWHERE: Soma declares one engine and judges uploads with its component, a
# runner on another digest claims nothing, for ever, and a viewer on another draws a plausible match
# that never happened. So each copy is read out of the image the stacks actually run -- not a local
# build that happens to be lying around -- plus the one no image carries, the release ants-starter
# pins, which is what a competitor tests against:
#
#   soma     SOMA_IMAGE    /pkg/cartridge/engine-digest    what bootstrap declares, admission judges by
#   kalam    KALAM_IMAGE   the tb-ants component           what the runner plays
#   web      WEB_IMAGE     the book's viz/engine.json      what /docs re-simulates with; the app's viewer
#                                                          comes from the same release argument
#   book     DOCS_REF      the docs image, only when named
#   starter  ants-starter/games.toml, [games.ants] engine
engines=()
engine_of() {  # $1 label, $2 image, $3 how (component|file|json), $4 path in the image
  local d=""
  if ! docker image inspect "$2" > /dev/null 2>&1; then
    skip "engine: $1 ($2 is not here: pull or build it)"
    return 0
  fi
  case "$3" in
    component) d=$(docker run --rm --entrypoint sha256sum "$2" "$4" 2>/dev/null | cut -d' ' -f1) ;;
    file)      d=$(docker run --rm --entrypoint cat "$2" "$4" 2>/dev/null | tr -d '[:space:]'); d="${d#sha256:}" ;;
    json)      d=$(docker run --rm --entrypoint cat "$2" "$4" 2>/dev/null \
                   | sed -n 's/.*"engine_digest"[[:space:]]*:[[:space:]]*"sha256:\([0-9a-f]*\)".*/\1/p') ;;
  esac
  if [ -z "$d" ]; then
    skip "engine: $1 (could not read $4 out of $2)"
    return 0
  fi
  engines+=("$1|$2|$d")
}
if command -v docker > /dev/null 2>&1; then
  engine_of soma  "$SOMA_IMAGE"  file      /pkg/cartridge/engine-digest
  engine_of kalam "$KALAM_IMAGE" component /pkg/kalam/plugins/tb-ants/tb-ants.wasm
  engine_of web   "$WEB_IMAGE"   json      /usr/share/nginx/html/docs/viz/engine.json
  if [ -n "${DOCS_REF:-}" ]; then
    engine_of book "$DOCS_REF" json /artifacts/book/viz/engine.json
  fi
else
  skip "engine images (no docker)"
fi
STARTER_GAMES="${STARTER_GAMES:-$WEB_DIR/../ants-starter/games.toml}"
if [ -r "$STARTER_GAMES" ]; then
  st=$(awk '/^\[games\.ants\]/ { on = 1; next } /^\[/ { on = 0 } on && /^engine[[:space:]]*=/' "$STARTER_GAMES" \
       | sed -n 's/.*"sha256:\([0-9a-f]*\)".*/\1/p' | head -1)
  if [ -n "$st" ]; then
    engines+=("starter|$STARTER_GAMES|$st")
  else
    skip "engine: starter (no [games.ants] engine in $STARTER_GAMES)"
  fi
else
  skip "engine: starter ($STARTER_GAMES is not here)"
fi
# `${#engines[@]}` first: macOS's bash 3.2 calls an EMPTY array unbound under `set -u`.
if [ "${#engines[@]}" -gt 0 ]; then
  first="${engines[0]##*|}"
  agree=1
  for e in "${engines[@]}"; do [ "${e##*|}" = "$first" ] || agree=0; done
  if [ "$agree" = 1 ]; then
    who=""
    for e in "${engines[@]}"; do who="$who ${e%%|*}"; done
    ok "one engine in${who} (sha256:${first:0:12}...)"
  else
    bad "the stacks carry more than one engine -- a runner on another digest claims nothing, and a viewer on another draws matches the ladder never played"
    for e in "${engines[@]}"; do
      rest="${e#*|}"
      printf '         %-8s sha256:%s  %s\n' "${e%%|*}" "${e##*|}" "${rest%|*}" >&2
    done
    echo "       build or pin every image from one ants release, re-sign the plugins, and move the starter's block to it" >&2
  fi
  if [ -n "${ANTS_RELEASE:-}" ]; then
    want="${ANTS_RELEASE#engine-}"; want="${want%%-*}"
    case "$first" in
      "$want"*) ok "that engine is the one ANTS_RELEASE=$ANTS_RELEASE names" ;;
      *) bad "the engine is sha256:${first:0:12}..., not the one ANTS_RELEASE=$ANTS_RELEASE names" ;;
    esac
  fi
fi

# ---- every engine the stacks carry is one the site keeps a viewer for ---------------------------
#
# A replay is drawn by the viewer of the engine that played it, and the image keeps the current one
# plus every release in cartridges.json's `engines`. The current one needs no entry TODAY, which is
# exactly why it is forgotten: the day the next release becomes the latest, every match it played is
# refused by the site, with no error anywhere else. So each engine the stacks play must be listed.
if command -v node > /dev/null 2>&1 && [ -r "$WEB_DIR/cartridges.json" ]; then
  listed=$(node -e 'console.log((require(process.argv[1]).games.ants.engines || []).join(" "))' "$(cd "$WEB_DIR" && pwd)/cartridges.json")
  unlisted=""
  # `${#engines[@]}` first, as above.
  if [ "${#engines[@]}" -gt 0 ]; then
    for e in "${engines[@]}"; do
      tag="engine-$(printf '%s' "${e##*|}" | cut -c1-12)"
      case " $listed $unlisted " in *" $tag "*) ;; *) unlisted="$unlisted $tag" ;; esac
    done
  fi
  if [ -z "$unlisted" ]; then
    ok "every engine the stacks carry is in cartridges.json's engines, so its replays keep drawing"
  else
    bad "cartridges.json's engines lacks${unlisted} -- once a newer release is the latest, the site refuses every replay it played"
  fi
else
  skip "engines kept by the site (no node, or no $WEB_DIR/cartridges.json)"
fi

# ---- 5. one tag vocabulary across both packages ------------------------------
#
# `?tag=` is a single exact string: no prefix, no wildcard, no AND. So a domain is only worth
# having if it means the same thing whichever node is asked -- `?tag=matches` on Soma and on a
# runner have to be the same question. Each package declares the closed list in its own
# check-names.sh, because that is where it is enforced; this is the only place they meet.
dom() { sed -n '/^DOMAINS = {/,/}/p' "$1" | tr -d ' \n' | sed 's/DOMAINS={//; s/}.*//' \
          | tr ',' '\n' | tr -d '"' | sed '/^$/d' | sort | tr '\n' ' '; }
ds=$(dom "$SOMA_DIR/scripts/check-names.sh")
dk=$(dom "$KALAM_DIR/scripts/check-names.sh")
if [ -z "$ds" ] || [ -z "$dk" ]; then
  bad "could not read the DOMAINS vocabulary from one of the check-names.sh scripts -- the two packages' tags are then unchecked against each other"
elif [ "$ds" = "$dk" ]; then
  ok "soma and kalam tag from one domain vocabulary ($(echo $ds | wc -w | tr -d ' ') domains)"
else
  bad "the domain vocabularies differ -- soma has [$ds] and kalam has [$dk], so the same ?tag= asks two different questions"
fi

if [ "$fail" -eq 0 ]; then
  echo "==> configs agree"
else
  echo "==> CONFIGS DISAGREE" >&2
fi
exit "$fail"
