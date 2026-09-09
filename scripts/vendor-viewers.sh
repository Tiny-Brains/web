#!/usr/bin/env sh
# Copy each registered game's replay viewer into public/cartridges/<slug>/.
#
# WHAT IS COPIED, AND WHY ONLY THIS. The browser reaches the viewer through one
# entry point -- /cartridges/<slug>/viz.js -- and its module graph is closed:
#
#     viz.js -> shell.js -> engine.js -> engine/tb-ants.js -> engine/*.core.wasm
#                        -> render.js
#
# so those six files are what a page fetches and nothing else is. The rest of the
# cartridge's dist/ is for other consumers: react.js wraps the same viewer for an
# application that already has React, and cannot be served from here at all
# because it imports the bare specifier "react"; the .d.ts files are for editors;
# engine.json records the digest for tooling. None of them is downloaded by this
# application, so none of them is carried into its image.
#
# THE WASM IS NOT OPTIONAL. ants/viz/README.md: the viewer "re-simulates through
# the same component digest that recorded the match", which is what makes the
# viewer and the referee unable to disagree. engine.js calls replay-decode inside
# the transpiled component; without the component the player draws nothing. There
# is no JavaScript fallback and there must never be one -- a re-implementation of
# a rule in the browser would be a second engine.
#
# WHY A COPY, AND WHY COMMITTED. The viewer is a build artifact of a different
# repository, and this image's build context is web/ alone, so the Dockerfile
# cannot reach a sibling checkout: the copy has to have happened before the build
# and what it produced has to be in the tree. Same rule as everywhere else on this
# platform -- the generated artifact is the shipped artifact, so commit
# public/cartridges/ together with the change that moved it.
#
# The registry is devops/games/registry.toml, the same four facts the package
# loader writes onto the game row. A `path` entry resolves to a sibling checkout;
# a `release` entry is the published tarball and is not fetched here yet.
#
#   ./scripts/vendor-viewers.sh
#   REGISTRY=../devops/games/registry.toml ./scripts/vendor-viewers.sh
#
# A missing sibling is a warning, not a failure: a clone with no ants/ beside it
# still builds, and keeps whatever is already committed under public/cartridges.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
registry=${REGISTRY:-"$here/../devops/games/registry.toml"}
out="$here/public/cartridges"

if [ ! -f "$registry" ]; then
    echo "vendor-viewers: no registry at $registry -- keeping what is committed" >&2
    exit 0
fi

registry_dir=$(CDPATH= cd -- "$(dirname -- "$registry")" && pwd)

# The four modules the entry point pulls in. The component beside them is matched
# by glob, because its name is the cartridge's and not this script's to know.
MODULES='viz.js shell.js render.js engine.js'

vendor_one() {
    slug=$1
    src=$2

    for f in $MODULES; do
        if [ ! -f "$src/$f" ]; then
            echo "vendor-viewers: $slug is missing $f -- skipped" >&2
            return 1
        fi
    done

    rm -rf "$out/$slug"
    mkdir -p "$out/$slug/engine"

    for f in $MODULES; do
        cp "$src/$f" "$out/$slug/$f"
    done

    # jco writes the glue and the core module under engine/ and names both after
    # the component. Copy the pair and nothing else in there: the .d.ts files and
    # interfaces/ are for an editor, not for a browser.
    found=0
    for f in "$src"/engine/*.js "$src"/engine/*.core.wasm; do
        [ -f "$f" ] || continue
        cp "$f" "$out/$slug/engine/"
        found=$((found + 1))
    done
    if [ "$found" -eq 0 ]; then
        echo "vendor-viewers: $slug has no transpiled component under engine/ -- the viewer would draw nothing" >&2
        rm -rf "$out/$slug"
        return 1
    fi

    digest=$(sed -n 's/.*"engine_digest"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$src/engine.json" 2>/dev/null || true)
    size=$(du -sk "$out/$slug" | cut -f1)
    echo "vendor-viewers: $slug <- ${src#"$registry_dir"/}  (${size}K${digest:+, $digest})"
    return 0
}

slug=
copied=0
while IFS= read -r line || [ -n "$line" ]; do
    case $line in
        '[games.'*']'*)
            slug=$(printf '%s' "$line" | sed -n 's/^\[games\.\([A-Za-z0-9_-]*\)\].*$/\1/p')
            ;;
        path*=*)
            [ -n "$slug" ] || continue
            rel=$(printf '%s' "$line" | sed -n 's/^[[:space:]]*path[[:space:]]*=[[:space:]]*"\([^"]*\)".*$/\1/p')
            [ -n "$rel" ] || continue

            src="$registry_dir/$rel/viz/dist"
            if [ ! -d "$src" ]; then
                echo "vendor-viewers: $slug has no viewer at $src -- skipped" >&2
            elif vendor_one "$slug" "$src"; then
                copied=$((copied + 1))
            fi
            slug=
            ;;
    esac
done < "$registry"

[ "$copied" -gt 0 ] || echo "vendor-viewers: nothing copied" >&2
