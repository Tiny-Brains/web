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
# viewer, and the `tinybrains` binary that plays the lesson replays -- and both used to be reached
# through a sibling checkout: the ants viewer bundle and a `cargo install` of the CLI. So
# building the book required the platform checked out around it, and `src/viz/` and `src/tutorials/`
# were committed to spare everyone that. The viewer now comes from the cartridge's artifact image and
# the binary from a GitHub release, and neither is committed.
#
# A LESSON REPLAY IS ENGINE OUTPUT, exactly as the reference observations are: it is produced by
# playing a written script through the real cartridge, so what a page shows is what the rules do
# rather than a drawing of what someone believed they do. That is also why it goes stale when the
# engine changes -- and why the digest check at the end of tutorials/build.sh is not optional. A
# viewer re-simulating with a different engine does not fail: it draws a plausible match that never
# happened.

ARG ANTS_REF=tinybrains/ants:dev
# The `tinybrains` release the lessons are played with (github.com/Tiny-Brains/cli). PINNED: a new
# CLI release reaches the book when this line moves, not when the release is cut.
ARG CLI_VERSION=0.1.0
ARG RUST_VERSION=1.98.1
# 0.5.4 is what this book is written against, and the musl builds are the only ones published
# for both architectures -- there is no aarch64-unknown-linux-gnu asset.
ARG MDBOOK_VERSION=0.5.4
ARG BUSYBOX_VERSION=1.37-musl

FROM ${ANTS_REF} AS ants

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

# The cartridge's /artifacts/ is laid out the way a `path` entry in a games registry expects -- the
# component by extension, cartridge.json beside it, maps/ and viz/ under it, exactly as an ants
# checkout's dist/ -- so it is both the registry entry and where build.sh finds the viewer.
# `tinybrains` knows no game and carries no registry -- it resolves one from a file -- so this is
# the registry, written here.
COPY --from=ants /artifacts/ /cartridge/ants/
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
