# syntax=docker/dockerfile:1

# THE REPLAY VIEWER COMES FROM THE CARTRIDGE'S OWN IMAGE.
#
# It used to be copied out of a sibling checkout by scripts/vendor-viewers.sh and committed under
# public/cartridges/, because this image's build context is web/ alone and cannot reach a sibling.
# That made a checkout of ants beside this one part of the build -- and worse, the script ran from
# `predev`/`prebuild`, so a plain `npm run dev` silently rewrote checked-in files.
#
# A cartridge now publishes its build output as an image, and a named build context reaches it from
# anywhere. cartridges.json lists the games; a Dockerfile cannot loop, so a second game is an entry
# there AND a FROM line here.
ARG ANTS_REF=tinybrains/ants:dev
FROM ${ANTS_REF} AS ants

# ---- build the SPA -----------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Copied first so the dependency layer survives a source-only change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The six files the browser actually fetches: viz.js and its closed module graph down to the
# transpiled component and its .wasm. Not react.js -- it imports the bare specifier "react" and
# cannot resolve when served from public/ -- and not the .d.ts files or engine.json, which no page
# downloads. THE WASM IS NOT OPTIONAL: the viewer re-simulates through the same component digest
# that recorded the match, which is what makes it and the referee unable to disagree.
#
# This runs before `npm run build` on purpose: `prebuild` runs vendor-viewers.sh, which finds the
# files already here, sees no docker socket, and leaves them alone.
COPY --from=ants /artifacts/viz/viz.js /artifacts/viz/shell.js /artifacts/viz/render.js /artifacts/viz/engine.js /app/public/cartridges/ants/
COPY --from=ants /artifacts/viz/engine/tb-ants.js /artifacts/viz/engine/tb-ants.core.wasm /app/public/cartridges/ants/engine/

# `npm run build` is `tsc -b && vite build`, so a type error fails the image.
RUN npm run build

# ---- serve it ----------------------------------------------------------------
FROM nginx:1.27-alpine

# Replaces the stock default.conf: SPA fallback plus the /v1 proxy that the whole
# auth flow depends on. See nginx.conf and ../web/README.md.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1
