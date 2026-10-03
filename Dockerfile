# syntax=docker/dockerfile:1

# THE REPLAY VIEWER COMES FROM THE CARTRIDGE'S OWN RELEASE, never a sibling checkout: this image's
# build context is web/ alone. A cartridge publishes its build output as a GitHub release, and this
# build takes the latest one unless ANTS_RELEASE names a tag. A new release is a new layer and an
# unchanged one is cached; `--build-context ants=../ants/dist` replaces the `ants` stage with a local
# build of an engine not released yet. cartridges.json lists the games; a Dockerfile cannot loop, so
# a second game is an entry there AND its stages here.
#
# AND EVERY ENGINE THE LADDER HAS PLAYED, BY DIGEST. A replay is re-simulated from its actions, so
# it is drawn by the viewer of the engine that played it: the release above is the CURRENT viewer
# (/cartridges/ants/), and each release in cartridges.json's `engines` is kept beside it under
# /cartridges/ants/engines/<hex>/, with engines.json saying which is which. The page refuses a
# match whose engine is in neither, rather than draw it with another.
#
# THE BOOK COMES FROM ITS OWN IMAGE TOO -- and it is docs/ in THIS repository, which is the one
# thing about that line that looks wrong and is not. The book's build wants mdBook, python3 and the
# `tinybrains` release binary; taking the rendered output
# instead keeps `docker compose build web` a node build. One repository, two artifacts.
# docs/Dockerfile builds that one, and its context is docs/.
#
# THE BOOK IN A RELEASE IS BUILT BY .github/workflows/release.yml and handed in with
# `--build-context book=<its rendered tree>`; docker-compose.yml does the same with `service:docs`.
#
# THE ARGs LIVE ABOVE THE FIRST FROM, and that is not style. An ARG after a FROM belongs to that
# stage, so a `FROM ${VAR}` below it resolves to nothing and the build fails with
# `base name should not be blank` -- only ARGs declared before the first FROM are global.
ARG ANTS_RELEASE=
ARG DOCS_REF=tinybrains/docs:dev

# The release unpacked and checked: the viewer must have been transpiled from the component beside
# it. Unset or empty is the latest; GitHub spells that URL differently from a tag's, which is what
# the two substitutions choose between.
FROM --platform=$BUILDPLATFORM curlimages/curl:8.22.0 AS ants-release
ARG ANTS_RELEASE
USER root
# The releases feed changes exactly when a release is published or edited, so ADDing it keys this
# stage's cache: the archive is fetched again after a new release and not otherwise. The archive
# itself is fetched by curl, not ADD or busybox wget: GitHub's download host resolves to four
# addresses, and on a network where one of them is unreachable ADD times out and wget retries that
# same address, while curl moves on to the next.
ADD https://github.com/Tiny-Brains/ants/releases.atom /tmp/ants-releases.atom
RUN set -eu; \
    url="https://github.com/Tiny-Brains/ants/releases/${ANTS_RELEASE:+download/}${ANTS_RELEASE:-latest/download}/ants-artifacts.tar.gz"; \
    curl -fsSL --connect-timeout 20 --retry 5 --retry-all-errors -o /tmp/ants-artifacts.tar.gz "$url"; \
    mkdir /artifacts; \
    tar -xzf /tmp/ants-artifacts.tar.gz -C /artifacts; \
    engine="sha256:$(sha256sum /artifacts/tb-ants.wasm | cut -d' ' -f1)"; \
    grep -q "\"engine_digest\": \"${engine}\"" /artifacts/viz/engine.json \
      || { echo "ants ${ANTS_RELEASE:-latest}: viz/ was not transpiled from the component beside it" >&2; exit 1; }; \
    echo "ants ${ANTS_RELEASE:-latest}: engine ${engine}"

# The tree alone, laid out as ants' dist/.
FROM scratch AS ants
COPY --from=ants-release /artifacts/ /

# Every engine the ladder has played, one tag a line, out of cartridges.json: the curl image has no
# JSON reader, and this stage's output is what keys the next one's cache. Releases are immutable, so
# the list changing is the only reason to fetch them again.
FROM --platform=$BUILDPLATFORM node:22-alpine AS ants-engine-list
COPY cartridges.json /tmp/cartridges.json
RUN node -e 'for (const t of require("/tmp/cartridges.json").games.ants.engines ?? []) console.log(t)' > /engines.txt

