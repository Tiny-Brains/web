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
SOMA="$SOMA_DIR/docker/soma.toml.tmpl"
# THE db-MODE REPLICA'S TEMPLATE, which no image and no compose file runs any more. It is kept in kalam,
# and still checked, because the package keeps its `db` branch until db mode is removed -- and a rollback
# to a config nobody kept in step is not a rollback.
KALAM="$KALAM_DIR/docker/replica-db.toml.tmpl"
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
KALAM_IMAGE="${KALAM_IMAGE:-$(envfile "$KALAM_DIR/.env" KALAM_IMAGE)}"
KALAM_IMAGE="${KALAM_IMAGE:-ghcr.io/tiny-brains/kalam:latest}"
SOMA_IMAGE="${SOMA_IMAGE:-$(envfile "$WEB_DIR/.env" SOMA_IMAGE)}"
SOMA_IMAGE="${SOMA_IMAGE:-ghcr.io/tiny-brains/soma:latest}"
# web's compose default: the checkout, built. A published tag here is the image the stack serves.
WEB_IMAGE="${WEB_IMAGE:-$(envfile "$WEB_DIR/.env" WEB_IMAGE)}"
WEB_IMAGE="${WEB_IMAGE:-tinybrains/web:dev}"

ok()   { printf '  ok    %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1" >&2; fail=1; }
skip() { printf '  skip  %s\n' "$1"; }
# A deployment property this repository cannot decide, but can refuse to let pass silently.
note() { printf '  note  %s\n' "$1"; }

for f in "$SOMA" "$KALAM" "$RUNNER"; do
  [ -r "$f" ] || { echo "missing $f" >&2; exit 1; }
done

# A [vars] scalar, as written. Not a TOML parse: these are templates with ${NAME:-default} in them,
# which no TOML reader accepts until orion-server has expanded them.
var() {  # $1 file, $2 key
  sed -n "s/^[[:space:]]*$2[[:space:]]*=[[:space:]]*\(.*\)$/\1/p" "$1" \
    | head -1 | sed 's/[[:space:]]*#.*$//' | sed 's/[[:space:]]*$//'
}

echo "==> values that must agree across the split"

# ---- 1. the forfeit rule -----------------------------------------------------
# THIS USED TO BE AN EQUALITY and is now an absence, which is the stronger check. The ceiling is
# pinned onto matches.strike_ceiling by pair and read from the row by both the wave that applies it
# and the clock that judges its result, so there is no longer a second copy to keep in step. A
# `strike_ceiling` reappearing in Kalam's config is dead config that a future edit would wire back
# up, recreating exactly the hazard the column removed.
fs=$(var "$SOMA" forfeit_strikes)
sc=$(var "$KALAM" strike_ceiling)
if [ -z "$fs" ]; then
  bad "forfeit_strikes is missing from $SOMA -- it is pair's fallback when a season declares none, and matches.strike_ceiling is NOT NULL"
elif [ -n "$sc" ]; then
  bad "$KALAM still sets strike_ceiling = $sc -- Kalam reads the ceiling off the match row now, and a second copy is what the column exists to prevent"
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
mp_k=$(var "$KALAM" model_prefix)
if [ -z "$mp_s" ] || [ -z "$mp_k" ]; then
  bad "model_prefix is missing from one of the templates -- it is what makes a version id a model id"
elif [ "$mp_s" != "$mp_k" ]; then
  bad "model_prefix = $mp_s in $SOMA but $mp_k in $KALAM -- a replica would register models under names no match row names"
else
  ok "model_prefix = $mp_s in both"
fi

aom=$(var "$SOMA" adapter_ops_max)
obg=$(var "$KALAM" ops_budget)
if [ -z "$obg" ]; then
  bad "$KALAM sets no engine.ops_budget -- an adapter would be priced at admission and unpriced at play"
elif [ -n "$aom" ] && [ "$aom" != "$obg" ]; then
  bad "adapter_ops_max = $aom in $SOMA but engine.ops_budget = $obg in $KALAM -- admitted under one ceiling, struck under another"
else
  ok "engine.ops_budget = $obg on the replica, and the cartridge's manifest carries the same number for admission"
fi

ov_s=$(var "$SOMA" orion_version)
ov_k=$(var "$KALAM" orion_version)
if [ -z "$ov_s" ] || [ -z "$ov_k" ]; then
  bad "orion_version is missing from one of the templates -- a sweep is per Orion upgrade"
elif [ "$ov_s" != "$ov_k" ]; then
  bad "orion_version = $ov_s in $SOMA but $ov_k in $KALAM -- a match recorded against one Orion and admitted against another"
else
  ok "orion_version = $ov_s in both"
fi

# ---- 1c. the execution contract, while it lives in two files ------------------
#
# The gate SENDS these on the claim (soma-runner-claim) and a db-mode replica still
# reads its own copies, so for as long as both exist they must agree -- a runner playing 1000-turn
# matches beside a replica playing 500-turn ones rates two different games onto one ladder.
#
# THIS CHECK IS TEMPORARY BY DESIGN. When the runner conversion lands and no replica holds
# KALAM_DB_URL, the kalam copies go and this block goes with them: a value sent from the one place
# that owns it needs no equality assertion, which is the whole argument for putting it on the claim.
# Until then the gate's copy is the authority and the replica's is the fallback.
for k in turn_ms max_turns lease_seconds renew_every_n_turns refusal_ceiling refusal_grace_secs replay_prefix; do
  v_s=$(var "$SOMA" "$k")
  v_k=$(var "$KALAM" "$k")
  if [ -z "$v_s" ]; then
    bad "$k is missing from $SOMA -- the runner routes read it, and without it every claim that finds a row is a 500"
  elif [ -n "$v_k" ] && [ "$v_s" != "$v_k" ]; then
    bad "$k = $v_s in $SOMA but $v_k in $KALAM -- the gate would send one number and a db-mode replica play by another"
  else
    ok "$k = $v_s in both"
  fi
done

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
if kmax and top > int(kmax):
    print(f"FAIL limits.boards allows {top} seats, above kalam constants.seats {kmax}: a board that wide is paired and never claimed")
else:
    print(f"OK limits.boards: {b['players'][0]}-{top} seats, sides {b['sides'][0]}-{b['sides'][1]}, "
          f"at most {b['cells_max']} cells" + (f"; kalam constants.seats {kmax} seats them all" if kmax else ""))
PYEOF
)
  while IFS= read -r line; do
    case "$line" in
      FAIL\ *) bad "${line#FAIL }" ;;
      OK\ *) ok "${line#OK }" ;;
    esac
  done <<< "$env_out"
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
  api_url=$(grep -oE 'SOMA_URL=[^ ]*' "$KALAM_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)
  case "${KALAM_API_URL:-${api_url:-http://soma:8080}}" in
    http://soma:*|http://localhost:*|http://127.0.0.1:*|http://host.docker.internal:*)
      # host.docker.internal is how kalam's docker-compose.yml is rehearsed against a local stack:
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

# The mode a replica runs in decides which of the two credential sets it must hold, and holding
# neither is the failure that looks like an idle fleet.
km=$(var "$KALAM" mode)
case "$km" in
  *api*) ok "kalam runs in api mode: the eight statements are the gate's, and this node holds no database URL" ;;
  *db*)  ok "kalam runs in db mode: KALAM_DB_URL is required and the gate is unused" ;;
  *)     bad "$KALAM sets no mode -- it must be db or api" ;;
