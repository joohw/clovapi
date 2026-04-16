# -----------------------------------------------------------------------------
# Stage 1: Next.js app in web/ (Bun)
# `next build` writes to .next/; main.go still uses go:embed on web/build, so we
# add a tiny stub index.html after the Next build for compile-time embed only.
# Runtime UI is served from FRONTEND_BASE_URL (see README).
# -----------------------------------------------------------------------------
FROM oven/bun:1@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7 AS frontend

WORKDIR /frontend

ENV NEXT_TELEMETRY_DISABLED=1

COPY web/package.json web/bun.lock ./
RUN bun install

COPY web/ ./
RUN bun run build \
    && mkdir -p build \
    && printf '%s\n' \
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>new-api</title></head><body><p>Configure <code>FRONTEND_BASE_URL</code> to your Next.js server; API stays on this process.</p></body></html>' \
      > build/index.html

# -----------------------------------------------------------------------------
# Stage 2: Go binary (embeds web/build from stage 1)
# -----------------------------------------------------------------------------
FROM golang:1.26.1-alpine@sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039 AS backend

ENV GO111MODULE=on CGO_ENABLED=0

ARG TARGETOS
ARG TARGETARCH
ENV GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64}
ENV GOEXPERIMENT=greenteagc

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .
COPY --from=frontend /frontend/build ./web/build

RUN go build -ldflags "-s -w" -o new-api

# -----------------------------------------------------------------------------
# Stage 3: Runtime
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim@sha256:f06537653ac770703bc45b4b113475bd402f451e85223f0f2837acbf89ab020a

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata libasan8 wget \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

COPY --from=backend /build/new-api /

EXPOSE 3000
WORKDIR /data

ENTRYPOINT ["/new-api"]
