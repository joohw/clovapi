package apply

import (
	"fmt"
	"net/url"
	"os"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
	"gopkg.in/yaml.v3"
)

const hermesRelayName = "clovapi"

type hermesTarget struct{}

func (hermesTarget) Kind() agentkind.Kind { return agentkind.Hermes }

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
	if p.CLI != agentkind.Hermes {
		return fmt.Errorf("wrong cli %q for hermes target", p.CLI)
	}
	modelID := hermesWireModelID(p)
	if pathID := hermesPathModelID(p.BaseURL); pathID != "" {
		modelID = pathID
	}
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
	prov := hermesInferenceProvider(p.APIStyle)
	useCustomRelay := hermesUsesCustomProxyProvider(p) || prov == "custom"
	if useCustomRelay {
		// Hermes ignores model.api_key for built-in anthropic and uses OAuth tokens instead.
		// Route local clovapi proxy ingress through the named custom provider so clovapi-local is honored.
		prov = hermesRelayName
	}
	modelObj["default"] = modelID
	modelObj["provider"] = prov
	if useCustomRelay {
		apiMode := hermesAPIMode(p.APIStyle)
		baseURL := hermesWireBaseURL(p.BaseURL, apiMode)
		modelObj["base_url"] = baseURL
		modelObj["api_key"] = p.APIKey
		if apiMode != "" {
			modelObj["api_mode"] = apiMode
		} else {
			delete(modelObj, "api_mode")
		}
		upsertHermesCustomProvider(root, baseURL, p.APIKey, modelID, apiMode)
	} else {
		modelObj["base_url"] = strings.TrimRight(strings.TrimSpace(p.BaseURL), "/")
		modelObj["api_key"] = p.APIKey
		delete(modelObj, "api_mode")
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

// hermesPathModelID reads the bound model id from legacy clovapi proxy ingress base URLs.
func hermesPathModelID(baseURL string) string {
	raw := strings.TrimSpace(baseURL)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	ingress, ok := provider.ParseProxyIngressPath(u.Path)
	if !ok {
		return ""
	}
	return strings.TrimSpace(ingress.ModelID)
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
// anthropic_messages → Anthropic client adds /v1/messages (ingress …/{provider}/v1/messages);
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

func upsertHermesCustomProvider(root map[string]any, baseURL, apiKey, modelID, apiMode string) {
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
			out = append(out, hermesCustomProviderEntry(baseURL, apiKey, modelID, apiMode))
			replaced = true
			continue
		}
		out = append(out, ent)
	}
	if !replaced {
		out = append(out, hermesCustomProviderEntry(baseURL, apiKey, modelID, apiMode))
	}
	root["custom_providers"] = out
}

func hermesCustomProviderModels(defaultModelID string) map[string]any {
	out := map[string]any{}
	if id := strings.TrimSpace(defaultModelID); id != "" {
		out[id] = map[string]any{}
	}
	return out
}

func hermesCustomProviderEntry(baseURL, apiKey, modelID, apiMode string) map[string]any {
	ent := map[string]any{
		"name":     hermesRelayName,
		"base_url": baseURL,
		"model":    modelID,
		"models":   hermesCustomProviderModels(modelID),
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
