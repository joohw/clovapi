FROM golang:1.25-alpine AS builder

WORKDIR /src/core
COPY core/go.mod core/go.sum ./
RUN go mod download
COPY core ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/clovapi-backend ./cmd/backend

FROM alpine:3.22
RUN addgroup -S clovapi && adduser -S -G clovapi clovapi && mkdir -p /data && chown clovapi:clovapi /data
COPY --from=builder /out/clovapi-backend /usr/local/bin/clovapi-backend

ENV CLOVAPI_BACKEND_LISTEN=:3100 CLOVAPI_DB_PATH=/data/clovapi.db
EXPOSE 3100
VOLUME ["/data"]
USER clovapi
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O - http://127.0.0.1:3100/health >/dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/clovapi-backend"]
