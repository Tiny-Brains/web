# syntax=docker/dockerfile:1

# The competitor guide, built. The output is `book/`, which web's own Dockerfile copies to
# /usr/share/nginx/html/docs -- the book ships inside the application that serves it.
#
# WHY THIS IS A SEPARATE IMAGE FROM A SUBDIRECTORY OF THE SAME REPOSITORY. The book's build wants
# mdBook, python3 and the `tinybrains` binary, which is downloaded here as a release. Inlining these
# stages next door would make `docker compose build web` depend on all three. One repository, two
# artifacts; the context is docs/ and the node build beside it is not in it.
#
# WHY THIS EXISTS. Two of this book's inputs are other repositories' build output -- the replay
# viewer, and the `tinybrains` binary that plays the lesson replays. Both come from GitHub releases,
# so building the book needs no sibling checkout, and neither is committed.
#
# A LESSON REPLAY IS ENGINE OUTPUT, exactly as the reference observations are: it is produced by
# playing a written script through the real cartridge, so what a page shows is what the rules do
# rather than a drawing of what someone believed they do. That is also why it goes stale when the
# engine changes -- and why the digest check at the end of tutorials/build.sh is not optional. A
# viewer re-simulating with a different engine does not fail: it draws a plausible match that never
# happened.

# The ants release the lessons are played on and the viewer comes from. Unset or empty is the LATEST,
# whenever this image builds -- the same default kalam's package and web take, so a stack built
# together plays and draws one engine. `--build-context ants=../ants/dist` uses a local build.
ARG ANTS_RELEASE=
# The `tinybrains` release the lessons are played with (github.com/Tiny-Brains/cli). PINNED: a new
# CLI release reaches the book when this line moves, not when the release is cut.
ARG CLI_VERSION=0.3.0
ARG RUST_VERSION=1.98.1
# 0.5.4 is what this book is written against, and the musl builds are the only ones published
# for both architectures -- there is no aarch64-unknown-linux-gnu asset.
ARG MDBOOK_VERSION=0.5.4
ARG BUSYBOX_VERSION=1.37-musl

# ---- the cartridge -------------------------------------------------------------
#
# The release unpacked and checked: the viewer must have been transpiled from the component beside
# it. GitHub spells the latest release's URL differently from a tag's, which is what the two
# substitutions choose between.
FROM curlimages/curl:8.22.0 AS ants-release
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

# ---- the lesson replays, and the viewer that plays them -----------------------
#
# Trixie rather than bookworm. The reason was `ort`'s prebuilt onnxruntime wanting a newer
# libstdc++; the CLI links `tract` now, which is pure Rust, and its Linux release needs glibc 2.35,
# which either base has. python3 for make-map.py and the digest check.
FROM rust:${RUST_VERSION}-trixie AS lessons
ARG CLI_VERSION
ARG TARGETARCH
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 \
 && rm -rf /var/lib/apt/lists/*

# The release archive for this build's architecture, refused unless it hashes to what the same
# release's SHA256SUMS says. The CLI publishes no image: a Docker build takes the binary a person
# would install.
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) target=x86_64-unknown-linux-gnu ;; \
      arm64) target=aarch64-unknown-linux-gnu ;; \
      *) echo "tinybrains publishes no ${TARGETARCH} linux build" >&2; exit 1 ;; \
    esac; \
    archive="tinybrains-${target}.tar.gz"; \
    base="https://github.com/Tiny-Brains/cli/releases/download/v${CLI_VERSION}"; \
    cd /tmp; \
    curl -fsSLO "${base}/${archive}"; \
    curl -fsSL "${base}/SHA256SUMS" | grep " ${archive}\$" | sha256sum -c -; \
    tar -xzf "${archive}" -C /usr/local/bin tinybrains; \
    rm "${archive}"; \
    tinybrains --version

# The cartridge's release is laid out the way a `path` entry in a games registry expects -- the
# component by extension, cartridge.json beside it, maps/ and viz/ under it, exactly as an ants
# checkout's dist/ -- so it is both the registry entry and where build.sh finds the viewer.
# `tinybrains` knows no game and carries no registry -- it resolves one from a file -- so this is
# the registry, written here.
COPY --from=ants / /cartridge/ants/
RUN printf '[games.ants]\nname = "Ants"\npath = "/cartridge/ants"\n' > /cartridge/registry.toml
ENV TINYBRAINS_REGISTRY=/cartridge/registry.toml
ENV ANTS_DIST=/cartridge/ants

WORKDIR /src
COPY tutorials/ ./tutorials/

RUN mkdir -p src && tutorials/build.sh

# ---- the book ----------------------------------------------------------------
FROM rust:${RUST_VERSION}-trixie AS book
ARG MDBOOK_VERSION
ARG TARGETARCH
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) arch=x86_64-unknown-linux-musl ;; \
      arm64) arch=aarch64-unknown-linux-musl ;; \
      *) echo "no mdbook build for ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/rust-lang/mdBook/releases/download/v${MDBOOK_VERSION}/mdbook-v${MDBOOK_VERSION}-${arch}.tar.gz" \
      | tar -xz -C /usr/local/bin; \
    mdbook --version

WORKDIR /src
COPY . .
# `create-missing = false`: a SUMMARY entry with no file is an error, so the generated pages have to
# be in place before mdbook runs.
COPY --from=lessons /src/src/tutorials/ ./src/tutorials/
COPY --from=lessons /src/src/viz/       ./src/viz/
RUN mdbook build

# MDBOOK'S OWN LOGO, OUT OF OUR ARTIFACT. mdBook writes theme/favicon.{svg,png} into the output
# unless a theme overrides them, and this book overrides neither: index.hbs links the APPLICATION's
# two icons instead, root-relative and off the shared origin, which is the same pair web/index.html
# links and the reason there is no mark drawn in theme/ any more. So what mdBook emits here is its
# own book glyph, referenced by nothing -- dead bytes carrying someone else's brand. The names are
# content-hashed, hence the glob.
RUN rm -f book/favicon*.svg book/favicon*.png

# ---- the carrier -------------------------------------------------------------
FROM busybox:${BUSYBOX_VERSION}
LABEL org.opencontainers.image.title="TinyBrains competitor guide" \
      org.opencontainers.image.source="https://github.com/Tiny-Brains/web" \
      org.opencontainers.image.description="the mdBook competitor guide, rendered"

COPY --from=book /src/book/ /artifacts/book/

# `docker run --rm -v docs-book:/out tinybrains/docs:dev` populates a volume with the rendered book.
CMD ["sh", "-c", "cp -a /artifacts/. /out/"]
