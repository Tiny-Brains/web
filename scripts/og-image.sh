#!/bin/sh
# Render public/og.png -- the card a pasted link unfurls to -- from scripts/og-image.html, at the
# 1200 x 630 Open Graph scrapers expect. Run it after editing the template and commit the PNG:
# the image is a source asset, not build output, because a scraper fetches it and nothing at
# build time should need a browser.
#
# Headless Chrome does not always exit after writing the screenshot, so it runs under an alarm.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../public/og.png"

chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$chrome" ] || chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser)

rm -f "$out"
# In a subshell, so the shell's own "Alarm clock" line for the killed child stays quiet.
( perl -e 'alarm 30; exec @ARGV' -- "$chrome" \
  --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
  --user-data-dir="$(mktemp -d)" --force-device-scale-factor=1 \
  --window-size=1200,630 --screenshot="$out" "file://$here/og-image.html" ) >/dev/null 2>&1 || true

[ -s "$out" ] || { echo "og-image.sh: Chrome wrote nothing to $out" >&2; exit 1; }
echo "wrote $out"
