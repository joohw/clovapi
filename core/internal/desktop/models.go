package desktop

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

type AuthStatusItem struct {
	OK          bool   `json:"ok"`
	ID          string `json:"id"`
	Label       string `json:"label"`
	Command     string `json:"command"`
	Installed   bool   `json:"installed"`
	CommandPath string `json:"commandPath,omitempty"`
	LoggedIn    bool   `json:"loggedIn"`
	Active      bool   `json:"active"`
	Summary     string `json:"summary"`
	Error       string `json:"error,omitempty"`
}

type AuthStatusResult struct {
	OK    bool             `json:"ok"`
	Items []AuthStatusItem `json:"items,omitempty"`
	Error string           `json:"error,omitempty"`
}

type AuthLogoutResult struct {
	OK       bool                               `json:"ok"`
	Path     string                             `json:"path,omitempty"`
	Version  int                                `json:"version,omitempty"`
	Active   map[string]profile.ActiveSelection `json:"active,omitempty"`
	Proxy    UIProxyConfig                      `json:"proxy,omitempty"`
	Profiles []UIVendor                         `json:"profiles,omitempty"`
	Error    string                             `json:"error,omitempty"`
}

var authProviders = []struct {
	ID      string
	Label   string
	Command string
}{
	{ID: provider.ClaudeCodeProviderID, Label: provider.ClaudeCodeVendorName, Command: "claude"},
	{ID: provider.CodexProviderID, Label: provider.CodexVendorName, Command: "codex"},
}

func claudeAuthPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".claude", ".credentials.json"), nil
}

func codexAuthPath() (string, error) {
	codexHome := strings.TrimSpace(os.Getenv("CODEX_HOME"))
	if codexHome == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		codexHome = filepath.Join(home, ".codex")
	}
	return filepath.Join(codexHome, "auth.json"), nil
}

func authPathForProvider(providerID string) (string, error) {
	switch strings.TrimSpace(providerID) {
	case provider.ClaudeCodeProviderID:
		return claudeAuthPath()
	case provider.CodexProviderID:
		return codexAuthPath()
	default:
		return "", fmt.Errorf("unknown provider: %s", providerID)
	}
}

func isCodexSubscriptionAuthValid(data map[string]any) bool {
	tokens, _ := data["tokens"].(map[string]any)
	if tokens == nil {
		return false
	}
	access, _ := tokens["access_token"].(string)
	if strings.TrimSpace(access) == "" {
		access, _ = tokens["accessToken"].(string)
	}
	return strings.TrimSpace(access) != ""
}

func claudeSubscriptionDetail(data map[string]any) string {
	oauth, _ := data["claudeAiOauth"].(map[string]any)
	if oauth == nil {
		return ""
	}
	if sub, _ := oauth["subscriptionType"].(string); strings.TrimSpace(sub) != "" {
		return strings.TrimSpace(sub)
	}
	if org, _ := oauth["organizationType"].(string); strings.TrimSpace(org) != "" {
		return strings.TrimSpace(org)
	}
	return ""
}

func isActiveClaudeSubscriptionDetail(detail string) bool {
	raw := strings.ToLower(strings.TrimSpace(detail))
	if raw == "" || strings.Contains(raw, "free") || raw == "claude_ai" {
		return false
	}
	switch {
	case strings.Contains(raw, "max"),
		strings.Contains(raw, "pro"),
		strings.Contains(raw, "team"),
		strings.Contains(raw, "enterprise"):
		return true
	default:
		return false
	}
}

func providerSubscriptionActive(providerID string, loggedIn bool, data map[string]any) bool {
	if !loggedIn {
		return false
	}
	switch providerID {
	case provider.ClaudeCodeProviderID:
		return isActiveClaudeSubscriptionDetail(claudeSubscriptionDetail(data))
	case provider.CodexProviderID:
		return true
	default:
		return false
	}
}

func summarizeAuthStatus(providerID string, loggedIn bool, data map[string]any) string {
	if !loggedIn {
		return "Not logged in"
	}
	if providerID == provider.ClaudeCodeProviderID {
		if detail := claudeSubscriptionDetail(data); detail != "" {
			if !isActiveClaudeSubscriptionDetail(detail) {
				return "Logged in · inactive subscription"
			}
			return "Logged in · " + detail
		}
		return "Logged in · inactive subscription"
	}
	if providerID == provider.CodexProviderID {
		if mode, _ := data["auth_mode"].(string); strings.TrimSpace(mode) != "" {
			return "Logged in · " + mode
		}
	}
	return "Logged in"
}

