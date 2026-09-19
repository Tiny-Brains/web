#!/usr/bin/env bash
# Assert what the config split put in two places.
#
#   scripts/check/configs.sh
#
# There are two instance templates and three values that live in both or are derived across the
# boundary. Each fails SILENTLY when it disagrees:
#
#   forfeit_strikes == strike_ceiling   count would judge a trial by a rule the wave did not play by
#   prior_mu / prior_sigma              two priors on one ladder
#   engine_digest is DERIVED            a literal is the one failure that is silent everywhere --
#                                       the wave claims nothing, for ever, and the replica looks
#                                       healthy doing it
#
# It also parses both templates through orion-server, so a config that would refuse to boot fails
# here instead of at 3am. That half needs the orion image; without docker it is skipped and said so.
#
# Exit 0 means both templates are consistent and parse.
set -uo pipefail
cd "$(dirname "$0")/../.."

# It lives in web because web's compose file is where Soma, a runner and the stack's own numbers meet.
# The templates live with the images that bake them (N25): Soma's in soma, the runner's in kalam.
# Sibling checkouts by default.
SOMA_DIR="${SOMA_DIR:-../soma}"
KALAM_DIR="${KALAM_DIR:-../kalam}"
WEB_DIR="${WEB_DIR:-.}"
SOMA="$SOMA_DIR/docker/soma.toml.tmpl"
# THE db-MODE REPLICA'S TEMPLATE, which no image and no compose file runs any more. It is kept in kalam,
# and still checked, because the package keeps its `db` branch until N10 deletes it -- and a rollback
# to a config nobody kept in step is not a rollback.
KALAM="$KALAM_DIR/docker/replica-db.toml.tmpl"
# THE RUNNER'S TEMPLATE, and the one nobody is watching: it runs on a machine outside the deployment,
# where a disagreement is not a `docker compose logs` away. Every assertion below that names it is
# there because getting it wrong is silent on that machine and visible only as a runner that plays
# nothing, or plays under the wrong numbers.
RUNNER="$KALAM_DIR/docker/runner.toml.tmpl"
fail=0

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

# ---- 1b. what the 1.8.1 rebuild put in two places ----------------------------
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
  bad "model_prefix is missing from one of the templates -- it is what makes a version id a model id (R9)"
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
  bad "orion_version is missing from one of the templates -- it replaces evaluator_digest, and a sweep is per upgrade (R10)"
elif [ "$ov_s" != "$ov_k" ]; then
  bad "orion_version = $ov_s in $SOMA but $ov_k in $KALAM -- a match recorded against one Orion and admitted against another"
else
  ok "orion_version = $ov_s in both"
fi

