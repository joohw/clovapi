package apply

import (
	"bytes"
	"fmt"
	"os"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/pelletier/go-toml/v2"
)

type kimiTarget struct{}

func (kimiTarget) Kind() clikind.Kind { return clikind.KimiCode }

func (kimiTarget) SupportedStyles() []apistyle.Style {
	return []apistyle.Style{apistyle.Claude, apistyle.OpenAIChat, apistyle.OpenAIResponses, apistyle.Gemini}
}

func (kimiTarget) Description() string {
	return "Kimi Code CLI ~/.kimi/config.toml — providers + models + default_model"
}

func (kimiTarget) Installed() bool {
	return cliExecutableOnPATH("kimi")
}

func (kimiTarget) Apply(p profile.Profile) error {
	if p.CLI != clikind.KimiCode {
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
	provs["clovapi"] = map[string]any{
		"type":     kimiProviderType(p.APIStyle),
		"base_url": strings.TrimRight(strings.TrimSpace(p.BaseURL), "/"),
		"api_key":  p.APIKey,
	}

	models := ensureSubMap(root, "models")
	models[key] = map[string]any{
		"provider": "clovapi",
		"model":    strings.TrimSpace(p.Model),
	}

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
		delete(provs, "clovapi")
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
			if pv, _ := ent["provider"].(string); pv == "clovapi" {
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