func readAuthJSON(path string) (map[string]any, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}
	var out map[string]any
	if json.Unmarshal(data, &out) != nil {
		return nil, false
	}
	return out, true
}

func providerLoggedIn(providerID string, data map[string]any) bool {
	switch providerID {
	case provider.ClaudeCodeProviderID:
		oauth, _ := data["claudeAiOauth"].(map[string]any)
		if oauth == nil {
			return false
		}
		token, _ := oauth["accessToken"].(string)
		if strings.TrimSpace(token) == "" {
			return false
		}
		expiresAt, _ := oauth["expiresAt"].(float64)
		if expiresAt > 0 && float64(time.Now().UnixMilli()) > expiresAt {
			return false
		}
		return true
	case provider.CodexProviderID:
		return isCodexSubscriptionAuthValid(data)
	default:
		return false
	}
}

// AuthStatus reports subscription OAuth status for built-in providers.
func AuthStatus() AuthStatusResult {
	items := make([]AuthStatusItem, 0, len(authProviders))
	for _, cfg := range authProviders {
		cmdPath, installed := ResolveCommandPath(cfg.Command)
		item := AuthStatusItem{
			OK:        true,
			ID:        cfg.ID,
			Label:     cfg.Label,
			Command:   cfg.Command,
			Installed: installed,
			Summary:   "Not logged in",
		}
		if cmdPath != "" {
			item.CommandPath = cmdPath
		}
		if !installed {
			item.Summary = "CLI not installed"
			items = append(items, item)
			continue
		}
		authPath, err := authPathForProvider(cfg.ID)
		if err != nil {
			items = append(items, item)
			continue
		}
		if data, ok := readAuthJSON(authPath); ok {
			item.LoggedIn = providerLoggedIn(cfg.ID, data)
			item.Active = providerSubscriptionActive(cfg.ID, item.LoggedIn, data)
			item.Summary = summarizeAuthStatus(cfg.ID, item.LoggedIn, data)
		} else if cfg.ID == provider.ClaudeCodeProviderID {
			if data, ok := profile.ClaudeAuthRoot(); ok {
				item.LoggedIn = providerLoggedIn(cfg.ID, data)
				item.Active = providerSubscriptionActive(cfg.ID, item.LoggedIn, data)
				item.Summary = summarizeAuthStatus(cfg.ID, item.LoggedIn, data)
			}
		}
		items = append(items, item)
	}
	return AuthStatusResult{OK: true, Items: items}
}

func clearSubscriptionProviderState(s *profile.Store, providerID string) bool {
	if s == nil {
		return false
	}
	id := strings.TrimSpace(providerID)
	changed := false
	for i := range s.List {
		p := &s.List[i]
		if strings.EqualFold(strings.TrimSpace(p.Kind), "subscription") &&
			strings.TrimSpace(p.SubscriptionProviderID) == id {
			if len(p.Models) > 0 {
				p.Models = nil
				changed = true
			}
		}
	}
	for cli, active := range s.Active {
		if strings.TrimSpace(active.ProviderID) == id {
			delete(s.Active, cli)
			changed = true
		}
	}
	return changed
}

// AuthLogout removes OAuth credentials and clears subscription models in profiles.json.
func AuthLogout(providerID string) AuthLogoutResult {
	path, err := authPathForProvider(providerID)
	if err != nil {
		return AuthLogoutResult{OK: false, Error: err.Error()}
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return AuthLogoutResult{OK: false, Error: err.Error()}
	}

	s, err := profile.WithLockedDesktopStore(func(s *profile.Store) (bool, error) {
		profile.EnsureDefaultOllamaProfile(s)
		return clearSubscriptionProviderState(s, providerID), nil
	})
	if err != nil {
		return AuthLogoutResult{OK: false, Error: err.Error()}
	}
	out := storeToUI(s)
	return AuthLogoutResult{
		OK:       true,
		Path:     out.Path,
		Version:  out.Version,
		Active:   out.Active,
		Proxy:    out.Proxy,
		Profiles: out.Profiles,
	}
}

type ListModelsResult struct {
	OK        bool       `json:"ok"`
	AdapterID string     `json:"adapterId,omitempty"`
	Models    []UIModel  `json:"models,omitempty"`
	Source    string     `json:"source,omitempty"`
	Message   string     `json:"message,omitempty"`
	Profiles  []UIVendor `json:"profiles,omitempty"`
	Error     string     `json:"error,omitempty"`
}