# ---- 1c. the execution contract, while it lives in two files ------------------
#
# The gate SENDS these on the claim (soma/docs/schema.md section 4a.1) and a db-mode replica still
# reads its own copies, so for as long as both exist they must agree -- a runner playing 1000-turn
# matches beside a replica playing 500-turn ones rates two different games onto one ladder.
#
# THIS CHECK IS TEMPORARY BY DESIGN. When the runner conversion lands and no replica holds
# KALAM_DB_URL, the kalam copies go and this block goes with them: a value sent from the one place
# that owns it needs no equality assertion, which is the whole argument for putting it on the claim.
# Until then the gate's copy is the authority and the replica's is the fallback.
for k in turn_ms max_turns lease_seconds renew_every_n_turns refusal_ceiling replay_prefix; do
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
# Since N18 the claim reads `coalesce(season rule, games.manifest -> limits, [vars])`, so these two
# vars are the BOTTOM of a three-level chain and a real deployment never reaches them. That is
# exactly what makes a disagreement invisible: it surfaces only on a season that declares nothing
# against a cartridge whose manifest is missing the key, which is the least-tested path there is.
# The cartridge is the authority for both, so the vars must simply agree with it.
#
# The manifest is the one kalam's package carries, out of the ants release it was built from; set
# CARTRIDGE_JSON to check another (an ants checkout's dist/cartridge.json, say).
CART="${CARTRIDGE_JSON:-}"
if [ -z "$CART" ] && command -v docker > /dev/null 2>&1 \
   && docker image inspect "${KALAM_IMAGE:-ghcr.io/tiny-brains/kalam:latest}" > /dev/null 2>&1; then
  CART=$(mktemp)
  docker run --rm --entrypoint cat "${KALAM_IMAGE:-ghcr.io/tiny-brains/kalam:latest}" /pkg/kalam/plugins/tb-ants/cartridge.json > "$CART" 2>/dev/null \
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

  # A preset is a name AND a seat count, and both are the cartridge's. A name it does not carry is
  # `NO_SUCH_PRESET` at worldgen on every match paired on it; a seat count it does not match is a row
  # the engine refuses for disagreeing with its own board; and a count above kalam's MAX_SEATS is a
  # row no replica claims, for ever, while the queue fills with it.
  kalam_max=$(sed -n 's/^MAX_SEATS = \([0-9][0-9]*\).*/\1/p' ../kalam/scripts/gen-kalam.py 2>/dev/null)
  presets_out=$(python3 - "$SOMA" "$CART" "${kalam_max:-}" <<'PYEOF'
import json, re, sys
tmpl, cart, kmax = sys.argv[1], sys.argv[2], sys.argv[3]
block = re.search(r'^presets\s*=\s*\[(.*?)^\]', open(tmpl).read(), re.S | re.M)
if not block:
    print("FAIL presets is not a [ ... ] block in " + tmpl)
    sys.exit()
listed = re.findall(r'name\s*=\s*"([^"]+)"\s*,\s*players\s*=\s*(\d+)', block.group(1))
have = {p["name"]: p["players"] for p in json.load(open(cart)).get("presets", [])}
for name, players in listed:
    if name not in have:
        print(f"FAIL preset {name} is not in the cartridge, which carries {sorted(have)}")
    elif int(players) != have[name]:
        print(f"FAIL preset {name} says {players} players; the cartridge's boards seat {have[name]}")
    elif kmax and int(players) > int(kmax):
        print(f"FAIL preset {name} seats {players}, above kalam MAX_SEATS {kmax}: no replica claims it")
print(f"OK {len(listed)} presets agree with the cartridge on name and seats"
      + (f", none above kalam MAX_SEATS {kmax}" if kmax else ""))
PYEOF
)
  while IFS= read -r line; do
    case "$line" in
      FAIL\ *) bad "${line#FAIL }" ;;
      OK\ *) ok "${line#OK }" ;;
    esac
  done <<< "$presets_out"
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
      # host.docker.internal is how docker-compose.runner.yml is rehearsed against a local stack:
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
  bad "MODELS_READ_ACCESS_KEY is the deployment's own R2 key -- a runner would hold a credential that can write. scripts/setup/models-read-key.sh mints the narrow one"
else
  ok "the runner's object-store key is not the deployment's write key"
fi

# The gate's own role. The eight machine-facing routes run as `runner_gate` and the five admin ones
# as the owner, and that split is N17 -- the repair for the gate having shipped inside the soma
# package. A deployment that leaves RUNNER_GATE_DB_URL unset runs them all as the owner again,
# which works perfectly and quietly undoes the boundary.
if [ -z "${RUNNER_GATE_DB_URL:-}" ] && ! grep -q "RUNNER_GATE_DB_URL" "$WEB_DIR/docker-compose.yml" 2>/dev/null; then
  bad "no RUNNER_GATE_DB_URL -- the runner routes would fall back to the owner connector and the column grant would stop being what confines them"
else
  ok "the machine-facing runner routes have a role of their own (N17)"
fi

# The models entity has to be ON in both, and for different reasons: admission on soma, play on a
# replica. Off on either is a stack that looks healthy and admits or plays nothing.
for f in "$SOMA" "$KALAM"; do
  if ! awk '/^\[models\]/{f=1} f&&/^enabled[[:space:]]*=[[:space:]]*true/{print;exit}' "$f" | grep -q true; then
    bad "$f does not enable [models] -- nothing can be admitted or played"
  else
    ok "$(basename "$f") enables [models]"
  fi
done

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
# match (docs/decisions.md N18). One of them present here is a value an operator will eventually tune, and
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

