#!/usr/bin/env bash
# Sign every plugin component this stack, and a runner playing for it, will load.
#
#   scripts/setup/sign-plugins.sh [path/to/key.pem]
#
# Writes `<component>.sig` into `keys/signatures/`: the detached Ed25519 signature, base64, over the
# DIGEST STRING `sha256:<64 hex>` -- the ASCII text, not the bytes it names. That is what Orion
# verifies, and it is why a release pipeline could sign without ever holding the component.
#
# `orion-server plugin sign -o <dir>` does the signing and writes exactly that layout, which is the
# one `[packages] signatures_dir` and `package apply --signatures` read. It replaced an OpenSSL
# pipeline here (Orion #347): the step such a pipeline gets wrong is WHAT is signed -- the digest
# string, not the component -- and `base64` folding the 88-character signature onto two lines.
# macOS's LibreSSL could not do it at all.
#
# WHY A DIRECTORY OF OUR OWN, RATHER THAN A FILE BESIDE EACH COMPONENT. A signature is deployment
# state: it belongs to whoever holds the trust key, not to the package, and the package ships inside
# an image every deployment shares. Soma's and Kalam's configs point `[packages] signatures_dir`
# here -- and a runner on this machine points here too (RUNNER_SIG_DIR in kalam's .env).
#
# WHERE THE COMPONENTS COME FROM: the images, read directly. Nothing has to be running.
#
#   Soma    the image docker-compose.yml runs (SOMA_IMAGE), pulled when it is not here
#   Kalam   the image kalam's compose runs (KALAM_IMAGE, from the environment or ../kalam/.env),
#           WHEN ONE IS HERE -- this stack does not run a runner, so a missing one is skipped, not
#           fetched
#
# BOTH IMAGES CARRY tb-ants, AND THEY SHARE ONE FILE: `tb-ants.wasm.sig`. That is right only while they
# carry one engine. Signed from two releases, the second signature overwrites the first and the
# other node's own tb-ants stops verifying at its next load -- so two digests under one name is
# refused here, naming both. It is also the earliest place the engine mismatch shows that would
# otherwise leave a runner claiming nothing, for ever.
#
# Re-run after a new Soma or Kalam image, and after trust-keygen.sh --force. A stale signature is
# not silent: `[packages] apply` quarantines the channels that call the plugin and stops the node.
set -euo pipefail
cd "$(dirname "$0")/../.."

KEY="${1:-${TB_SIGNING_KEY:-keys/tinybrains-dev.pem}}"
if [ ! -r "$KEY" ]; then
  echo "no signing key at $KEY -- run scripts/setup/trust-keygen.sh, or pass one" >&2
  exit 1
fi

command -v orion-server > /dev/null || { echo "orion-server is required -- it signs" >&2; exit 1; }
command -v docker > /dev/null || { echo "docker is required, to read the images" >&2; exit 1; }

OUT=keys/signatures
mkdir -p "$OUT"

# The image names, as .env or the environment set them.
env_value() { { grep -E "^$1=" .env 2>/dev/null || true; } | tail -1 | cut -d= -f2-; }
SOMA="${SOMA_IMAGE:-$(env_value SOMA_IMAGE)}";   SOMA="${SOMA:-ghcr.io/tiny-brains/soma:latest}"
KALAM_ENV="${KALAM_ENV:-../kalam/.env}"
KALAM="${KALAM_IMAGE:-$({ grep -E '^KALAM_IMAGE=' "$KALAM_ENV" 2>/dev/null || true; } | tail -1 | cut -d= -f2-)}"
KALAM="${KALAM:-ghcr.io/tiny-brains/kalam:latest}"

echo "==> signing with $KEY"
echo "    public key $(orion-server plugin pubkey --key "$KEY")"
echo "    into $OUT/"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Copy an image's plugin directory out without running its entrypoint.
from_image() {   # $1 name, $2 ref, $3 plugins directory in the image, $4 pull when missing (1/0)
  local name="$1" ref="$2" dir="$3" pull="$4"
  if ! docker image inspect "$ref" > /dev/null 2>&1; then
    if [ "$pull" = 1 ]; then
      docker pull -q "$ref" > /dev/null 2>&1 || { echo "  FAIL  cannot pull $ref" >&2; exit 1; }
    else
      echo "    skip  $name (no image $ref here)" >&2
      return 1
    fi
  fi
  mkdir -p "$work/$name"
  docker run --rm --entrypoint sh -v "$work/$name":/out "$ref" -c "cp -R $dir/. /out/" > /dev/null
  echo "$work/$name"
}

# THE ONE THING orion-server CANNOT DECIDE FOR US: whether two images agree on the engine. It signs
# what it is given; that both images' tb-ants is the SAME component is this platform's rule, and
# `digest` over a directory is what makes it cheap to check.
#
#   digest  id  file     one line per manifest found
#
# NO ASSOCIATIVE ARRAYS. macOS ships bash 3.2, where `declare -A` is a hard error -- and this
# script's own `set -e` did not stop it, so it used to abort here having signed NOTHING while
# printing that it was signing. `seen` is "file digest image" a line, looked up with awk.
seen=
checked=
signed=0
seen_get() { printf '%s\n' "$seen" | awk -v f="$1" -v c="$2" '$1 == f { print $c; exit }'; }
sign_dir() {   # $1 the copied plugins directory, $2 the image it came from
  local digest id file prior
  while read -r digest id file; do
    [ -n "$digest" ] || continue
    file=$(basename "$file")
    prior=$(seen_get "$file" 2)
    if [ -n "$prior" ]; then
      if [ "$prior" = "$digest" ]; then
        echo "  same  $id  ${digest:0:19}...  in $2 too"
        continue
      fi
      echo "  FAIL  $file.sig would be signed for two engines:" >&2
      echo "          $prior  $(seen_get "$file" 3)" >&2
      echo "          $digest  $2" >&2
      echo "        Run the images of one ants release (SOMA_IMAGE here, KALAM_IMAGE in $KALAM_ENV)." >&2
      exit 1
    fi
    seen="$seen$file $digest $2
"
    echo "  ok    $id  ${digest:0:19}...  -> $file.sig"
    signed=$((signed + 1))
  done < <(orion-server plugin digest "$1" | awk 'NF >= 3 { print $1, $2, $3 }')

  # Everything this directory holds, in one call, into the flat layout apply reads.
  orion-server plugin sign "$1" --key "$KEY" -o "$OUT" > /dev/null
  checked="$checked$1
"
}

root=$(from_image soma "$SOMA" /pkg/soma/plugins 1)
sign_dir "$root" "$SOMA"
if root=$(from_image kalam "$KALAM" /pkg/kalam/plugins 0); then
  sign_dir "$root" "$KALAM"
fi

[ "$signed" -gt 0 ] || { echo "no plugin components found in $SOMA" >&2; exit 1; }
echo "==> $signed component(s) signed into $OUT/"

# PROVES WHAT WAS JUST WRITTEN, against the public half the stack is configured with and the
# components the images actually carry. The failure this script exists to prevent -- a signature
# that verifies nowhere, on a node whose /health says ok -- is caught here rather than at a boot.
echo "==> verifying"
PUB=$(orion-server plugin pubkey --key "$KEY")
printf '%s' "$checked" | while read -r dir; do
  [ -n "$dir" ] || continue
  orion-server plugin verify "$dir" --signatures "$OUT" --public-key "$PUB"
done
