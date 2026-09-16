#!/usr/bin/env sh
# Put the rendered competitor guide under docs/book/, for the LOCAL dev loop.
#
#   ./scripts/vendor-book.sh          # only if there is no book yet
#   ./scripts/vendor-book.sh --force  # replace whatever is there
#
# The image build does not use this script -- web's Dockerfile has `COPY --from=book` and needs no
# docker socket, and .dockerignore keeps docs/ out of the node build context entirely. This exists
# for `npm run dev`, whose book() plugin in vite.config.ts serves docs/book straight off the disk.
#
# WHY THIS IS NEEDED AT ALL, when the book is right there in docs/. Its SOURCE is, but `mdbook
# build` cannot run on a fresh checkout: book.toml sets `create-missing = false`, and two of the
# book's inputs -- src/viz/ (the cartridge's replay viewer) and src/tutorials/ (eight lesson matches
# played through the real engine) -- are generated, gitignored, and come from the ants and CLI
# artifact images through docs/tutorials/build.sh. Taking the finished book out of its own image is
# the short way round, and it is the same book the deployment serves.
#
# TO EDIT THE BOOK ITSELF, build it properly instead: see docs/CLAUDE.md. Once docs/book exists this
# script leaves it alone, so `npm run dev` never overwrites what you just built -- pass --force, or
# delete docs/book, to go back to the image's copy. That is deliberate: this repository has already
# been bitten once by a predev script silently rewriting files nobody asked it to touch.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
out="$here/docs/book"
image=${DOCS_REF:-tinybrains/docs:dev}

force=no
[ "${1:-}" = "--force" ] && force=yes

if [ -f "$out/index.html" ] && [ "$force" = no ]; then
    echo "vendor-book: docs/book is already built -- keeping it (--force to replace)"
    exit 0
fi

if ! command -v docker > /dev/null 2>&1; then
    # Inside the image build there is no docs/ and no docker socket, and the book arrives by
    # COPY --from=book regardless. Nothing to do is success, not a failure.
    echo "vendor-book: no docker -- /docs will 404 in the dev server until a book is built" >&2
    exit 0
fi

if ! docker image inspect "$image" > /dev/null 2>&1; then
    if ! docker pull -q "$image" > /dev/null 2>&1; then
        echo "vendor-book: cannot get $image -- /docs will 404 in the dev server." >&2
        echo "vendor-book:   build it with:  (cd ../devops && docker compose --profile build build docs)" >&2
        exit 0
    fi
fi

tmp=$(mktemp -d)
if ! cid=$(docker create "$image" 2> /dev/null); then
    rm -rf "$tmp"
    echo "vendor-book: cannot create a container from $image -- skipped" >&2
    exit 0
fi
if ! docker cp "$cid:/artifacts/book/." "$tmp/" > /dev/null 2>&1; then
    docker rm -f "$cid" > /dev/null 2>&1 || true; rm -rf "$tmp"
    echo "vendor-book: $image carries no /artifacts/book -- skipped" >&2
    exit 0
fi
docker rm -f "$cid" > /dev/null 2>&1 || true

if [ ! -f "$tmp/index.html" ]; then
    rm -rf "$tmp"
    echo "vendor-book: $image has no index.html under /artifacts/book -- skipped" >&2
    exit 0
fi

rm -rf "$out"
mkdir -p "$(dirname "$out")"
mv "$tmp" "$out"
chmod -R u+w "$out" 2> /dev/null || true

pages=$(find "$out" -name '*.html' | wc -l | tr -d ' ')
size=$(du -sk "$out" | cut -f1)
echo "vendor-book: docs/book <- $image  (${size}K, $pages pages)"