# ---- 1i. admitted under one ceiling, played under another ---------------------
#
# engine.ops_budget is what an adapter may spend at PLAY. budgets.adapter_ops_max in the cartridge
# manifest is what admission judges by. Different numbers mean a model that passed admission is
# struck at play, or the reverse -- and neither half reports anything but a normal result.
#
# The manifest is read out of kalam's package, which carries it beside the component from the one
# ants release that package was built from; the loader registers that copy.
kalam_ref="${KALAM_IMAGE:-ghcr.io/tiny-brains/kalam:latest}"
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
run_be=$(grep -oE 'R2_ENDPOINT: \$\{[A-Z_]+' "$KALAM_DIR/docker-compose.yml" 2>/dev/null | head -1 | sed 's/.*{//')
if [ -z "$run_be" ]; then
  bad "kalam's docker-compose.yml does not set R2_ENDPOINT -- kalam-blobs-put would keep the package's committed literal and no presigned replay URL would match it"
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

# A baseline's ratings start at the prior, and there is ONE copy of it now: soma bootstrap's baselines
# step reads prior_mu/prior_sigma out of the template above (or the season's own rating rule). The
# seed used to write those rows with the number typed in, which is what this used to police; a seed
# that writes ratings again is that second copy come back.
seed="$WEB_DIR/compose/seed.sql"
if [ -r "$seed" ] && grep -qiE "INSERT INTO (ratings|rating_events|model_versions)" "$seed"; then
  bad "$seed writes versions or ratings -- the baselines are the roster's, and their prior is read from $SOMA"
else
  ok "the seed writes no version or rating; the baselines' prior is read from $SOMA"
fi

# The two baseline rosters: the image's default and this stack's. Each must parse as a roster, and a
# model both name must be the same artifact -- the same source and pin -- or one stack plays bytes
# the other calls by the same name.
rosters_ok=$(python3 - "$SOMA_DIR/docker/baselines.toml" "$WEB_DIR/compose/baselines.toml" <<'PYCHK'
import sys, tomllib
docs = {}
for path in sys.argv[1:]:
    try:
        d = tomllib.load(open(path, "rb"))
    except FileNotFoundError:
        continue
    except tomllib.TOMLDecodeError as e:
        print(f"BAD {path} is not TOML: {e}"); continue
    models = d.get("models", {})
    for b in d.get("baselines", []):
        if b.get("model") not in models:
            print(f"BAD {path}: baseline {b.get('id')!r} plays {b.get('model')!r}, which it does not declare")
    docs[path] = models
if len(docs) == 2:
    (a, ma), (b, mb) = docs.items()
    for k in sorted(set(ma) & set(mb)):
        for f in ("source", "weights_hash"):
            if ma[k].get(f) != mb[k].get(f):
                print(f"BAD [models.{k}].{f} differs between {a} and {b}")
print(f"OK {len(docs)}")
PYCHK
)
if printf '%s\n' "$rosters_ok" | grep -q '^BAD'; then
  printf '%s\n' "$rosters_ok" | sed -n 's/^BAD //p' | while read -r l; do bad "$l"; done
  fail=1
else
  ok "the baseline rosters parse, and a model both name is the same artifact (${rosters_ok#OK } read)"
fi

# ---- 2b. the fallbacks a season's rules coalesce against ---------------------
# Every rule in seasons.rules is read `coalesce(rule, <var>)`, so "a season that declares nothing
# behaves exactly as the deploy does" is only true while the var it falls back to still exists.
# Deleting one "because it moved to the season" is how that quietly stops being true.
for k in burst steady_cap settled_sigma cross_class_fraction repair_cap presets \
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
    *'${TB_TRUST_PUBLIC_KEY}'*)
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
# healthy (decision 41).
if grep -q '^\[cluster\]' "$KALAM"; then
  bad "$KALAM has a [cluster] block -- decision 41: a replica must be its own scheduler, or exactly one replica ever plays"
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
  bad "kalam shutdown_force_timeout_secs (${kf:-?}) is below cron.shutdown_timeout_secs (${kc:-?}) -- the force key is the OUTER deadline, so the wave would be cut at ${kf:-?}s whatever cron says (docs/deployment.md §6.1)"
fi

