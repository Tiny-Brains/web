# syntax=docker/dockerfile:1

# ---- build the SPA -----------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Copied first so the dependency layer survives a source-only change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
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