esac

# ---- 1f. the credentials a runner is allowed to hold --------------------------
#
# The point of the whole track is what a replica does NOT hold, so it is worth asserting rather
# than believing. An `api`-mode replica must reach the object store with a key that can only read
# `models/*`; if it is handed the deployment's own R2 key instead, everything works and the
# property is silently gone -- which is the failure mode this repo is most careful about.
mrk=$(var "$KALAM" models_bucket_connector)
if [ -n "${MODELS_READ_ACCESS_KEY:-}" ] && [ "${MODELS_READ_ACCESS_KEY:-}" = "${R2_ACCESS_KEY:-}" ]; then
  bad "MODELS_READ_ACCESS_KEY is the deployment's own R2 key -- a runner would hold a credential that can write. scripts/setup/init.sh mints the narrow one and the buckets one-shot creates it"
else
  ok "the runner's object-store key is not the deployment's write key"
fi

# The gate's own role. The eight machine-facing routes run as `runner_gate` and the five admin ones
# as the owner, and that split is what keeps the gate confined to its column grants. A deployment that leaves RUNNER_GATE_DB_URL unset runs them all as the owner again,
# which works perfectly and quietly undoes the boundary.
if [ -z "${RUNNER_GATE_DB_URL:-}" ] && ! grep -q "RUNNER_GATE_DB_URL" "$WEB_DIR/docker-compose.yml" 2>/dev/null; then
  bad "no RUNNER_GATE_DB_URL -- the runner routes would fall back to the owner connector and the column grant would stop being what confines them"
