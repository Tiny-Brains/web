# syntax=docker/dockerfile:1

# THE REPLAY VIEWER COMES FROM THE CARTRIDGE'S OWN RELEASE, never a sibling checkout: this image's
# build context is web/ alone. A cartridge publishes its build output as a GitHub release, and this
# build takes the latest one unless ANTS_RELEASE names a tag. A new release is a new layer and an
# unchanged one is cached; `--build-context ants=../ants/dist` replaces the `ants` stage with a local
# build of an engine not released yet. cartridges.json lists the games; a Dockerfile cannot loop, so
# a second game is an entry there AND a pair of stages here.
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

# The seven files the browser actually fetches: viz.js and its closed module graph down to the
# transpiled component and its .wasm, and map.js, which viz.js imports when a board is drawn on its
# own (the map visual, /maps). Not react.js -- it imports the bare specifier "react" and
# cannot resolve when served from public/ -- and not the .d.ts files or engine.json, which no page
# downloads. THE WASM IS NOT OPTIONAL: the viewer re-simulates through the same component digest
# that recorded the match, which is what makes it and the referee unable to disagree.
#
# `--ignore-scripts` skips `prebuild`, which would fetch the viewer again for the dev loop -- the
# latest release, whatever ANTS_RELEASE pinned above.
COPY --from=ants /viz/viz.js /viz/shell.js /viz/render.js /viz/engine.js /viz/map.js /app/public/cartridges/ants/
COPY --from=ants /viz/engine/tb-ants.js /viz/engine/tb-ants.core.wasm /app/public/cartridges/ants/engine/

# `npm run build` is `tsc -b && vite build`, so a type error fails the image.
RUN npm run build --ignore-scripts

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
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1
