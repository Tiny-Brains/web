#!/usr/bin/env sh
# Put each registered game's replay viewers under public/cartridges/<slug>/, for the LOCAL dev loop.
#
#   ./scripts/vendor-viewers.sh                                    # each game's latest release
#   ANTS_RELEASE=engine-df312c0458d9 ./scripts/vendor-viewers.sh   # a release by its tag
#   ANTS_RELEASE=../ants/dist ./scripts/vendor-viewers.sh          # a local build, not released
#
# The image build does not use this script -- the Dockerfile fetches the releases itself and runs
# `npm run build --ignore-scripts`, which skips `prebuild`. This exists for `npm run dev` and a
# host-side `npm run build`, which serve public/ straight off the disk.
#
# TWO KINDS OF COPY, ONE LAYOUT:
#
#   public/cartridges/<slug>/                the CURRENT viewer: the latest release, or ANTS_RELEASE
#   public/cartridges/<slug>/engines/<hex>/  every release in cartridges.json's `engines`, by digest
#   public/cartridges/<slug>/engines.json    which is which, written by scripts/engines-index.mjs
#
# A REPLAY IS DRAWN BY THE ENGINE THAT PLAYED IT. The viewer re-simulates a match from its actions,
# so a viewer on another engine draws a plausible match that never happened; lib/viz.ts picks the
# viewer by the match's engine_digest out of engines.json and refuses one it does not find. A copy
# by digest is never fetched twice: a release is immutable, so one already on disk is kept.
#
# WHAT IS COPIED, AND WHY ONLY THIS. The browser reaches a viewer through one entry point --
# viz.js -- and its module graph is closed:
#
#     viz.js -> shell.js -> engine.js -> engine/tb-ants.js -> engine/*.core.wasm
#                        -> render.js
#            -> map.js (on first use: the map visual, a board on its own)
#            -> graph.js (on first use: the match graph, `mountGraph`)
#
# so those eight files are what a page fetches and nothing else is. The rest of the cartridge's viewer
# is for other consumers: react.js wraps the same viewer for an application that already has React,
# and cannot be served from here at all because it imports the bare specifier "react"; the .d.ts
# files are for editors; engine.json records the digest for tooling. None is downloaded by this
# application, so none is carried into it. The current viewer must have all eight. An OLDER release
# may predate a module (engine-cd656bc84c1a has no graph.js), and a name it lacks is skipped only
# when none of its modules imports that name.
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

# The modules the entry point pulls in, by name. The component beside them is matched by glob,
# because its name is the cartridge's and not this script's to know.
MODULES='viz.js shell.js render.js engine.js map.js graph.js'

# node is already a dependency of this package; using it to read the JSON avoids requiring jq.
field() {
    node -e '
      const c = require(process.argv[1]), g = c.games[process.argv[2]], k = process.argv[3];
      console.log(k === "release" ? (process.env[g.env] || "") : k === "engines" ? (g.engines || []).join(" ") : g[k]);
    ' "$cfg" "$1" "$2"
}
sha256_of() {
    node -e 'process.stdout.write(require("crypto").createHash("sha256").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' "$1"
}
slugs=$(node -e 'const c=require(process.argv[1]);console.log(Object.keys(c.games).join(" "))' "$cfg")

# fetch <repo> <archive> <tag or empty for the latest> <dir>: the release unpacked into <dir>.
fetch() {
    if [ -n "$3" ]; then
        url="https://github.com/$1/releases/download/$3/$2"
    else
        # GitHub spells the latest release's URL differently from a tag's.
        url="https://github.com/$1/releases/latest/download/$2"
    fi
    curl -fsSL "$url" -o "$4/$2" && mkdir -p "$4/x" && tar -xzf "$4/$2" -C "$4/x"
}

