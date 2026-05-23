package desktop

import (
	"fmt"
	"strings"

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

// TestBinding probes connectivity via the local proxy ingress URL.
func TestBinding(binding string, portOverride int) TestResult {
	binding = strings.TrimSpace(binding)
	if binding == "" {
		return TestResult{
			OK: false, Passed: false, Summary: "测试失败", Error: "未指定测试目标",
			Text: "未指定要测试的模型绑定（@model:供应商/模型）。",
		}
	}

	s, err := profile.LoadDesktop()
	if err != nil {
		return TestResult{OK: false, Passed: false, Summary: "测试失败", Error: err.Error()}
	}

	vendorName, modelID, ok := profile.ParseModelBinding(binding)
	if !ok {
		return TestResult{
			OK: false, Passed: false, Summary: "测试失败", Error: "binding 格式无效",
			Text: fmt.Sprintf("无效的模型绑定：%s", binding),
		}
	}
	hit, ok := profile.FindVendorModel(s, vendorName, modelID)
	if !ok {
		return TestResult{
			OK: false, Passed: false, Summary: "测试失败", Error: fmt.Sprintf("未找到模型: %s", binding),
			Text: fmt.Sprintf("未在供应商配置中找到该模型（%s）。请先拉取或添加模型；无需在「Agent 管理」中绑定即可测试。", binding),
		}
	}

	providerID := profile.ProviderIDFromStoreProfile(hit.Vendor)
	if !provider.IsFixedProviderID(providerID) {
		return TestResult{
			OK: false, Passed: false, Summary: "测试失败",
			Error: fmt.Sprintf("不支持的供应商: %s", vendorName),
		}
	}

	apiStyleStr := defaultProxyTestAPIStyle(hit.Vendor, hit.Model, providerID)
	pathModelID, modelWire := profile.ResolveWireModelForIngress(hit, modelID)
	port := s.Proxy.Port
	if portOverride > 0 {
		port = portOverride
	}
	if port == 0 {
		port = 27483
	}
	baseURL := provider.BuildProxyIngressBaseURL(port, providerID, pathModelID, apiStyleStr)
	style := profile.NormalizeAPIStyle(apiStyleStr)

	if err := testclient.Probe(style, baseURL, "clovapi-local", modelWire); err != nil {
		return TestResult{
			OK: true, Passed: false, Summary: "测试失败",
			Text:  fmt.Sprintf("连通性测试失败：%v", err),
			Error: err.Error(),
		}
	}
	return TestResult{
		OK: true, Passed: true, Summary: "测试成功",
		Text: fmt.Sprintf("已通过本地代理测试 %s（%s）。", binding, modelWire),
	}
}
