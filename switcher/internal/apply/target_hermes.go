package apply

import (
	"fmt"
	"os"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
	"gopkg.in/yaml.v3"
)

const hermesRelayName = "clovapi"

type hermesTarget struct{}

func (hermesTarget) Kind() clikind.Kind { return clikind.Hermes }

func (hermesTarget) SupportedStyles() []apistyle.Style {
	return []apistyle.Style{apistyle.Claude, apistyle.OpenAIChat, apistyle.OpenAIResponses, apistyle.Gemini}
}

func (hermesTarget) Description() string {
	return "Hermes ~/.hermes/config.yaml — model + custom_providers (see hermes-agent model flow)"
}

func (hermesTarget) Installed() bool {
	return cliExecutableOnPATH("hermes")
}

func (hermesTarget) Apply(p profile.Profile) error {
	if p.CLI != clikind.Hermes {
		return fmt.Errorf("wrong cli %q for hermes target", p.CLI)
	}
	modelID := hermesWireModelID(p)
	if modelID == "" {
		return fmt.Errorf("profile model is required for hermes apply")
	}
	path, err := HermesConfigPath()
	if err != nil {
		return err
	}

	root := map[string]any{}
	if data, err := os.ReadFile(path); err == nil && len(data) > 0 {
		if err := yaml.Unmarshal(data, &root); err != nil {
			return fmt.Errorf("parse hermes config.yaml: %w", err)
		}
	}

	modelObj := ensureSubMap(root, "model")
	if subProvider := hermesSubscriptionProvider(p); subProvider != "" {
		// Hermes picks the first catalog model for a native provider; do not pin model.default here.
		delete(modelObj, "default")
		modelObj["provider"] = subProvider
		delete(modelObj, "base_url")
		delete(modelObj, "api_key")
		delete(modelObj, "api_mode")
	} else {
		prov := hermesInferenceProvider(p.APIStyle)
		if hermesUsesCustomProxyProvider(p) {
			// Hermes ignores model.api_key for built-in anthropic and uses OAuth tokens instead.
			// Route local clovapi proxy ingress through custom + api_mode so clovapi-local is honored.
			prov = "custom"
		}
		modelObj["default"] = modelID
		modelObj["provider"] = prov
		if prov == "custom" {
			apiMode := hermesAPIMode(p.APIStyle)
			baseURL := hermesWireBaseURL(p.BaseURL, apiMode)
			modelObj["base_url"] = baseURL
			modelObj["api_key"] = p.APIKey
			if apiMode != "" {
				modelObj["api_mode"] = apiMode
			} else {
				delete(modelObj, "api_mode")
			}
			upsertHermesCustomProvider(root, baseURL, p.APIKey, modelID, apiMode, p.Models)
		} else {
			modelObj["base_url"] = strings.TrimRight(strings.TrimSpace(p.BaseURL), "/")
			modelObj["api_key"] = p.APIKey
			delete(modelObj, "api_mode")
		}
	}

	out, err := yaml.Marshal(root)
	if err != nil {
		return err
	}
	return writeFileAtomic(path, out, 0o600)
}

