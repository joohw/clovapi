package apply

import (
	"bytes"
	"fmt"
	"os"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/pelletier/go-toml/v2"
)

// defaultKimiMaxContextSize satisfies Kimi Code CLI config validation (models.*.max_context_size).
const defaultKimiMaxContextSize = 200000

const kimiRelayProviderID = "clovapi"

type kimiTarget struct{}

func (kimiTarget) Kind() agentkind.Kind { return agentkind.KimiCode }

func (kimiTarget) SupportedStyles() []apistyle.Style {
	return []apistyle.Style{apistyle.Claude, apistyle.OpenAIChat, apistyle.OpenAIResponses, apistyle.Gemini}
}

func (kimiTarget) Description() string {
	return "Kimi Code CLI ~/.kimi/config.toml — providers + models + default_model"
}

func (kimiTarget) Installed() bool {
	return cliExecutableOnPATH("kimi")
}

func (kimiTarget) InstallPlan() string {
	return "将通过 npm 安装 Kimi Code CLI（kimi-code）。如果未检测到 npm，会先尝试自动安装 Node.js LTS/npm。"
}
func (kimiTarget) Install() error {
	return npmGlobalInstall("kimi-code")
}

func (kimiTarget) Stop() error {
	return stopAgentProcesses([]string{"kimi"}, nil)
}

func (kimiTarget) Uninstall() error {
	return uninstallFromCandidates(
		npmGlobalUninstall("kimi-code"),
		brewUninstall("kimi-code"),
		standaloneUninstall("kimi-npm-shim", npmGlobalShimFiles("kimi")...),
		standaloneUninstall("kimi", homeLocalBinFiles("kimi")...),
	)
}

func (kimiTarget) Apply(p profile.Profile) error {
	if p.CLI != agentkind.KimiCode {
		return fmt.Errorf("wrong cli %q for kimi-code target", p.CLI)
	}
	key := profileModelSegment(p.Model)
	if key == "" {
		return fmt.Errorf("profile model is required for kimi-code apply")
	}
	path, err := KimiConfigPath()
	if err != nil {
		return err
	}

	root := map[string]any{}
	if data, err := os.ReadFile(path); err == nil && len(bytes.TrimSpace(data)) > 0 {
		if err := toml.Unmarshal(data, &root); err != nil {
			return fmt.Errorf("parse kimi config.toml: %w", err)
		}
	}

	root["default_model"] = key

	provs := ensureSubMap(root, "providers")
	provs[kimiRelayProviderID] = map[string]any{
		"type":     kimiProviderType(p.APIStyle),
		"base_url": kimiWireBaseURL(p.BaseURL, p.APIStyle),
		"api_key":  p.APIKey,
	}

	models := ensureSubMap(root, "models")
	var prev map[string]any
	if old, ok := models[key].(map[string]any); ok {
		prev = old
	}
	models[key] = kimiModelEntry(strings.TrimSpace(p.Model), prev)

	var buf bytes.Buffer
	if err := toml.NewEncoder(&buf).Encode(root); err != nil {
		return err
	}
	return writeFileAtomic(path, buf.Bytes(), 0o600)
}

func (kimiTarget) ResetDefault() error {
	path, err := KimiConfigPath()
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
	if len(bytes.TrimSpace(data)) == 0 {
		return nil
	}
	root := map[string]any{}
	if err := toml.Unmarshal(data, &root); err != nil {
		return fmt.Errorf("parse kimi config.toml: %w", err)
	}
	if provs, _ := root["providers"].(map[string]any); provs != nil {
		delete(provs, kimiRelayProviderID)
		if len(provs) == 0 {
			delete(root, "providers")
		} else {
			root["providers"] = provs
		}
	}
	var removedKeys []string
	if models, _ := root["models"].(map[string]any); models != nil {
		for mk, v := range models {
			ent, _ := v.(map[string]any)
			if ent == nil {
				continue
			}
			if pv, _ := ent["provider"].(string); pv == kimiRelayProviderID {
				delete(models, mk)
				removedKeys = append(removedKeys, mk)
			}
		}
		if len(models) == 0 {
			delete(root, "models")
		} else {
			root["models"] = models
		}
	}
	if dm, ok := root["default_model"].(string); ok {
		for _, rk := range removedKeys {
			if dm == rk {
				delete(root, "default_model")
				break
			}
		}
	}
	var buf bytes.Buffer
	if err := toml.NewEncoder(&buf).Encode(root); err != nil {
		return err
	}
	return writeFileAtomic(path, buf.Bytes(), 0o600)
}

func kimiModelEntry(modelID string, existing map[string]any) map[string]any {
	ent := map[string]any{
		"provider":         kimiRelayProviderID,
		"model":            modelID,
		"max_context_size": defaultKimiMaxContextSize,
	}
	if existing == nil {
		return ent
	}
	if v, ok := existing["max_context_size"]; ok {
		ent["max_context_size"] = v
	}
	if caps, ok := existing["capabilities"]; ok {
		ent["capabilities"] = caps
	}
	if dn, ok := existing["display_name"]; ok {
		ent["display_name"] = dn
	}
	return ent
}

func kimiProviderType(st apistyle.Style) string {
	switch st {
	case apistyle.Claude:
		return "anthropic"
	case apistyle.OpenAIChat:
		return "openai_legacy"
	case apistyle.OpenAIResponses:
		return "openai_responses"
	case apistyle.Gemini:
		return "gemini"
	default:
		return "openai_legacy"
	}
}
