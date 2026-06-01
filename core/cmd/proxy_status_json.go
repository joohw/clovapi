package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/clovapi/switcher/internal/profile"
)

type proxyStatusJSON struct {
	OK        bool           `json:"ok"`
	Running   bool           `json:"running"`
	Host      string         `json:"host"`
	Port      int            `json:"port"`
	BaseURL   string         `json:"baseUrl"`
	HealthURL string         `json:"healthUrl"`
	Body      map[string]any `json:"body,omitempty"`
	Error     string         `json:"error,omitempty"`
	LatencyMs int64          `json:"latencyMs,omitempty"`
	Passed    bool           `json:"passed,omitempty"`
}

func probeProxyHealthBody(cfg profile.ProxyConfig) (bool, map[string]any, int64, error) {
	started := time.Now()
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(proxyHealthURL(cfg))
	latencyMs := time.Since(started).Milliseconds()
	if err != nil {
		return false, nil, latencyMs, err
	}
	defer resp.Body.Close()
	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return false, nil, latencyMs, err
	}
	ok, _ := body["ok"].(bool)
	service, _ := body["service"].(string)
	running := resp.StatusCode == http.StatusOK && ok && strings.Contains(service, "clovapi-core-proxy")
	return running, body, latencyMs, nil
}

func buildProxyStatusJSON(cfg profile.ProxyConfig, includeLatency bool) proxyStatusJSON {
	host := strings.TrimSpace(cfg.Host)
	if host == "" {
		host = "127.0.0.1"
	}
	port := cfg.Port
	if port <= 0 {
		port = 27483
	}
	clientHost := proxyHealthClientHost(host)
	baseURL := fmt.Sprintf("http://%s:%d", clientHost, port)
	healthURL := proxyHealthURL(cfg)
	out := proxyStatusJSON{
		OK:        true,
		Host:      host,
		Port:      port,
		BaseURL:   baseURL,
		HealthURL: healthURL,
	}
	running, body, latencyMs, err := probeProxyHealthBody(cfg)
	out.Running = running
	out.Passed = running
	out.Body = body
	if includeLatency {
		out.LatencyMs = latencyMs
	}
	if err != nil {
		out.Error = err.Error()
	} else if !running {
		out.Error = "health mismatch"
	}
	return out
}

func writeProxyStatusJSON(cfg profile.ProxyConfig, includeLatency bool) error {
	out := buildProxyStatusJSON(cfg, includeLatency)
	data, err := json.Marshal(out)
	if err != nil {
		return err
	}
	fmt.Println(string(data))
	return nil
}
