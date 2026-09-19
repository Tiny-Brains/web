#!/usr/bin/env sh
# Put each registered game's replay viewer under public/cartridges/<slug>/, for the LOCAL dev loop.
#
#   ./scripts/vendor-viewers.sh                                    # each game's latest release
#   ANTS_RELEASE=engine-df312c0458d9 ./scripts/vendor-viewers.sh   # a release by its tag
#   ANTS_RELEASE=../ants/dist ./scripts/vendor-viewers.sh          # a local build, not released
#
# The image build does not use this script -- the Dockerfile fetches the release itself and runs
# `npm run build --ignore-scripts`, which skips `prebuild`. This exists for `npm run dev` and a
# host-side `npm run build`, which serve public/ straight off the disk.
#
# WHAT IS COPIED, AND WHY ONLY THIS. The browser reaches the viewer through one entry point --
# /cartridges/<slug>/viz.js -- and its module graph is closed:
#
#     viz.js -> shell.js -> engine.js -> engine/tb-ants.js -> engine/*.core.wasm
#                        -> render.js
#            -> map.js (on first use: the map visual, a board on its own)
#
# so those seven files are what a page fetches and nothing else is. The rest of the cartridge's viewer
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
# public/cartridges/ is GITIGNORED, so running this from `predev` and `prebuild` writes only ignored
# files from a cartridge's release: it is inert rather than a change nobody asked for. Offline, it
# keeps what is on disk.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cfg="$here/cartridges.json"
out="$here/public/cartridges"

[ -f "$cfg" ] || { echo "vendor-viewers: no $cfg" >&2; exit 1; }

# The seven files the entry point pulls in. The component beside them is matched by glob, because its
# name is the cartridge's and not this script's to know.
MODULES='viz.js shell.js render.js engine.js map.js'

# node is already a dependency of this package; using it to read the JSON avoids requiring jq.
field() {
    node -e '
      const c = require(process.argv[1]), g = c.games[process.argv[2]], k = process.argv[3];
      console.log(k === "release" ? (process.env[g.env] || "") : g[k]);
    ' "$cfg" "$1" "$2"
}
slugs=$(node -e 'const c=require(process.argv[1]);console.log(Object.keys(c.games).join(" "))' "$cfg")

copied=0
for slug in $slugs; do
    repo=$(field "$slug" repo)
    archive=$(field "$slug" archive)
    release=$(field "$slug" release)
    tmp=$(mktemp -d)

    if [ -n "$release" ] && [ -d "$release" ]; then
        # A directory laid out as the cartridge's dist/: a local build of something not released.
        src="$release"
        from="$release"
    else
        # GitHub spells the latest release's URL differently from a tag's.
        if [ -n "$release" ]; then
            url="https://github.com/$repo/releases/download/$release/$archive"
            from="$repo $release"
        else
            url="https://github.com/$repo/releases/latest/download/$archive"
            from="$repo latest"
        fi
        if ! curl -fsSL "$url" -o "$tmp/$archive" || ! mkdir -p "$tmp/x" || ! tar -xzf "$tmp/$archive" -C "$tmp/x"; then
            rm -rf "$tmp"
            echo "vendor-viewers: $slug: cannot fetch $url" >&2
            if [ -d "$out/$slug" ]; then
                echo "vendor-viewers: keeping the $slug already on disk" >&2
            fi
            continue
        fi
        src="$tmp/x"
    fi

    missing=""
    for f in $MODULES; do [ -f "$src/viz/$f" ] || missing="$missing $f"; done
    if [ -n "$missing" ]; then
        echo "vendor-viewers: $slug ($from) is missing viz/$missing -- skipped" >&2
        rm -rf "$tmp"; continue
    fi

    rm -rf "$out/$slug"
    mkdir -p "$out/$slug/engine"
    for f in $MODULES; do cp "$src/viz/$f" "$out/$slug/$f"; done

    # jco writes the glue and the core module under engine/ and names both after the component. Copy
    # the pair and nothing else in there: the .d.ts files and interfaces/ are for an editor.
    found=0
    for f in "$src"/viz/engine/*.js "$src"/viz/engine/*.core.wasm; do
        [ -f "$f" ] || continue
        cp "$f" "$out/$slug/engine/"
        found=$((found + 1))
    done
    if [ "$found" -eq 0 ]; then
        echo "vendor-viewers: $slug has no transpiled component under viz/engine/ -- the viewer would draw nothing" >&2
        rm -rf "$out/$slug" "$tmp"; continue
    fi

    digest=$(sed -n 's/.*"engine_digest"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$src/viz/engine.json" 2>/dev/null || true)
    size=$(du -sk "$out/$slug" | cut -f1)
    rm -rf "$tmp"
    echo "vendor-viewers: $slug <- $from  (${size}K${digest:+, $digest})"
    copied=$((copied + 1))
done

[ "$copied" -gt 0 ] || echo "vendor-viewers: nothing copied" >&2