else
  ok "the machine-facing runner routes have a role of their own"
fi

# The models entity is ON on every runner and OFF on Soma. A runner plays models, and admits them
# when its role is `admit`; off there is a stack that looks healthy and admits or plays nothing. Soma
# runs none: the node that serves the site and holds the database owner never parses a competitor's
# ONNX, and [models] on there would be a model runtime nothing should be using.
for f in "$KALAM" "$RUNNER"; do
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
mp=$(var "$RUNNER" max_probe_ms)
case "$mp" in
  ''|*[!0-9]*) bad "$(basename "$RUNNER") does not pin models.max_probe_ms -- admission's one timing gate would be Orion's default, unseen" ;;
  *)           ok "$(basename "$RUNNER") pins admission's probe at max_probe_ms $mp" ;;
esac

# THE REFERENCE OBSERVATIONS AN ADMISSION PLAYS. Soma's claim sends admit_observations of them and
# kalam's tb-admit plays one a sweep up to ADMIT_LOOP_MAX. More sent than the loop holds is a run that
# stops at its loop's end before it reports -- every submission's lease lapses and it expires
# TIMED_OUT with every runner healthy.
ao=$(var "$SOMA" admit_observations)
alm=$(python3 -c "import json;print(json.load(open('$KALAM_DIR/workflows/tb-admit-run.json'))['loop']['max'])" 2>/dev/null)
if [ -z "$ao" ] || [ -z "$alm" ]; then
  bad "could not read soma's admit_observations or tb-admit-run's loop.max -- an admission's length is unchecked"
elif [ "$ao" -le "$alm" ]; then
  ok "an admission's observations ($ao) fit kalam's tb-admit loop ($alm sweeps)"
else
  bad "soma sends $ao reference observations but kalam's tb-admit loop plays $alm -- no admission would ever report"
fi

# ---- 1g. the runner template is a runner, and cannot be talked out of it -------
#
# runner.toml.tmpl exists to hold LESS than kalam.toml.tmpl, and every one of these is a thing that
# would work if it crept back in -- and quietly undo the reason the file exists.
rmode=$(var "$RUNNER" mode)
if [ "$rmode" = '"api"' ]; then
  ok "the runner's mode is the literal api -- it cannot be configured into holding a database URL"
else
  bad "$RUNNER sets mode = $rmode; it must be the literal \"api\". A runner that can be switched to db mode is a runner that can be handed a connection string"
fi

# THE SEVEN NUMBERS A MATCH IS PLAYED UNDER. They arrive on the claim, from the season that owns the
# match. One of them present here is a value an operator will eventually tune, and
# then the runner plays a season by numbers the season did not set -- with nothing to see, because
# both halves work.
creep=""
for k in turn_ms max_turns lease_seconds renew_every_n_turns replay_prefix model_prefix blob_endpoint; do
  [ -n "$(var "$RUNNER" "$k")" ] && creep="$creep $k"
done
if [ -n "$creep" ]; then
  bad "$RUNNER carries$creep -- in api mode these arrive on the claim and a local copy is one the season cannot correct"
else
  ok "the runner carries none of the seven contract values: every one arrives on the claim"
fi

# `arch` answers "what is that machine" on the Runners screen and is the one field whose whole
# value is being true. A literal is a label that lies in exactly the situation the screen exists for
# -- and it did: every replica on this arm64 laptop reported amd64 until this was derived.
for f in "$KALAM" "$RUNNER"; do
  a=$(var "$f" arch)
  case "$a" in
    *RUNNER_ARCH*) ok "$(basename "$f") derives arch from the machine" ;;
    *)             bad "$(basename "$f") sets arch = $a -- derive it from uname (entrypoint.sh does), or the Runners screen reports the architecture someone typed" ;;
  esac