# Each one's viewer under its digest, checked as the current one is: the component's hash must start
# with the tag's twelve characters, and viz/ must have been transpiled from it. The modules are copied
# BY NAME, the same list as below; an older release that predates one (engine-cd656bc84c1a has no
# graph.js) may lack it only while none of its modules imports it.
FROM --platform=$BUILDPLATFORM curlimages/curl:8.22.0 AS ants-engines
USER root
COPY --from=ants-engine-list /engines.txt /tmp/engines.txt
RUN set -eu; \
    mkdir /engines; \
    for tag in $(cat /tmp/engines.txt); do \
      d=$(mktemp -d); \
      curl -fsSL --connect-timeout 20 --retry 5 --retry-all-errors -o "$d/a.tar.gz" \
        "https://github.com/Tiny-Brains/ants/releases/download/${tag}/ants-artifacts.tar.gz"; \
      tar -xzf "$d/a.tar.gz" -C "$d"; \
      hex="$(sha256sum "$d/tb-ants.wasm" | cut -d' ' -f1)"; \
      case "$hex" in "${tag#engine-}"*) ;; *) echo "ants ${tag}: its component is sha256:${hex}" >&2; exit 1 ;; esac; \
      grep -q "\"engine_digest\": \"sha256:${hex}\"" "$d/viz/engine.json" \
        || { echo "ants ${tag}: viz/ was not transpiled from the component beside it" >&2; exit 1; }; \
      mkdir -p "/engines/${hex}/engine"; \
      for f in viz.js shell.js render.js engine.js map.js graph.js; do \
        if [ -f "$d/viz/$f" ]; then cp "$d/viz/$f" "/engines/${hex}/"; \
        elif grep -q "\./$f" "$d"/viz/*.js; then echo "ants ${tag}: viz/$f is imported and missing" >&2; exit 1; fi; \
      done; \
      cp "$d/viz/engine/tb-ants.js" "$d/viz/engine/tb-ants.core.wasm" "/engines/${hex}/engine/"; \
      echo "ants ${tag}: kept by digest sha256:${hex}"; \
      rm -rf "$d"; \
    done

FROM --platform=$BUILDPLATFORM ${DOCS_REF} AS book

# ---- build the SPA -----------------------------------------------------------
#
# ON THE BUILD PLATFORM: the bundle is the same files for every target, so a multi-platform build
# makes it once and only the nginx stage below differs per platform.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build

WORKDIR /app

# Copied first so the dependency layer survives a source-only change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The eight files the browser actually fetches: viz.js and its closed module graph down to the
# transpiled component and its .wasm, and the two viz.js imports on first use: map.js when a board is
# drawn on its own (the map visual, /maps), and graph.js when a page mounts the match graph
# (`mountGraph`). Not react.js -- it imports the bare specifier "react" and
# cannot resolve when served from public/ -- and not the .d.ts files or engine.json, which no page
# downloads. THE WASM IS NOT OPTIONAL: the viewer re-simulates through the same component digest
# that recorded the match, which is what makes it and the referee unable to disagree.
#
# `--ignore-scripts` skips `prebuild`, which would fetch the viewer again for the dev loop -- the
# latest release, whatever ANTS_RELEASE pinned above.
COPY --from=ants /viz/viz.js /viz/shell.js /viz/render.js /viz/engine.js /viz/map.js /viz/graph.js /app/public/cartridges/ants/
COPY --from=ants /viz/engine/tb-ants.js /viz/engine/tb-ants.core.wasm /app/public/cartridges/ants/engine/

# Every engine the ladder has played, and the index the page picks a replay's viewer by. The current
# engine's digest is read from the release's own engine.json, which no page downloads.
COPY --from=ants-engines /engines/ /app/public/cartridges/ants/engines/
COPY --from=ants /viz/engine.json /tmp/ants-engine.json
RUN node scripts/engines-index.mjs public/cartridges/ants \
      "$(node -p 'require("/tmp/ants-engine.json").engine_digest')"

# `npm run build` is `tsc -b && vite build`, so a type error fails the image.
RUN npm run build --ignore-scripts

# THE SITEMAP IS WRITTEN LAST, BECAUSE THE BOOK IS MOST OF IT. `vite build` emits the
# application's own addresses and can emit nothing else: .dockerignore keeps docs/ out of this
# stage's context on purpose, and the rendered book is another image's artifact. So the book
# lands here -- in a throwaway directory, after the bundle is built, so a new chapter does not
# invalidate the node build -- and the SAME generator runs again over both halves. One
# generator, so the dev server, a local build and this image cannot disagree about a path.
COPY --from=book /artifacts/book/ /app/docs/book/
RUN node scripts/sitemap.mjs --book docs/book --out dist/sitemap.xml

# ---- serve it ----------------------------------------------------------------
FROM nginx:1.27-alpine

# Replaces the stock default.conf: SPA fallback plus the /v1 proxy that the whole
# auth flow depends on. See nginx.conf and README.md.
#
# The security headers are a snippet rather than four lines repeated in five locations, and it
# goes under snippets/ and NOT under conf.d/, every file of which nginx loads as configuration
# in its own right.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-security.conf /etc/nginx/snippets/security.conf
COPY --from=build /app/dist /usr/share/nginx/html

# The book at /docs, baked in rather than mounted: the book ships with the application it is
# served from, so /docs is never absent.
COPY --from=book /artifacts/book/ /usr/share/nginx/html/docs/

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz > /dev/null || exit 1
