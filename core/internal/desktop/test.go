package desktop

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
	"github.com/clovapi/switcher/internal/testclient"
)

type TestResult struct {
	OK      bool   `json:"ok"`
	Passed  bool   `json:"passed"`
	Summary string `json:"summary"`
	Text    string `json:"text,omitempty"`
	Error   string `json:"error,omitempty"`
}

const defaultModelTestAPIKey = "clovapi-test"

func proxyConfigForTest(s *profile.Store, portOverride int) profile.ProxyConfig {
	cfg := profile.ProxyConfig{Enabled: true, Host: profile.DefaultProxyHost, Port: profile.DefaultProxyPort}
	if s != nil {
		cfg = s.Proxy
	}
	if strings.TrimSpace(cfg.Host) == "" {
		cfg.Host = profile.DefaultProxyHost
	}
	if cfg.Port == 0 {
		cfg.Port = profile.DefaultProxyPort
	}
	if portOverride > 0 {
		cfg.Port = portOverride
	}
	return cfg
}

func proxyHealthClientHost(bindHost string) string {
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

func proxyHealthURL(cfg profile.ProxyConfig) string {
	host := proxyHealthClientHost(cfg.Host)
	return "http://" + net.JoinHostPort(host, strconv.Itoa(cfg.Port)) + "/health"
}

func probeProxyHealth(cfg profile.ProxyConfig) bool {
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(proxyHealthURL(cfg))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false
	}
	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return false
	}
	ok, _ := body["ok"].(bool)
	service, _ := body["service"].(string)
	return ok && strings.Contains(service, "clovapi-core-proxy")
}

func waitProxyHealth(cfg profile.ProxyConfig, deadline time.Duration) error {
	deadlineAt := time.Now().Add(deadline)
	for time.Now().Before(deadlineAt) {
		if probeProxyHealth(cfg) {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("鏈湴浠ｇ悊鏈氨缁? %s", proxyHealthURL(cfg))
}

func ensureProxyForTest(cfg profile.ProxyConfig) error {
	if probeProxyHealth(cfg) {
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("鎵句笉鍒?clovapi 鍙墽琛屾枃浠? %w", err)
	}
	cmd := exec.Command(exe, "proxy", "start", "--host", cfg.Host, "--port", strconv.Itoa(cfg.Port))
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("鍚姩鏈湴浠ｇ悊澶辫触: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return waitProxyHealth(cfg, 15*time.Second)
}

// TestProviderModel probes connectivity via the local proxy ingress URLs.
// Desktop model tests intentionally hit both Responses and Messages ingress
// routes so the call log captures the two core protocol paths.
func TestProviderModel(providerID, modelID string, portOverride int) TestResult {
	providerID = strings.TrimSpace(providerID)
	modelID = strings.TrimSpace(modelID)
	if providerID == "" || modelID == "" {
		return TestResult{
			OK: false, Passed: false, Summary: "Test failed", Error: "provider/model is required",
			Text: "Pass both provider and model to run a proxy connectivity test.",
		}
	}

	s, err := profile.LoadDesktop()
	if err != nil {
		return TestResult{OK: false, Passed: false, Summary: "Test failed", Error: err.Error()}
	}

	hit, ok := profile.FindProviderModel(s, providerID, modelID)
	if !ok {
		return TestResult{
			OK: false, Passed: false, Summary: "Test failed", Error: fmt.Sprintf("model not found: %s/%s", providerID, modelID),
			Text: fmt.Sprintf("The configured provider models do not include %s/%s.", providerID, modelID),
		}
	}

	if !provider.IsFixedProviderID(providerID) {
		return TestResult{
			OK: false, Passed: false, Summary: "Test failed",
			Error: fmt.Sprintf("unsupported provider: %s", providerID),
		}
	}
	proxyCfg := proxyConfigForTest(s, portOverride)
	if err := ensureProxyForTest(proxyCfg); err != nil {
		return TestResult{
			OK: true, Passed: false, Summary: "Test failed",
			Text:  fmt.Sprintf("local proxy is unavailable: %v", err),
			Error: err.Error(),
		}
	}

	pathModelID, modelWire := profile.ResolveWireModelForIngress(hit, modelID)
	responsesBaseURL := provider.BuildProxyIngressBaseURL(proxyCfg.Port, providerID)
	claudeBaseURL := provider.BuildProxyIngressBaseURL(proxyCfg.Port, providerID)

	if err := testclient.ProbeToolRoundTrip(responsesBaseURL, claudeBaseURL, defaultModelTestAPIKey, modelWire); err != nil {
		return TestResult{
			OK: true, Passed: false, Summary: "Test failed",
			Text:  fmt.Sprintf("connectivity probe failed: %v", err),
			Error: err.Error(),
		}
	}
	return TestResult{
		OK: true, Passed: true, Summary: "Test passed",
		Text: fmt.Sprintf("Local proxy probe passed for %s/%s (%s): responses + message.", providerID, pathModelID, modelWire),
	}
}
