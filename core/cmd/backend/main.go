// Command backend runs the platform control plane and Relay in one Go process.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/clovapi/switcher/internal/platformbackend"
	"github.com/clovapi/switcher/internal/relay"
)

func main() {
	listen := flag.String("listen", env("CLOVAPI_BACKEND_LISTEN", ":3100"), "Public HTTP listen address")
	database := flag.String("database", env("CLOVAPI_DB_PATH", "/data/clovapi.db"), "SQLite database path")
	frontend := flag.String("frontend", os.Getenv("CLOVAPI_FRONTEND_URL"), "Optional Next.js frontend origin for compatibility proxying")
	flag.Parse()

	store, err := platformbackend.Open(*database)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer store.Close()
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	cfg := relay.Config{
		Controller:  store,
		FrontendURL: *frontend,
		Secret:      os.Getenv("CLOVAPI_RELAY_SECRET"),
		TrustProxy:  strings.EqualFold(os.Getenv("CLOVAPI_RELAY_TRUST_PROXY"), "true"),
		ServiceName: "clovapi-backend",
	}
	relayServer, err := relay.New(cfg)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer relayServer.Close()
	api := platformbackend.NewAPI(store, relayServer, platformbackend.APIConfig{
		AuthSecret:     os.Getenv("AUTH_SECRET"),
		ResendAPIKey:   os.Getenv("RESEND_API_KEY"),
		ResendFrom:     os.Getenv("RESEND_FROM"),
		PublicOrigin:   env("CLOVAPI_PUBLIC_ORIGIN", "http://127.0.0.1:3100"),
		AllowedOrigins: split(os.Getenv("CLOVAPI_ALLOWED_ORIGINS")),
		SecureCookies:  strings.EqualFold(os.Getenv("CLOVAPI_SECURE_COOKIES"), "true"),
	})
	server := &http.Server{Addr: *listen, Handler: api, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 75 * time.Second, MaxHeaderBytes: 32 * 1024, ErrorLog: log.New(io.Discard, "", 0)}
	go func() {
		<-ctx.Done()
		shutdown, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		_ = server.Shutdown(shutdown)
	}()
	if err = server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func split(value string) []string {
	result := []string{}
	for _, item := range strings.Split(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			result = append(result, item)
		}
	}
	return result
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
