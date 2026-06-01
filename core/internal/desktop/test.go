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

func proxyConfigForTest(s *profile.Store, portOverride int) profile.ProxyConfig {
	cfg := profile.ProxyConfig{Enabled: true, Host: "127.0.0.1", Port: 27483}
	if s != nil {
		cfg = s.Proxy
	}
	if strings.TrimSpace(cfg.Host) == "" {
		cfg.Host = "127.0.0.1"
	}
	if cfg.Port == 0 {
		cfg.Port = 27483
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
	return fmt.Errorf("本地代理未就绪: %s", proxyHealthURL(cfg))
}

func ensureProxyForTest(cfg profile.ProxyConfig) error {
	if probeProxyHealth(cfg) {
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("找不到 clovapi 可执行文件: %w", err)
	}
	cmd := exec.Command(exe, "proxy", "start", "--host", cfg.Host, "--port", strconv.Itoa(cfg.Port))
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("启动本地代理失败: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return waitProxyHealth(cfg, 15*time.Second)
}

// TestProviderModel probes connectivity via the local proxy ingress URLs.
// Desktop model tests intentionally hit both Responses and Messages ingress
// routes so the call log captures the two core protocol paths.
func TestProviderModel(providerID, modelID string, portOverride int, cliKindStr string) TestResult {
	_ = strings.TrimSpace(cliKindStr)
	providerID = strings.TrimSpace(providerID)
	modelID = strings.TrimSpace(modelID)
	if providerID == "" || modelID == "" {
		return TestResult{
			OK: false, Passed: false, Summary: "测试失败", Error: "未指定测试目标",
			Text: "未指定要测试的 provider/model。",
		}
	}

	s, err := profile.LoadDesktop()
	if err != nil {
		return TestResult{OK: false, Passed: false, Summary: "测试失败", Error: err.Error()}
	}

	hit, ok := profile.FindProviderModel(s, providerID, modelID)
	if !ok {
		return TestResult{
			OK: false, Passed: false, Summary: "测试失败", Error: fmt.Sprintf("未找到模型: %s/%s", providerID, modelID),
			Text: fmt.Sprintf("未在供应商配置中找到该模型（%s/%s）。请先拉取或添加模型。", providerID, modelID),
		}
	}

	if !provider.IsFixedProviderID(providerID) {
		return TestResult{
			OK: false, Passed: false, Summary: "测试失败",
			Error: fmt.Sprintf("不支持的供应商: %s", providerID),
		}
	}
	proxyCfg := proxyConfigForTest(s, portOverride)
	if err := ensureProxyForTest(proxyCfg); err != nil {
		return TestResult{
			OK: true, Passed: false, Summary: "测试失败",
			Text:  fmt.Sprintf("本地代理不可用：%v", err),
			Error: err.Error(),
		}
	}

	pathModelID, modelWire := profile.ResolveWireModelForIngress(hit, modelID)
	responsesBaseURL := provider.BuildProxyIngressBaseURL(proxyCfg.Port, providerID)
	claudeBaseURL := provider.BuildProxyIngressBaseURL(proxyCfg.Port, providerID)

	if err := testclient.ProbeToolRoundTrip(responsesBaseURL, claudeBaseURL, "clovapi-local", modelWire); err != nil {
		return TestResult{
			OK: true, Passed: false, Summary: "测试失败",
			Text:  fmt.Sprintf("连通性测试失败：%v", err),
			Error: err.Error(),
		}
	}
	return TestResult{
		OK: true, Passed: true, Summary: "测试成功",
		Text: fmt.Sprintf("已通过本地代理工具测试 %s/%s（%s）：openai-responses + anthropic messages。", providerID, pathModelID, modelWire),
	}
}

// TestBinding is deprecated compatibility for old desktop/CLI callers.
func TestBinding(binding string, portOverride int, cliKindStr string) TestResult {
	s, err := profile.LoadDesktop()
	if err != nil {
		return TestResult{OK: false, Passed: false, Summary: "测试失败", Error: err.Error()}
	}
	sel, ok := s.ActiveSelectionFromLegacyValue(binding)
	if !ok {
		return TestResult{
			OK: false, Passed: false, Summary: "测试失败", Error: "binding 格式无效",
			Text: fmt.Sprintf("无效的模型绑定：%s", binding),
		}
	}
	return TestProviderModel(sel.ProviderID, sel.ModelID, portOverride, cliKindStr)
}
