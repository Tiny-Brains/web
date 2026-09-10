#!/usr/bin/env sh
# Put each registered game's replay viewer under public/cartridges/<slug>/, for the LOCAL dev loop.
#
#   ./scripts/vendor-viewers.sh
#
# The image build does not use this script -- the Dockerfile has `COPY --from=<game>` and needs no
# docker socket. This exists for `npm run dev` and a host-side `npm run build`, which serve
# public/ straight off the disk.
#
# WHAT IS COPIED, AND WHY ONLY THIS. The browser reaches the viewer through one entry point --
# /cartridges/<slug>/viz.js -- and its module graph is closed:
#
#     viz.js -> shell.js -> engine.js -> engine/tb-ants.js -> engine/*.core.wasm
#                        -> render.js
#
# so those six files are what a page fetches and nothing else is. The rest of the cartridge's viewer
# is for other consumers: react.js wraps the same viewer for an application that already has React,
# and cannot be served from here at all because it imports the bare specifier "react"; the .d.ts
# files are for editors; engine.json records the digest for tooling. None is downloaded by this
# application, so none is carried into it.
#
# THE WASM IS NOT OPTIONAL. The viewer re-simulates through the same component digest that recorded
# the match, which is what makes the viewer and the referee unable to disagree. engine.js calls
# replay-decode inside the transpiled component; without it the player draws nothing. There is no
# JavaScript fallback and there must never be one -- a re-implementation of a rule in the browser
# would be a second engine.
#
# public/cartridges/ is GITIGNORED. It used to be committed, and this script ran from `predev` and
# `prebuild`, so a plain `npm run dev` silently rewrote checked-in files from whatever sibling
# checkout happened to be there. Now it writes only ignored files from a named image, so running it
# is inert rather than a change nobody asked for.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cfg="$here/cartridges.json"
out="$here/public/cartridges"

[ -f "$cfg" ] || { echo "vendor-viewers: no $cfg" >&2; exit 1; }

# The six files the entry point pulls in. The component beside them is matched by glob, because its
# name is the cartridge's and not this script's to know.
MODULES='viz.js shell.js render.js engine.js'

# node is already a dependency of this package; using it to read the JSON avoids requiring jq.
slugs=$(node -e 'const c=require(process.argv[1]);console.log(Object.keys(c.games).join(" "))' "$cfg")

copied=0
for slug in $slugs; do
    image=$(node -e '
      const c = require(process.argv[1]), g = c.games[process.argv[2]];
      console.log(process.env[g.env] || g.image);
    ' "$cfg" "$slug")

    if ! command -v docker > /dev/null 2>&1; then
        # Inside the image build the files are already in place from COPY --from=<game>, and there
        # is no docker socket. Present and no docker is success, not a failure.
        if [ -d "$out/$slug" ]; then
            echo "vendor-viewers: $slug already present, no docker -- keeping it"
        else
            echo "vendor-viewers: no docker and no $out/$slug -- the viewer will 404" >&2
        fi
        continue
    fi

    if ! docker image inspect "$image" > /dev/null 2>&1; then
        if docker pull -q "$image" > /dev/null 2>&1; then :; else
            echo "vendor-viewers: $slug: cannot get $image -- build it, or pull a published tag" >&2
            if [ -d "$out/$slug" ]; then
                echo "vendor-viewers: keeping the $slug already on disk" >&2
            fi
            continue
        fi
    fi

    tmp=$(mktemp -d)
    if ! cid=$(docker create "$image" 2> /dev/null); then
        rm -rf "$tmp"
        echo "vendor-viewers: $slug: cannot create a container from $image -- skipped" >&2
        continue
    fi
    docker cp "$cid:/artifacts/viz/." "$tmp/" > /dev/null 2>&1 || {
        docker rm -f "$cid" > /dev/null 2>&1 || true; rm -rf "$tmp"
        echo "vendor-viewers: $slug: $image carries no /artifacts/viz -- skipped" >&2
        continue
    }
    docker rm -f "$cid" > /dev/null 2>&1 || true

    missing=""
    for f in $MODULES; do [ -f "$tmp/$f" ] || missing="$missing $f"; done
    if [ -n "$missing" ]; then
        echo "vendor-viewers: $slug is missing$missing -- skipped" >&2
        rm -rf "$tmp"; continue
    fi

    rm -rf "$out/$slug"
    mkdir -p "$out/$slug/engine"
    for f in $MODULES; do cp "$tmp/$f" "$out/$slug/$f"; done

    # jco writes the glue and the core module under engine/ and names both after the component. Copy
    # the pair and nothing else in there: the .d.ts files and interfaces/ are for an editor.
    found=0
    for f in "$tmp"/engine/*.js "$tmp"/engine/*.core.wasm; do
        [ -f "$f" ] || continue
        cp "$f" "$out/$slug/engine/"
        found=$((found + 1))
    done
    if [ "$found" -eq 0 ]; then
        echo "vendor-viewers: $slug has no transpiled component under engine/ -- the viewer would draw nothing" >&2
        rm -rf "$out/$slug" "$tmp"; continue
    fi

    digest=$(sed -n 's/.*"engine_digest"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$tmp/engine.json" 2>/dev/null || true)
    size=$(du -sk "$out/$slug" | cut -f1)
    rm -rf "$tmp"
    echo "vendor-viewers: $slug <- $image  (${size}K${digest:+, $digest})"
    copied=$((copied + 1))
done

[ "$copied" -gt 0 ] || echo "vendor-viewers: nothing copied" >&2