const fetchTimeout = 20 * time.Second

func httpGetJSON(url string, headers map[string]string) ([]byte, error) {
	client := &http.Client{Timeout: fetchTimeout}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		text := string(body)
		if len(text) > 400 {
			text = text[:400]
		}
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, text)
	}
	return body, nil
}

func authHeaders(apiKey string) map[string]string {
	key := strings.TrimSpace(apiKey)
	if key == "" {
		return nil
	}
	return map[string]string{"Authorization": "Bearer " + key}
}

func modelsURLCandidates(baseURL string) []string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		return nil
	}
	if strings.HasSuffix(strings.ToLower(base), "/v1") {
		return []string{base + "/models"}
	}
	return []string{base + "/v1/models", base + "/models"}
}

func parseOpenAIModels(body []byte, defaultStyle string) ([]profile.Model, error) {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("响应不是 JSON")
	}
	var list []any
	switch {
	case payload["data"] != nil:
		list, _ = payload["data"].([]any)
	case payload["models"] != nil:
		list, _ = payload["models"].([]any)
	default:
		return nil, fmt.Errorf("无法解析模型列表（期望 data[] 或 models[]）")
	}
	out := make([]profile.Model, 0, len(list))
	seen := map[string]struct{}{}
	for _, item := range list {
		row, _ := item.(map[string]any)
		if row == nil {
			continue
		}
		modelID, _ := row["id"].(string)
		if modelID == "" {
			modelID, _ = row["name"].(string)
		}
		modelID = strings.TrimSpace(modelID)
		if modelID == "" {
			continue
		}
		key := strings.ToLower(modelID)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, profile.NormalizeModelEntry(profile.Model{
			ID:       modelID,
			Label:    modelID,
			Model:    modelID,
			APIStyle: profile.NormalizeAPIStyle(defaultStyle),
		}, len(out)))
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("上游返回空模型列表")
	}
	return out, nil
}

func fetchOpenAICompatibleModels(vendor profile.Profile, defaultStyle string) ([]profile.Model, string, error) {
	headers := authHeaders(vendor.APIKey)
	var lastErr error
	for _, url := range modelsURLCandidates(vendor.BaseURL) {
		body, err := httpGetJSON(url, headers)
		if err != nil {
			lastErr = err
			continue
		}
		models, err := parseOpenAIModels(body, defaultStyle)
		if err != nil {
			lastErr = err
			continue
		}
		return models, url, nil
	}
	if lastErr != nil {
		return nil, "", lastErr
	}
	return nil, "", fmt.Errorf("无法拉取模型列表")
}

func fetchOllamaModels(vendor profile.Profile, defaultStyle string) ([]profile.Model, string, error) {
	base := strings.TrimRight(strings.TrimSpace(vendor.BaseURL), "/")
	nativeBase := strings.TrimSuffix(strings.TrimSuffix(base, "/v1"), "/V1")
	if body, err := httpGetJSON(nativeBase+"/api/tags", authHeaders(vendor.APIKey)); err == nil {
		var payload map[string]any
		if json.Unmarshal(body, &payload) == nil {
			tags, _ := payload["models"].([]any)
			out := make([]profile.Model, 0, len(tags))
			seen := map[string]struct{}{}
			for _, item := range tags {
				row, _ := item.(map[string]any)
				if row == nil {
					continue
				}
				modelID, _ := row["name"].(string)
				if modelID == "" {
					modelID, _ = row["model"].(string)
				}
				modelID = strings.TrimSpace(modelID)
				if modelID == "" {
					continue
				}
				key := strings.ToLower(modelID)
				if _, ok := seen[key]; ok {
					continue
				}
				seen[key] = struct{}{}
				out = append(out, profile.NormalizeModelEntry(profile.Model{
					ID: modelID, Label: modelID, Model: modelID,
					APIStyle: profile.NormalizeAPIStyle(defaultStyle),
				}, len(out)))
			}
			if len(out) > 0 {
				return out, nativeBase + "/api/tags", nil
			}
		}
	}
	return fetchOpenAICompatibleModels(vendor, defaultStyle)
}

