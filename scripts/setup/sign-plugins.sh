#!/usr/bin/env bash
# Sign every plugin component this stack, and a runner playing for it, will load.
#
#   scripts/setup/sign-plugins.sh [path/to/key.pem]
#
# Writes `<component>.sig` into `keys/signatures/`: the detached Ed25519 signature, base64, over the
# DIGEST STRING `sha256:<64 hex>` -- the ASCII text, not the bytes it names. That is what Orion
# verifies, and it is why a release pipeline could sign without ever holding the component.
#
# WHY A DIRECTORY OF OUR OWN, RATHER THAN A FILE BESIDE EACH COMPONENT. A signature is deployment
# state: it belongs to whoever holds the trust key, not to the package, and the package ships inside
# an image every deployment shares. Soma's and Kalam's load-package.sh read PLUGIN_SIG_DIR, which
# docker-compose.yml points here -- and which a runner on this machine points here too
# (RUNNER_SIG_DIR in kalam's .env).
#
# WHERE THE COMPONENTS COME FROM: the images, read directly. Nothing has to be running.
#
#   Soma    the image docker-compose.yml runs (SOMA_IMAGE), pulled when it is not here
#   Kalam   KALAM_IMAGE, or the image kalam's compose builds and pulls, WHEN ONE IS HERE -- this stack
#           does not run a runner, so a missing one is skipped, not fetched
#
# Re-run after a new Soma or Kalam image, and after trust-keygen.sh --force. A stale signature is
# not silent: the node quarantines the channels that call the plugin and the self-load stops it.
set -euo pipefail
cd "$(dirname "$0")/../.."

KEY="${1:-${TB_SIGNING_KEY:-keys/tinybrains-dev.pem}}"
if [ ! -r "$KEY" ]; then
  echo "no signing key at $KEY -- run scripts/setup/trust-keygen.sh, or pass one" >&2
  exit 1
fi

command -v openssl > /dev/null || { echo "openssl is required" >&2; exit 1; }
command -v docker > /dev/null || { echo "docker is required, to read the images" >&2; exit 1; }

OUT=keys/signatures
mkdir -p "$OUT"

# The image names, as .env or the environment set them.
env_value() { { grep -E "^$1=" .env 2>/dev/null || true; } | tail -1 | cut -d= -f2-; }
SOMA="${SOMA_IMAGE:-$(env_value SOMA_IMAGE)}";   SOMA="${SOMA:-ghcr.io/tiny-brains/soma:latest}"
KALAM="${KALAM_IMAGE:-ghcr.io/tiny-brains/kalam:latest}"

echo "==> signing with $KEY"
echo "    public key $(openssl pkey -in "$KEY" -pubout -outform DER | tail -c 32 | base64)"
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

signed=0
sign_dir() {   # $1 the copied plugins directory
  local manifest dir component digest msg sig name
  for manifest in "$1"/*/plugin.toml; do
    [ -e "$manifest" ] || continue
    dir=$(dirname "$manifest")
    name=$(sed -n 's/^name *= *"\(.*\)"/\1/p' "$manifest" | head -1)
    component="$dir/$(sed -n 's/^component *= *"\(.*\)"/\1/p' "$manifest" | head -1)"
    [ -r "$component" ] || { echo "  FAIL  $name names $(basename "$component"), which is not in the image" >&2; exit 1; }

    digest="sha256:$(shasum -a 256 "$component" | cut -d' ' -f1)"
    # The message is the digest string with NO trailing newline: one byte of difference is a
    # signature that verifies nowhere.
    msg=$(mktemp)
    printf '%s' "$digest" > "$msg"
    sig=$(openssl pkeyutl -sign -inkey "$KEY" -rawin -in "$msg" | base64 | tr -d '\n')
    rm -f "$msg"
    if [ "$(printf '%s' "$sig" | base64 -d | wc -c | tr -d ' ')" != "64" ]; then
      echo "  FAIL  $name produced a signature that is not 64 bytes" >&2
      exit 1
    fi
    printf '%s\n' "$sig" > "$OUT/$(basename "$component").sig"
    echo "  ok    $name  ${digest:0:19}...  -> $(basename "$component").sig"
    signed=$((signed + 1))
  done
}

root=$(from_image soma "$SOMA" /pkg/soma/plugins 1)
sign_dir "$root"
if root=$(from_image kalam "$KALAM" /pkg/kalam/plugins 0); then
  sign_dir "$root"
fi

[ "$signed" -gt 0 ] || { echo "no plugin components found in $SOMA" >&2; exit 1; }
echo "==> $signed component(s) signed into $OUT/"