func (hermesTarget) ResetDefault() error {
	path, err := HermesConfigPath()
	if err != nil {
		return err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if len(data) == 0 {
		return nil
	}
	root := map[string]any{}
	if err := yaml.Unmarshal(data, &root); err != nil {
		return fmt.Errorf("parse hermes config.yaml: %w", err)
	}
	modelObj, _ := root["model"].(map[string]any)
	if modelObj != nil {
		for _, k := range []string{"default", "provider", "base_url", "api_key", "api_mode"} {
			delete(modelObj, k)
		}
		if len(modelObj) == 0 {
			delete(root, "model")
		} else {
			root["model"] = modelObj
		}
	}
	removeHermesCustomProvider(root, hermesRelayName)
	out, err := yaml.Marshal(root)
	if err != nil {
		return err
	}
	return writeFileAtomic(path, out, 0o600)
}

// hermesSubscriptionProvider returns a native Hermes OAuth provider when clovapi
// would otherwise write subscription upstream URLs as provider=custom.
func hermesSubscriptionProvider(p profile.Profile) string {
	// Desktop ApplyBinding always targets the local proxy; clovapi holds subscription auth there.
	if hermesProxyBaseURL(p.BaseURL) {
		return ""
	}
	if strings.EqualFold(strings.TrimSpace(p.Kind), "subscription") {
		switch strings.TrimSpace(p.SubscriptionProviderID) {
		case provider.CodexProviderID:
			return "openai-codex"
		case provider.ClaudeCodeProviderID:
			return "anthropic"
		}
	}
	base := strings.ToLower(strings.TrimSpace(p.BaseURL))
	switch {
	case strings.Contains(base, "chatgpt.com/backend-api"):
		return "openai-codex"
	case base == "https://api.anthropic.com" || strings.HasPrefix(base, "https://api.anthropic.com/"):
		if strings.EqualFold(strings.TrimSpace(p.Kind), "subscription") ||
			strings.TrimSpace(p.SubscriptionProviderID) == provider.ClaudeCodeProviderID {
			return "anthropic"
		}
	}
	return ""
}

// hermesWireModelID returns the bound model id for Hermes defaults.
func hermesWireModelID(p profile.Profile) string {
	if id := profileModelSegment(strings.TrimSpace(p.Model)); id != "" {
		return id
	}
	if len(p.Models) > 0 {
		m := p.Models[0]
		if id := profileModelSegment(strings.TrimSpace(m.Model)); id != "" {
			return id
		}
		return profileModelSegment(m.ID)
	}
	return ""
}

func hermesProxyBaseURL(baseURL string) bool {
	base := strings.ToLower(strings.TrimSpace(baseURL))
	if base == "" {
		return false
	}
	return strings.Contains(base, "127.0.0.1") || strings.Contains(base, "localhost")
}

func hermesUsesCustomProxyProvider(p profile.Profile) bool {
	return hermesProxyBaseURL(p.BaseURL)
}

func hermesInferenceProvider(st apistyle.Style) string {
	switch st {
	case apistyle.Claude:
		return "anthropic"
	case apistyle.OpenAIChat, apistyle.OpenAIResponses:
		return "custom"
	case apistyle.Gemini:
		return "gemini"
	default:
		return "custom"
	}
}

// hermesAPIMode mirrors Hermes model.api_mode values (see hermes_cli/runtime_provider.py).
func hermesAPIMode(st apistyle.Style) string {
	switch st {
	case apistyle.Claude:
		return "anthropic_messages"
	case apistyle.OpenAIResponses:
		return "codex_responses"
	default:
		return "chat_completions"
	}
}

// hermesWireBaseURL shapes custom provider base_url the way Hermes SDKs append paths:
// anthropic_messages → Anthropic client adds /v1/messages (ingress …/claude/v1/messages);
// codex_responses / chat_completions → OpenAI client adds /responses or /chat/completions under …/v1.
func hermesWireBaseURL(baseURL, apiMode string) string {
	b := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if b == "" {
		return b
	}
	if strings.EqualFold(strings.TrimSpace(apiMode), "anthropic_messages") {
		return ensureAnthropicWireBaseURL(b)
	}
	return ensureWireV1BaseURL(b)
}

func upsertHermesCustomProvider(root map[string]any, baseURL, apiKey, modelID, apiMode string, catalog []profile.Model) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return
	}
	list, _ := root["custom_providers"].([]any)
	out := make([]any, 0, len(list)+1)
	replaced := false
	for _, item := range list {
		ent, _ := item.(map[string]any)
		if ent == nil {
			out = append(out, item)
			continue
		}
		if strings.EqualFold(strings.TrimSpace(fmt.Sprint(ent["name"])), hermesRelayName) ||
			strings.TrimRight(strings.TrimSpace(fmt.Sprint(ent["base_url"])), "/") == baseURL {
			out = append(out, hermesCustomProviderEntry(baseURL, apiKey, modelID, apiMode, catalog))
			replaced = true
			continue
		}
		out = append(out, ent)
	}
	if !replaced {
		out = append(out, hermesCustomProviderEntry(baseURL, apiKey, modelID, apiMode, catalog))
	}
	root["custom_providers"] = out
}

func hermesCustomProviderModels(catalog []profile.Model, defaultModelID string) map[string]any {
	out := map[string]any{}
	if len(catalog) > 0 {
		for _, m := range catalog {
			id := profileModelSegment(strings.TrimSpace(m.Model))
			if id == "" {
				id = profileModelSegment(m.ID)
			}
			if id != "" {
				out[id] = map[string]any{}
			}
		}
	}
	if len(out) == 0 && strings.TrimSpace(defaultModelID) != "" {
		out[defaultModelID] = map[string]any{}
	}
	return out
}

func hermesCustomProviderEntry(baseURL, apiKey, modelID, apiMode string, catalog []profile.Model) map[string]any {
	ent := map[string]any{
		"name":     hermesRelayName,
		"base_url": baseURL,
		"model":    modelID,
		"models":   hermesCustomProviderModels(catalog, modelID),
	}
	if strings.TrimSpace(apiKey) != "" {
		ent["api_key"] = apiKey
	}
	if strings.TrimSpace(apiMode) != "" {
		ent["api_mode"] = apiMode
	}
	return ent
}

func removeHermesCustomProvider(root map[string]any, name string) {
	list, _ := root["custom_providers"].([]any)
	if len(list) == 0 {
		return
	}
	want := strings.ToLower(strings.TrimSpace(name))
	out := make([]any, 0, len(list))
	for _, item := range list {
		ent, _ := item.(map[string]any)
		if ent == nil {
			out = append(out, item)
			continue
		}
		if strings.ToLower(strings.TrimSpace(fmt.Sprint(ent["name"]))) == want {
			continue
		}
		out = append(out, ent)
	}
	if len(out) == 0 {
		delete(root, "custom_providers")
		return
	}
	root["custom_providers"] = out
}
