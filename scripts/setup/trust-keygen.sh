#!/usr/bin/env bash
# The Ed25519 trust root this stack signs plugin components with. Run once per machine;
# sign-plugins.sh uses what it writes.
#
#   scripts/setup/trust-keygen.sh [--force]
#
# Writes keys/tinybrains-dev.pem (mode 0600, git-ignored) and TB_TRUST_PUBLIC_KEY into .env, which
# Soma's instance config reads as `[plugins.trust] public_keys` -- and which a runner playing for this
# stack must be given too.
#
# While that list is non-empty every plugin upload must carry a detached signature over THE DIGEST
# STRING -- the ASCII of `sha256:<64 hex>`, not the component bytes -- verified when the upload
# arrives and again by every node that loads the version. With no keys configured nothing is
# checked and any signature, or none, passes.
#
# The private half is never committed: the server only verifies, so a key beside the thing it signs
# proves nothing. A deployment signs with its own key from its orchestrator's secret store.
#
# Overwriting an existing key orphans every signature made with it -- every plugin refused at load,
# on a node that looks healthy -- so that needs --force.
set -euo pipefail
cd "$(dirname "$0")/../.."

KEY_DIR=keys
KEY="$KEY_DIR/tinybrains-dev.pem"
ENV_FILE=.env
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

command -v openssl > /dev/null || { echo "openssl is required" >&2; exit 1; }
# LibreSSL -- what macOS ships as /usr/bin/openssl -- has no `pkeyutl -rawin`, which is how an
# Ed25519 signature over a message rather than a hash is made.
if ! openssl genpkey -algorithm ed25519 -out /dev/null 2>/dev/null; then
  echo "this openssl does not do Ed25519 -- on macOS, 'brew install openssl' and put it first" >&2
  exit 1
fi

# The raw 32 bytes, base64, as Orion wants them. Ed25519's SPKI header is a fixed 12 bytes, so the
# DER tail is exact rather than a guess.
public_half() { openssl pkey -in "$1" -pubout -outform DER | tail -c 32 | base64; }

if [ -f "$KEY" ] && [ "$FORCE" = 0 ]; then
  echo "$KEY already exists."
  echo "Re-generating orphans every signature made with it: each plugin would be refused at load,"
  echo "on a node whose /health says ok. Pass --force only if you will re-run sign-plugins.sh and"
  echo "reload every package afterwards."
  echo
  echo "  TB_TRUST_PUBLIC_KEY=$(public_half "$KEY")"
  exit 0
fi

mkdir -p "$KEY_DIR"
openssl genpkey -algorithm ed25519 -out "$KEY"
chmod 600 "$KEY"
echo "==> wrote $KEY (mode 600, git-ignored)"

PUB=$(public_half "$KEY")
if [ "$(printf '%s' "$PUB" | base64 -d | wc -c | tr -d ' ')" != "32" ]; then
  echo "the extracted public key is not 32 bytes -- refusing to write it" >&2
  exit 1
fi
echo "==> public key $PUB"

touch "$ENV_FILE"
if grep -q '^TB_TRUST_PUBLIC_KEY=' "$ENV_FILE"; then
  # A fresh .env from .env.example declares the name with no value: that is not a key being replaced.
  if grep -Eq '^TB_TRUST_PUBLIC_KEY=.+' "$ENV_FILE"; then
    echo "    replaced the old TB_TRUST_PUBLIC_KEY in $ENV_FILE"
  fi
  tmp=$(mktemp)
  grep -v '^TB_TRUST_PUBLIC_KEY=' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
fi
printf 'TB_TRUST_PUBLIC_KEY=%s\n' "$PUB" >> "$ENV_FILE"
echo "==> $ENV_FILE now carries TB_TRUST_PUBLIC_KEY"
echo
echo "Next:"
echo "  scripts/setup/sign-plugins.sh          sign every plugin component with this key"
echo "  docker compose up -d --force-recreate soma   pick up the new key; the node reloads its package"