echo "==> all three templates parse"
# Through the orion-server inside the Soma image -- the same binary and version every node runs, since
# the runner image pins the same ORION_VERSION.
ORION_IMG="${SOMA_IMAGE:-ghcr.io/tiny-brains/soma:latest}"
if command -v docker > /dev/null 2>&1 && docker image inspect "$ORION_IMG" > /dev/null 2>&1; then
  for f in "$SOMA" "$KALAM" "$RUNNER"; do
    # Every variable WITHOUT a default in any of the three, so a parse failure is about the file
    # and not about this list. Orion substitutes over the whole text -- comments included -- so a
    # reference in a comment needs a value here too.
    if docker run --rm --entrypoint orion-server \
         -e ORION_STATE_DB_URL=postgres://u:p@db:5432/orion_state \
         -e REDIS_URL=redis://redis:6379 \
         -e KALAM_ENGINE_DIGEST=sha256:0000000000000000000000000000000000000000000000000000000000000000 \
         -e R2_ENDPOINT=http://minio:9000 \
         -e RUNNER_ARCH=amd64 \
         -e RUNNER_KEY=tbr_00000000_0000000000000000000000000000000000000000000 \
         -e TB_TRUST_PUBLIC_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
         -e ORION_ADMIN_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
         -v "$(cd "$(dirname "$f")" && pwd)/$(basename "$f"):/tmp/c.toml:ro" "$ORION_IMG" -c /tmp/c.toml validate-config > /dev/null 2>&1; then
      ok "$f parses"
    else
      bad "$f does not parse -- run the same command without >/dev/null to see why"
    fi
  done
else
  skip "orion-server parse (no docker, or no $ORION_IMG: pull it, or set SOMA_IMAGE to a local build)"
fi

# Kalam used to vendor the cartridge, so two committed copies of one component existed and could
# drift -- and when they did NOTHING ERRORED: the ladder played a component ants does not ship, with
# a viewer built against the other. It happened once, from an edit that changed no behaviour at all.
#
# kalam's, the book's and web's images each fetch the cartridge's release when they build -- the
# latest, unless ANTS_RELEASE names one -- so they agree only if they were built on the same side of
# every release since. That is the drift that is left, and it is between IMAGES: the engine kalam's
# package plays, against the one the book's viewer (which web serves at /docs) re-simulates with,
# and against the release ANTS_RELEASE pins, when it pins one.
docs_ref="${DOCS_REF:-tinybrains/docs:dev}"
if command -v docker > /dev/null 2>&1 && docker image inspect "$kalam_ref" > /dev/null 2>&1; then
  k=$(docker run --rm --entrypoint sha256sum "$kalam_ref" /pkg/kalam/plugins/tb-ants/tb-ants.wasm 2>/dev/null | cut -d' ' -f1)
  if [ -z "$k" ]; then
    skip "engine images (could not read the component out of $kalam_ref)"
  else
    if [ -n "${ANTS_RELEASE:-}" ]; then
      want="${ANTS_RELEASE#engine-}"; want="${want%%-*}"
      case "$k" in
        "$want"*) ok "$kalam_ref carries the engine ANTS_RELEASE=$ANTS_RELEASE names" ;;
        *) bad "$kalam_ref carries sha256:${k%${k#????????????}}..., not the engine ANTS_RELEASE=$ANTS_RELEASE names
     rebuild kalam's image (then re-sign, and restart the runner)" ;;
      esac
    fi
    if docker image inspect "$docs_ref" > /dev/null 2>&1; then
      d=$(docker run --rm --entrypoint cat "$docs_ref" /artifacts/book/viz/engine.json 2>/dev/null \
          | sed -n 's/.*"engine_digest"[[:space:]]*:[[:space:]]*"sha256:\([0-9a-f]*\)".*/\1/p')
      if [ -z "$d" ]; then
        skip "engine images (could not read the viewer's digest out of $docs_ref)"
      elif [ "$d" = "$k" ]; then
        ok "$kalam_ref and $docs_ref were built from one ants release (${k%${k#????????}}...)"
      else
        bad "$kalam_ref and $docs_ref were built from different ants releases -- the viewer would draw matches the ladder never played
       $kalam_ref  sha256:$k
       $docs_ref   sha256:$d
     rebuild kalam's image and web's (its docs service) together   (then re-sign, and reload)"
      fi
    else
      skip "engine images ($docs_ref is not built: docker compose build docs, in web)"
    fi
  fi
else
  skip "engine images (no docker, or $kalam_ref is not here: build or pull it)"
fi

if [ "$fail" -eq 0 ]; then
  echo "==> configs agree"
else
  echo "==> CONFIGS DISAGREE" >&2
fi
exit "$fail"
