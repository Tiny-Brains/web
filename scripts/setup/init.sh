#!/usr/bin/env bash
# Everything a fresh machine needs before `docker compose up -d`, in one command.
#
#   scripts/setup/init.sh [--force]
#
#   1. .env, from .env.example
#   2. the secrets that can honestly be minted here -- POSTGRES_PASSWORD, SOMA_SESSION_SECRET,
#      RUNNER_TOKEN_SECRET, MODELS_READ_SECRET_KEY
#   3. ORION_ADMIN_KEY          (scripts/setup/admin-key.sh)
#   4. the Ed25519 trust root   (scripts/setup/trust-keygen.sh)
#   5. SOMA_IMAGE, pinned to the newest published Soma release -- never `:latest`, which is whatever
#      this machine pulled last -- and the Kalam release a runner's .env should name
#   6. a signature over each plugin in the Soma image, and in a Kalam image when there is one here
#      for a local runner (scripts/setup/sign-plugins.sh)
#
# Every step is a no-op when it has already been done, so this is also the repair command. What it
# CANNOT do is register a GitHub OAuth App: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are yours, and
# it says so at the end rather than leaving compose to fail on them.
#
# --force is passed through to admin-key.sh and trust-keygen.sh, which is a credential rotation:
# every client holding the old admin key is locked out, and every existing signature is orphaned.
set -euo pipefail
cd "$(dirname "$0")/../.."

# A scalar, not an array: macOS ships bash 3.2, where `${arr[@]}` on an EMPTY array is an unbound
# variable under `set -u`. Unquoted and empty, this expands to no argument at all.
FORCE=""
[ "${1:-}" = "--force" ] && FORCE="--force"

command -v openssl > /dev/null || { echo "openssl is required" >&2; exit 1; }
command -v docker  > /dev/null || { echo "docker is required" >&2; exit 1; }

echo "==> .env"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "    created from .env.example"
else
  echo "    already there"
fi

# A key that is present but EMPTY is the case worth handling: .env.example ships the names with no
# values, so a fresh copy has these declared and blank.
mint() {   # $1 name, $2 how many bytes
  local name="$1" bytes="$2"
  if grep -Eq "^${name}=.+" .env; then
    echo "    $name already set"
    return
  fi
  local value; value=$(openssl rand -hex "$bytes")
  if grep -q "^${name}=" .env; then
    local tmp; tmp=$(mktemp)
    sed "s|^${name}=.*|${name}=${value}|" .env > "$tmp" && mv "$tmp" .env
  else
    printf '%s=%s\n' "$name" "$value" >> .env
  fi
  echo "    minted $name"
}
mint POSTGRES_PASSWORD 24
mint SOMA_SESSION_SECRET 32
mint RUNNER_TOKEN_SECRET 32
# The secret of the read-only models key `buckets` creates in MinIO; its access key is in .env.example.
mint MODELS_READ_SECRET_KEY 24

# THE NEWEST PUBLISHED X.Y.Z of an image, from the registry itself (anonymous pull scope), or nothing
# when it cannot be reached -- the caller says what to set by hand.
latest_release() {   # $1 repository under ghcr.io/tiny-brains
  local tok
  tok=$(curl -fsS "https://ghcr.io/token?scope=repository:tiny-brains/$1:pull" 2>/dev/null \
        | sed -n 's/.*"token":"\([^"]*\)".*/\1/p') || true
  [ -n "$tok" ] || return 0
  curl -fsS -H "Authorization: Bearer $tok" "https://ghcr.io/v2/tiny-brains/$1/tags/list" 2>/dev/null \
    | grep -oE '"[0-9]+\.[0-9]+\.[0-9]+"' | tr -d '"' | sort -t. -k1,1n -k2,2n -k3,3n | tail -1 || true
}

echo "==> the images"
if grep -Eq '^SOMA_IMAGE=.+' .env; then
  echo "    SOMA_IMAGE already set: $(grep '^SOMA_IMAGE=' .env | tail -1 | cut -d= -f2-)"
else
  v=$(latest_release soma)
  if [ -n "$v" ]; then
    printf '\n# The Soma release this stack runs, pinned by scripts/setup/init.sh.\nSOMA_IMAGE=ghcr.io/tiny-brains/soma:%s\n' "$v" >> .env
    echo "    pinned SOMA_IMAGE=ghcr.io/tiny-brains/soma:$v, the newest release"
  else
    echo "    could not reach ghcr.io: set SOMA_IMAGE in .env to a release (ghcr.io/tiny-brains/soma:<version>)"
  fi
fi
KALAM_PIN=$(latest_release kalam)
WEB_PIN=$(latest_release web)

echo "==> the Orion admin key"
./scripts/setup/admin-key.sh $FORCE | sed 's/^/    /'

echo "==> the plugin trust root"
./scripts/setup/trust-keygen.sh $FORCE | sed 's/^/    /'

echo "==> signing"
./scripts/setup/sign-plugins.sh | sed 's/^/    /'

echo
missing=()
for v in GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET; do
  grep -Eq "^${v}=.+" .env || missing+=("$v")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "STILL YOURS TO FILL IN, in .env: ${missing[*]}"
  echo "  Register a GitHub OAuth App with"
  echo "    homepage  http://localhost:5173"
  echo "    callback  http://localhost:5173/v1/auth/github/callback"
  echo "  and put its two values there. Compose refuses to start without them."
  echo
fi
if ! grep -Eq '^SOMA_ADMIN_GITHUB_IDS=.+' .env; then
  echo "NOBODY IS AN ADMIN YET. Make yourself one by your GitHub login (the id is what is kept):"
  echo "  scripts/setup/admin-user.sh <your-github-login>"
  echo
fi
echo "Then:"
echo "  docker compose up -d --build             # http://localhost:5173 (web built from this checkout), and sign in"
echo "  then, on the admin pages: a season, its boards and baselines, and a runner key for kalam"
echo
echo "A runner (kalam's .env) names its release: KALAM_IMAGE=ghcr.io/tiny-brains/kalam:${KALAM_PIN:-<version>}"
echo "To serve the published web instead of this checkout: WEB_IMAGE=ghcr.io/tiny-brains/web:${WEB_PIN:-<version>}"
echo "in .env, then  docker compose pull && docker compose up -d --no-build  -- with --build, compose would"
echo "build this checkout and tag it as that release."