func fetchClaudeSubscriptionModels(vendor profile.Profile, defaultStyle string) ([]profile.Model, string, error) {
	authData, ok := readAuthJSONOrClaudeFallback()
	if !ok || !providerLoggedIn(provider.ClaudeCodeProviderID, authData) {
		return nil, "", fmt.Errorf("Claude 订阅未登录或凭据已过期")
	}
	if !providerSubscriptionActive(provider.ClaudeCodeProviderID, true, authData) {
		return nil, "", fmt.Errorf("Claude 订阅未激活，请确认账号包含 Pro/Max/Team/Enterprise 订阅")
	}
	flat := vendor
	profile.HydrateSubscriptionCredentials(&flat)
	if strings.TrimSpace(flat.APIKey) == "" {
		return nil, "", fmt.Errorf("Claude 订阅未登录或凭据已过期")
	}
	body, err := httpGetJSON("https://api.anthropic.com/v1/models", map[string]string{
		"Authorization":     "Bearer " + flat.APIKey,
		"anthropic-version": "2023-06-01",
		"anthropic-beta":    "oauth-2025-04-20",
		"x-app":             "claude-code",
	})
	if err != nil {
		return nil, "", err
	}
	models, err := parseOpenAIModels(body, defaultStyle)
	if err != nil {
		return nil, "", err
	}
	return models, "", nil
}

func readAuthJSONOrClaudeFallback() (map[string]any, bool) {
	authPath, err := authPathForProvider(provider.ClaudeCodeProviderID)
	if err == nil {
		if data, ok := readAuthJSON(authPath); ok {
			return data, true
		}
	}
	return profile.ClaudeAuthRoot()
}

func fetchCodexSubscriptionModels(vendor profile.Profile, defaultStyle string) ([]profile.Model, string, error) {
	flat := vendor
	profile.HydrateSubscriptionCredentials(&flat)
	if strings.TrimSpace(flat.APIKey) == "" || strings.TrimSpace(flat.AccountID) == "" {
		return nil, "", fmt.Errorf("Codex 订阅未登录或凭据不完整")
	}
	url := "https://chatgpt.com/backend-api/codex/models?client_version=0.105.0"
	body, err := httpGetJSON(url, map[string]string{
		"Authorization":      "Bearer " + flat.APIKey,
		"Chatgpt-Account-Id": flat.AccountID,
	})
	if err != nil {
		return nil, "", err
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, "", fmt.Errorf("响应不是 JSON")
	}
	list, _ := payload["models"].([]any)
	out := make([]profile.Model, 0, len(list))
	seen := map[string]struct{}{}
	for _, item := range list {
		row, _ := item.(map[string]any)
		if row == nil {
			continue
		}
		modelID, _ := row["slug"].(string)
		if modelID == "" {
			modelID, _ = row["id"].(string)
		}
		modelID = strings.TrimSpace(modelID)
		if modelID == "" {
			continue
		}
		key := strings.ToLower(modelID)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		label, _ := row["display_name"].(string)
		if strings.TrimSpace(label) == "" {
			label = modelID
		}
		out = append(out, profile.NormalizeModelEntry(profile.Model{
			ID: modelID, Label: label, Model: modelID,
			APIStyle: profile.NormalizeAPIStyle(defaultStyle),
		}, len(out)))
	}
	if len(out) == 0 {
		return nil, "", fmt.Errorf("上游返回空模型列表")
	}
	return out, url, nil
}

