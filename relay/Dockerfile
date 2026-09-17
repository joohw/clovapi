FROM golang:1.25-alpine AS builder

WORKDIR /src/core

COPY core/go.mod core/go.sum ./
RUN go mod download

COPY core ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/clovapi-relay ./cmd/relay

FROM alpine:3.22

RUN addgroup -S clovapi && adduser -S -G clovapi clovapi

COPY --from=builder /out/clovapi-relay /usr/local/bin/clovapi-relay

ENV CLOVAPI_RELAY_LISTEN=:3100

EXPOSE 3100

USER clovapi

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3100/health >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/clovapi-relay"]
