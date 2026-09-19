#!/usr/bin/env bash
# Make a GitHub account an admin of this deployment, by its numeric id.
#
#   scripts/setup/admin-user.sh <github-login>            # look the id up and add it to .env
#   scripts/setup/admin-user.sh --print <github-login>    # print it only, for a deployment's own secrets
#
# WHY AN ID. Soma makes an account an admin at sign-in when its GitHub id is in
# SOMA_ADMIN_GITHUB_IDS. A login is the wrong key: GitHub frees a renamed login for anyone to register,
# so a list of logins hands the platform to whoever takes yours after you rename. An id never changes
# and is never reused, so the login is looked up once, here, and only the id is kept.
#
# The id is not a secret, but it lives in .env, which is never committed; a deployment sets the same
# variable in its own environment. Several ids are comma-separated, and this adds to what is there.
# Everyone else is made an admin by an admin, on the site's Users admin page.
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE=.env
PRINT=0
[ "${1:-}" = "--print" ] && { PRINT=1; shift; }
LOGIN="${1:?usage: $0 [--print] <github-login>}"
API="${GITHUB_API_BASE:-https://api.github.com}"

# GitHub's own rule: letters, digits and single hyphens, at most 39 characters.
printf '%s' "$LOGIN" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$' \
  || { echo "'$LOGIN' is not a GitHub login" >&2; exit 2; }

body=$(curl -fsS -H 'Accept: application/vnd.github+json' "$API/users/$LOGIN") \
  || { echo "GitHub has no user '$LOGIN' (or $API is unreachable)" >&2; exit 1; }
read -r ID KIND WHO < <(printf '%s' "$body" | python3 -c '
import json, sys
u = json.load(sys.stdin)
print(u.get("id", ""), u.get("type", ""), u.get("login", "") + (" (" + u["name"] + ")" if u.get("name") else ""))')
[ -n "$ID" ] || { echo "GitHub answered without an id for '$LOGIN'" >&2; exit 1; }
# An organisation has an id too, and nobody can sign in as one.
[ "$KIND" = "User" ] || { echo "'$LOGIN' is a GitHub $KIND, not a user: nobody signs in as one" >&2; exit 1; }

echo "==> $WHO is GitHub id $ID"
if [ "$PRINT" = 1 ]; then
  echo "    add it to SOMA_ADMIN_GITHUB_IDS in the Soma service's environment (comma-separated)"
  exit 0
fi

touch "$ENV_FILE"
have=$(grep '^SOMA_ADMIN_GITHUB_IDS=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d ' ' || true)
case ",$have," in
  *",$ID,"*) echo "    already in $ENV_FILE"; exit 0 ;;
esac
list="${have:+$have,}$ID"
if grep -q '^SOMA_ADMIN_GITHUB_IDS=' "$ENV_FILE"; then
  tmp=$(mktemp)
  sed "s|^SOMA_ADMIN_GITHUB_IDS=.*|SOMA_ADMIN_GITHUB_IDS=$list|" "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"
else
  printf 'SOMA_ADMIN_GITHUB_IDS=%s\n' "$list" >> "$ENV_FILE"
fi
echo "==> $ENV_FILE: SOMA_ADMIN_GITHUB_IDS=$list"
echo
echo "Next: docker compose up -d soma, then sign in at http://localhost:5173 -- the role is written at"
echo "sign-in, so a session from before this needs signing out and in again."