// ListVendorModels fetches models for one vendor and persists merged results.
func ListVendorModels(vendorName string) ListModelsResult {
	name := strings.TrimSpace(vendorName)
	if name == "" {
		return ListModelsResult{OK: false, Error: "vendorName is required"}
	}
	s, err := profile.LoadDesktop()
	if err != nil {
		return ListModelsResult{OK: false, Error: err.Error()}
	}
	vendor, ok := profile.FindStoreVendorProfile(s, name)
	if !ok {
		return ListModelsResult{OK: false, Error: fmt.Sprintf("未找到供应商: %s", name)}
	}

	adapterID := strings.TrimSpace(vendor.ModelAdapter)
	if adapterID == "" {
		adapterID = "openai-compatible"
	}
	defaultStyle := "openai-chat"
	switch adapterID {
	case "manual":
		return ListModelsResult{OK: false, Error: "手动维护供应商不支持自动拉取模型"}
	case "openai-compatible":
		defaultStyle = "openai-chat"
	case "ollama":
		defaultStyle = "openai-chat"
	case "subscription":
		if strings.TrimSpace(vendor.SubscriptionProviderID) == provider.CodexProviderID {
			defaultStyle = "openai-responses"
		} else {
			defaultStyle = "claude"
		}
	}

	var fetched []profile.Model
	var source string
	var fetchErr error
	switch adapterID {
	case "openai-compatible":
		fetched, source, fetchErr = fetchOpenAICompatibleModels(vendor, defaultStyle)
	case "ollama":
		fetched, source, fetchErr = fetchOllamaModels(vendor, defaultStyle)
	case "subscription":
		switch strings.TrimSpace(vendor.SubscriptionProviderID) {
		case provider.ClaudeCodeProviderID:
			fetched, source, fetchErr = fetchClaudeSubscriptionModels(vendor, defaultStyle)
		case provider.CodexProviderID:
			fetched, source, fetchErr = fetchCodexSubscriptionModels(vendor, defaultStyle)
		default:
			fetchErr = fmt.Errorf("未知订阅类型")
		}
	default:
		fetchErr = fmt.Errorf("未知适配器: %s", adapterID)
	}
	if fetchErr != nil {
		return ListModelsResult{OK: false, Error: fetchErr.Error()}
	}
	if len(fetched) == 0 {
		return ListModelsResult{OK: false, Error: "未拉取到任何模型"}
	}

	s, err = profile.WithLockedDesktopStore(func(latest *profile.Store) (bool, error) {
		latestVendor, ok := profile.FindStoreVendorProfile(latest, name)
		if !ok {
			return false, fmt.Errorf("未找到供应商: %s", name)
		}
		merged := profile.MergeVendorModels(latestVendor.Models, fetched)
		idx := latest.Index(latestVendor.Name)
		if idx >= 0 {
			latest.List[idx].Models = merged
		} else {
			latestVendor.Models = merged
			latest.Upsert(latestVendor)
		}
		return true, nil
	})
	if err != nil {
		return ListModelsResult{OK: false, Error: err.Error()}
	}

	saved, _ := profile.FindStoreVendorProfile(s, name)
	models := make([]UIModel, 0, len(saved.Models))
	for _, m := range saved.Models {
		models = append(models, UIModel{
			ID: m.ID, Label: m.Label, Model: m.Model, APIStyle: string(m.APIStyle),
			BaseURL: m.BaseURL, APIKey: m.APIKey,
		})
	}
	ui := storeToUI(s)
	return ListModelsResult{
		OK: true, AdapterID: adapterID, Models: models, Source: source, Profiles: ui.Profiles,
	}
}

var AdapterCatalog = []map[string]string{
	{"id": "manual", "label": "手动维护", "description": "不自动拉取；测试走原生 HTTP（chat / responses / claude 等）"},
	{"id": "openai-compatible", "label": "OpenAI 兼容", "description": "拉取 GET /v1/models；测试走原生 HTTP 按 api_style 分流"},
	{"id": "ollama", "label": "Ollama", "description": "拉取 GET /api/tags；测试走 OpenAI Chat HTTP 路径"},
	{"id": "subscription", "label": "官方订阅", "description": "拉取官方 OAuth 模型表（Codex backend-api / Claude /v1/models）"},
}

type UIProviderDef struct {
	ID                     string `json:"id"`
	VendorName             string `json:"vendorName"`
	Kind                   string `json:"kind"`
	SubscriptionProviderID string `json:"subscriptionProviderId,omitempty"`
	LocalProvider          string `json:"localProvider,omitempty"`
}

type VendorCatalogResult struct {
	OK               bool                `json:"ok"`
	FixedProviderIDs []string            `json:"fixedProviderIds,omitempty"`
	Providers        []UIProviderDef     `json:"providers,omitempty"`
	Adapters         []map[string]string `json:"adapters,omitempty"`
	Error            string              `json:"error,omitempty"`
}

// VendorCatalog returns the fixed provider registry and model adapter catalog for the desktop UI.
func VendorCatalog() VendorCatalogResult {
	defs := provider.Registry()
	providers := make([]UIProviderDef, 0, len(defs))
	for _, d := range defs {
		providers = append(providers, UIProviderDef{
			ID:                     d.ID,
			VendorName:             d.VendorName,
			Kind:                   d.Kind,
			SubscriptionProviderID: d.SubscriptionProviderID,
			LocalProvider:          d.LocalProvider,
		})
	}
	return VendorCatalogResult{
		OK:               true,
		FixedProviderIDs: provider.FixedProviderIDs(),
		Providers:        providers,
		Adapters:         AdapterCatalog,
	}
}
