# -----------------------------------------------------------------------------
# Stage 1: Next.js app in web/ (Bun)
# `next build` writes to .next/; runtime uses `next start` directly.
# We still keep a tiny web/build stub for Go embed compatibility.
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
# Stage 3: Runtime (single container runs frontend + backend)
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

RUN useradd -r -u 10001 -m -d /home/appuser appuser

COPY --from=backend /build/backend/new-api /
COPY --from=frontend /frontend/package.json /app/frontend/package.json
COPY --from=frontend /frontend/node_modules /app/frontend/node_modules
COPY --from=frontend /frontend/.next /app/frontend/.next
COPY --from=frontend /frontend/public /app/frontend/public
COPY scripts/start.sh /usr/local/bin/start.sh

RUN sed -i 's/\r$//' /usr/local/bin/start.sh \
    && chmod +x /usr/local/bin/start.sh

EXPOSE 3000 3500
WORKDIR /data
RUN chown -R appuser:appuser /data

USER appuser

ENTRYPOINT ["/usr/local/bin/start.sh"]
