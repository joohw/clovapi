package relay

import (
	"context"
	"os"
	"strings"
)

// EnvironmentConfig keeps the standalone relay and the bundled CLI identical.
func EnvironmentConfig() Config {
	return Config{ControlPlaneURL: envDefault("CLOVAPI_CONTROL_PLANE_URL", "http://127.0.0.1:3101"), Secret: os.Getenv("CLOVAPI_RELAY_SECRET"), TrustProxy: strings.EqualFold(os.Getenv("CLOVAPI_RELAY_TRUST_PROXY"), "true")}
}

func DefaultListen() string { return envDefault("CLOVAPI_RELAY_LISTEN", ":3100") }

func envDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

// Serve starts the relay with environment defaults and explicit flag overrides.
func Serve(ctx context.Context, listen, controlPlane string) error {
	cfg := EnvironmentConfig()
	cfg.ControlPlaneURL = controlPlane
	return Run(ctx, listen, cfg)
}