# copy <dist> <dest> <strict>: one viewer's modules and its component into <dest>, by name. Strict,
# every module must be there; otherwise a missing one is allowed while nothing imports it. Prints
# what is wrong and fails rather than leave a viewer that would draw nothing.
copy() {
    missing=""
    for f in $MODULES; do
        [ -f "$1/viz/$f" ] && continue
        if [ "$3" = strict ] || grep -q "\./$f" "$1"/viz/*.js; then missing="$missing $f"; fi
    done
    if [ -n "$missing" ]; then
        echo "is missing viz/$missing" >&2
        return 1
    fi
    mkdir -p "$2/engine"
    for f in $MODULES; do [ -f "$1/viz/$f" ] && cp "$1/viz/$f" "$2/$f"; done
    # jco writes the glue and the core module under engine/ and names both after the component. Copy
    # the pair and nothing else in there: the .d.ts files and interfaces/ are for an editor.
    found=0
    for f in "$1"/viz/engine/*.js "$1"/viz/engine/*.core.wasm; do
        [ -f "$f" ] || continue
        cp "$f" "$2/engine/"
        found=$((found + 1))
    done
    if [ "$found" -eq 0 ]; then
        echo "has no transpiled component under viz/engine/ -- the viewer would draw nothing" >&2
        return 1
    fi
}

copied=0
for slug in $slugs; do
    repo=$(field "$slug" repo)
    archive=$(field "$slug" archive)
    release=$(field "$slug" release)
    tmp=$(mktemp -d)

    # ---- the current viewer, at the root -------------------------------------------------------
    if [ -n "$release" ] && [ -d "$release" ]; then
        # A directory laid out as the cartridge's dist/: a local build of something not released.
        src="$release"
        from="$release"
    else
        from="$repo ${release:-latest}"
        if ! fetch "$repo" "$archive" "$release" "$tmp"; then
            rm -rf "$tmp"
            echo "vendor-viewers: $slug: cannot fetch $from" >&2
            if [ -d "$out/$slug" ]; then
                echo "vendor-viewers: keeping the $slug already on disk" >&2
            fi
            continue
        fi
        src="$tmp/x"
    fi

    # The root's own files go, and engines/ stays: those copies are by digest and never change.
    mkdir -p "$out/$slug"
    rm -rf "$out/$slug/engine"
    for f in $MODULES; do rm -f "$out/$slug/$f"; done
    if ! copy "$src" "$out/$slug" strict 2> "$tmp/why"; then
        echo "vendor-viewers: $slug ($from) $(cat "$tmp/why") -- skipped" >&2
        rm -rf "$out/$slug/engine" "$out/$slug/engines.json" "$tmp"
        for f in $MODULES; do rm -f "$out/$slug/$f"; done
        continue
    fi

    digest=$(sed -n 's/.*"engine_digest"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$src/viz/engine.json" 2>/dev/null || true)
    size=$(cat "$out/$slug"/*.js "$out/$slug"/engine/* | wc -c | awk '{ print int($1 / 1024) }')
    echo "vendor-viewers: $slug <- $from  (${size}K${digest:+, $digest})"
    copied=$((copied + 1))

    # ---- every engine the ladder has played, by digest -----------------------------------------
    for tag in $(field "$slug" engines); do
        prefix=${tag#engine-}
        for d in "$out/$slug/engines/$prefix"*; do
            [ -f "$d/viz.js" ] && continue 2
        done
        old=$(mktemp -d)
        if ! fetch "$repo" "$archive" "$tag" "$old"; then
            echo "vendor-viewers: $slug: cannot fetch $repo $tag -- its matches will not draw" >&2
            rm -rf "$old"; continue
        fi
        hex=$(sha256_of "$old/x/tb-ants.wasm" 2>/dev/null || true)
        case "$hex" in
            "$prefix"*) ;;
            *) echo "vendor-viewers: $slug $tag: its component is sha256:${hex:-?}, not the tag's -- skipped" >&2
               rm -rf "$old"; continue ;;
        esac
        if ! grep -q "\"engine_digest\": \"sha256:$hex\"" "$old/x/viz/engine.json"; then
            echo "vendor-viewers: $slug $tag: viz/ was not transpiled from the component beside it -- skipped" >&2
            rm -rf "$old"; continue
        fi
        if ! copy "$old/x" "$out/$slug/engines/$hex" lenient 2> "$old/why"; then
            echo "vendor-viewers: $slug $tag $(cat "$old/why") -- skipped" >&2
            rm -rf "$out/$slug/engines/$hex" "$old"; continue
        fi
        echo "vendor-viewers: $slug <- $repo $tag  (kept by digest)"
        rm -rf "$old"
    done

    node "$here/scripts/engines-index.mjs" "$out/$slug" "$digest" > /dev/null
    rm -rf "$tmp"
done

[ "$copied" -gt 0 ] || echo "vendor-viewers: nothing copied" >&2
