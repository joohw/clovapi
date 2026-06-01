package proxycontrol

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/clovapi/switcher/internal/profile"
)

// PauseIfRunning stops the local clovapi proxy when it is healthy.
// Returns true when a running proxy was stopped (caller may restart later).
func PauseIfRunning() bool {
	s, err := profile.Load()
	if err != nil || !s.Proxy.Enabled {
		return false
	}
	cfg := s.Proxy
	ok, err := probeHealth(cfg)
	if err != nil || !ok {
		return false
	}
	_ = shutdownViaHTTP(cfg)
	_ = waitDown(cfg, 5*time.Second)
	return true
}

func probeHealth(cfg profile.ProxyConfig) (bool, error) {
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(healthURL(cfg))
	if err != nil {
		return false, nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false, nil
	}
	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return false, nil
	}
	ok, _ := body["ok"].(bool)
	service, _ := body["service"].(string)
	return ok && strings.Contains(service, "clovapi-core-proxy"), nil
}

func shutdownViaHTTP(cfg profile.ProxyConfig) bool {
	req, err := http.NewRequest(http.MethodPost, baseURL(cfg)+"/__debug/shutdown", nil)
	if err != nil {
		return false
	}
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func waitDown(cfg profile.ProxyConfig, deadline time.Duration) error {
	deadlineAt := time.Now().Add(deadline)
	for time.Now().Before(deadlineAt) {
		ok, err := probeHealth(cfg)
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("proxy still healthy at %s", healthURL(cfg))
}

func healthClientHost(bindHost string) string {
	host := strings.TrimSpace(bindHost)
	if host == "" {
		return "127.0.0.1"
	}
	switch strings.ToLower(host) {
	case "0.0.0.0", "::", "::ffff:0.0.0.0":
		return "127.0.0.1"
	default:
		return host
	}
}

func healthURL(cfg profile.ProxyConfig) string {
	host := healthClientHost(cfg.Host)
	return fmt.Sprintf("http://%s:%d/health", host, cfg.Port)
}

func baseURL(cfg profile.ProxyConfig) string {
	host := healthClientHost(cfg.Host)
	return fmt.Sprintf("http://%s:%d", host, cfg.Port)
}
