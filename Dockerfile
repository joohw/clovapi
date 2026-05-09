# -----------------------------------------------------------------------------
# Stage 1: Next.js app in web/ (Bun)
# `next build` writes to .next/; main.go still uses go:embed on web/build, so we
# add a tiny stub index.html after the Next build for compile-time embed only.
# Runtime UI is served from FRONTEND_BASE_URL (see README).
# -----------------------------------------------------------------------------
FROM oven/bun:1.3.13 AS frontend

WORKDIR /frontend

ENV NEXT_TELEMETRY_DISABLED=1

COPY web/package.json web/bun.lock ./
RUN set -eux; \
    bun install --frozen-lockfile || { \
      echo "bun install failed, clear cache and retry once..."; \
      rm -rf /root/.bun/install/cache; \
      bun install --frozen-lockfile; \
    }

COPY web/ ./
RUN bun run build \
    && mkdir -p build \
    && printf '%s\n' \
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>new-api</title></head><body><p>Configure <code>FRONTEND_BASE_URL</code> to your Next.js server; API stays on this process.</p></body></html>' \
      > build/index.html

# -----------------------------------------------------------------------------
# Stage 2: Go binary from backend/ (embeds web/build from stage 1)
# -----------------------------------------------------------------------------
FROM golang:1.26.1-alpine AS backend

ENV GO111MODULE=on CGO_ENABLED=0

ARG TARGETOS
ARG TARGETARCH
ENV GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64}
ENV GOEXPERIMENT=greenteagc

WORKDIR /build

COPY backend/go.mod backend/go.sum ./backend/
WORKDIR /build/backend
RUN go mod download

COPY backend/ ./
COPY --from=frontend /frontend/build ./web/build

RUN go build -trimpath -ldflags "-s -w" -o new-api

# -----------------------------------------------------------------------------
# Stage 3: Runtime
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

RUN useradd -r -u 10001 -m -d /home/appuser appuser

COPY --from=backend /build/backend/new-api /

EXPOSE 3000
WORKDIR /data
RUN chown -R appuser:appuser /data

USER appuser

ENTRYPOINT ["/new-api"]
