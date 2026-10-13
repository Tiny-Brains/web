#!/bin/sh
# The whole book: the English tree in book/, and one tree per language in book/<tag>/ -- the layout
# the site serves at /docs/ and /docs/<tag>/. ../Dockerfile runs this and nothing else; run it by
# hand the same way.
#
#     ./build.sh                    # needs mdbook, mdbook-gettext, mdbook-xgettext, python3
#
# A LANGUAGE IS A CATALOGUE. po/<tag>.po holds the translation of every paragraph, heading, list
# item and table cell, keyed by its English; mdbook-gettext lays it over the chapters as that
# language's tree is built, and a paragraph the catalogue lacks -- or whose English has changed
# since it was translated -- is said in English. po/messages.pot is the English, extracted here on
# every build so po/check.py compares each catalogue with the book as it is, not as it was.
#
# `mdbook build` on its own is still the English check (theme/, SUMMARY.md, every {{#studio}}),
# with the gettext preprocessor marked optional in book.toml for exactly that; it is the language
# trees that need the helpers, so this script refuses rather than build one untranslated.
set -eu
cd "$(dirname "$0")"

for tool in mdbook mdbook-gettext mdbook-xgettext python3; do
  command -v "$tool" > /dev/null 2>&1 || {
    echo "$tool is not on PATH." >&2
    echo "  cargo install --locked mdbook-i18n-helpers    # mdbook-gettext and mdbook-xgettext" >&2
    exit 1; }
done

echo "==> po/messages.pot"
MDBOOK_OUTPUT='{"xgettext": {}}' mdbook build -d po | grep -v '^ INFO' || true

echo "==> catalogues"
set -- po/*.po
[ -e "$1" ] || { echo "    none: po/ holds no <tag>.po, so the book is English alone"; set --; }
[ $# -eq 0 ] || python3 po/check.py po/messages.pot "$@"

echo "==> en-GB"
mdbook build | grep -v '^ INFO' || true

# Each catalogue is a tree inside the English one, built AFTER it: mdbook empties book/ first.
# Its 404 page needs its own site-url, and search is off because mdBook's index splits on spaces
# and has no tokens for a language written without them.
for po in "$@"; do
  tag=$(basename "$po" .po)
  echo "==> $tag"
  MDBOOK_BOOK__LANGUAGE="$tag" \
  MDBOOK_OUTPUT__HTML__SITE_URL="/docs/$tag/" \
  MDBOOK_OUTPUT__HTML__SEARCH__ENABLE=false \
    mdbook build -d "book/$tag" | grep -v '^ INFO' || true
  grep -q "<html lang=\"$tag\"" "book/$tag/index.html" || { echo "book/$tag was not built as $tag" >&2; exit 1; }
done
echo "    book/: en-GB$(for po in "$@"; do printf ', %s' "$(basename "$po" .po)"; done)"