done

# A runner is not in a cluster and must never be: a shared `forbid` row would make the match clock a
# fleet-wide singleton, so exactly one machine would ever play while the rest polled a held row
# looking perfectly healthy. Same assertion as for a replica, and it matters more out here.
for f in "$KALAM" "$RUNNER"; do
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
  for f in "$KALAM" "$RUNNER"; do
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
loop_max=$(python3 -c "import json;print(json.load(open('$KALAM_DIR/workflows/tb-match-run.json'))['loop']['max'])" 2>/dev/null)
if [ -z "$turns_max" ] || [ -z "$loop_max" ]; then
  note "could not read execution.max_turns's ceiling (soma migration) or tb-match-run's loop.max -- a season's match length is unchecked"
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
  for f in "$KALAM" "$RUNNER"; do
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
    for f in "$KALAM" "$RUNNER"; do
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
gate_be=$(grep -oE 'RUNNER_BLOB_ENDPOINT:-[^}]*' "$WEB_DIR/docker-compose.yml" 2>/dev/null | head -1 | sed 's/^RUNNER_BLOB_ENDPOINT:-//')
# `kalam-blobs-put` names `env://RUNNER_BLOB_ENDPOINT` in the committed connector, so what this
# reads is the variable kalam's compose supplies under that name -- the same name Soma signs under.
# Before Orion 1.9.0 an http connector's `url` could not be a reference and the loader staged it in
# from R2_ENDPOINT, which is why the two sides used to have different names for one address.
run_be=$(grep -oE 'RUNNER_BLOB_ENDPOINT: \$\{[A-Z_]+' "$KALAM_DIR/docker-compose.yml" 2>/dev/null | head -1 | sed 's/.*{//')
if ! grep -q 'env://RUNNER_BLOB_ENDPOINT' "$KALAM_DIR/connectors/kalam-blobs-put.json" 2>/dev/null; then
  bad "kalam-blobs-put does not name env://RUNNER_BLOB_ENDPOINT -- the runner would PUT to an address the gate did not sign for"
elif [ -z "$run_be" ]; then
  bad "kalam's docker-compose.yml does not set RUNNER_BLOB_ENDPOINT -- kalam-blobs-put resolves nothing and the connector is skipped"
elif [ "$run_be" = "RUNNER_BLOB_ENDPOINT" ]; then
  ok "the runner PUTs a replay to the endpoint the gate signs for (both read RUNNER_BLOB_ENDPOINT)"
else
  note "the runner's replay base comes from \$$run_be while the gate signs for ${gate_be:-RUNNER_BLOB_ENDPOINT} -- a deployment must make these the same string"
fi

# ---- 2. the rating prior -----------------------------------------------------
# Both readers are in soma.toml.tmpl today; this compares against kalam.toml.tmpl only if it ever
# grows a copy, so the day it matters the check already exists.
for k in prior_mu prior_sigma; do
  a=$(var "$SOMA" "$k"); b=$(var "$KALAM" "$k")
  if [ -z "$a" ]; then
    bad "$k is missing from $SOMA"
  elif [ -n "$b" ] && [ "$a" != "$b" ]; then
    bad "$k = $a in $SOMA but $b in $KALAM -- two priors on one ladder"
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
ed=$(var "$KALAM" engine_digest)
case "$ed" in
  '"${KALAM_ENGINE_DIGEST}"')
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
for f in "$SOMA" "$KALAM"; do
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
for f in "$SOMA" "$KALAM"; do
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
if grep -q '^\[cluster\]' "$KALAM"; then
  bad "$KALAM has a [cluster] block -- a replica must be its own scheduler, or exactly one replica ever plays"
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
kf=$(var "$KALAM" shutdown_force_timeout_secs); kf=${kf##*:-}; kf=${kf%\}}
kc=$(var "$KALAM" shutdown_timeout_secs);       kc=${kc##*:-}; kc=${kc%\}}
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
  for f in "$KALAM" "$RUNNER"; do
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

if [ "$fail" -eq 0 ]; then
  echo "==> configs agree"
else
  echo "==> CONFIGS DISAGREE" >&2
fi
exit "$fail"
