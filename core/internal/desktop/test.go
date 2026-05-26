package desktop

import (
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
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

func defaultProxyTestAPIStyle(vendor profile.Profile, model profile.Model, providerID string) string {
	if st := strings.TrimSpace(string(model.APIStyle)); st != "" {
		return st
	}
	if providerID == provider.ClaudeCodeProviderID {
		return string(profile.NormalizeAPIStyle("claude"))
	}
	if providerID == provider.CodexProviderID {
		return string(profile.NormalizeAPIStyle("openai-responses"))
	}
	return string(profile.NormalizeAPIStyle("openai-chat"))
}

func resolveProbeStyles(kind agentkind.Kind, hit profile.VendorModelHit) (ingressStyle string, probeStyle apistyle.Style) {
	st := profile.IngressStyleForCLI(kind, hit)
	return string(st), st
}

// TestProviderModel probes connectivity via the local proxy ingress URL.
// When cliKind is set, the probe uses that CLI's fixed ingress style (cross-subscription path).
func TestProviderModel(providerID, modelID string, portOverride int, cliKindStr string) TestResult {
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

	apiStyleStr := defaultProxyTestAPIStyle(hit.Vendor, hit.Model, providerID)
	probeStyle := profile.NormalizeAPIStyle(apiStyleStr)
	cliKindStr = strings.TrimSpace(cliKindStr)
	if cliKindStr != "" {
		kind, parseErr := agentkind.Parse(cliKindStr)
		if parseErr != nil {
			return TestResult{
				OK: false, Passed: false, Summary: "测试失败",
				Error: parseErr.Error(),
				Text:  fmt.Sprintf("无效的 CLI 类型：%s", cliKindStr),
			}
		}
		apiStyleStr, probeStyle = resolveProbeStyles(kind, hit)
	}
	pathModelID, modelWire := profile.ResolveWireModelForIngress(hit, modelID)
	port := s.Proxy.Port
	if portOverride > 0 {
		port = portOverride
	}
	if port == 0 {
		port = 27483
	}
	baseURL := provider.BuildProxyIngressBaseURL(port, providerID, pathModelID, apiStyleStr)

	if err := testclient.Probe(probeStyle, baseURL, "clovapi-local", modelWire); err != nil {
		return TestResult{
			OK: true, Passed: false, Summary: "测试失败",
			Text:  fmt.Sprintf("连通性测试失败：%v", err),
			Error: err.Error(),
		}
	}
	return TestResult{
		OK: true, Passed: true, Summary: "测试成功",
		Text: fmt.Sprintf("已通过本地代理测试 %s/%s（%s）。", providerID, pathModelID, modelWire),
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
