package apply

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
)

const openclawRelayID = "clovapi"

type openClawTarget struct{}

func (openClawTarget) Kind() clikind.Kind { return clikind.OpenClaw }

func (openClawTarget) SupportedStyles() []apistyle.Style {
	return []apistyle.Style{apistyle.Claude, apistyle.OpenAIChat, apistyle.OpenAIResponses, apistyle.Gemini}
}

func (openClawTarget) Description() string {
	return "OpenClaw ~/.openclaw/openclaw.json — models.providers + agents.defaults.model (JSON only for merge)"
}

func (openClawTarget) Installed() bool {
	return cliExecutableOnPATH("openclaw")
}

func (openClawTarget) Apply(p profile.Profile) error {
	if p.CLI != clikind.OpenClaw {
		return fmt.Errorf("wrong cli %q for openclaw target", p.CLI)
	}
	seg := profileModelSegment(p.Model)
	if seg == "" {
		return fmt.Errorf("profile model is required for openclaw apply")
	}
	path, err := OpenClawConfigPath()
	if err != nil {
		return err
	}

	root := map[string]any{}
	if data, err := os.ReadFile(path); err == nil && len(data) > 0 {
		if err := json.Unmarshal(data, &root); err != nil {
			return fmt.Errorf("parse openclaw.json: %w (merge requires strict JSON; run `openclaw config` or remove JSON5 comments from this file)", err)
		}
	}

	modelsRoot := ensureSubMap(root, "models")
	modelsRoot["mode"] = "merge"
	provs := ensureSubMap(modelsRoot, "providers")
	provs[openclawRelayID] = map[string]any{
		"baseUrl": strings.TrimRight(strings.TrimSpace(p.BaseURL), "/"),
		"apiKey":  p.APIKey,
		"api":     openclawAPIAdapter(p.APIStyle),
		"models": []any{
			map[string]any{"id": seg, "name": seg},
		},
	}

	agents := ensureSubMap(root, "agents")
	defs := ensureSubMap(agents, "defaults")
	defs["model"] = map[string]any{
		"primary": fmt.Sprintf("%s/%s", openclawRelayID, seg),
	}

	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(path, out, 0o600)
}

func (openClawTarget) ResetDefault() error {
	path, err := OpenClawConfigPath()
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
	if err := json.Unmarshal(data, &root); err != nil {
		return fmt.Errorf("parse openclaw.json: %w", err)
	}
	if modelsRoot, ok := root["models"].(map[string]any); ok && modelsRoot != nil {
		if provs, ok := modelsRoot["providers"].(map[string]any); ok && provs != nil {
			delete(provs, openclawRelayID)
			if len(provs) == 0 {
				delete(modelsRoot, "providers")
			} else {
				modelsRoot["providers"] = provs
			}
		}
		if len(modelsRoot) == 0 {
			delete(root, "models")
		} else {
			root["models"] = modelsRoot
		}
	}
	if agents, ok := root["agents"].(map[string]any); ok && agents != nil {
		if defs, ok := agents["defaults"].(map[string]any); ok && defs != nil {
			delete(defs, "model")
			if len(defs) == 0 {
				delete(agents, "defaults")
			} else {
				agents["defaults"] = defs
			}
		}
		if len(agents) == 0 {
			delete(root, "agents")
		} else {
			root["agents"] = agents
		}
	}
	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(path, out, 0o600)
}

func openclawAPIAdapter(st apistyle.Style) string {
	switch st {
	case apistyle.Claude:
		return "anthropic-messages"
	case apistyle.OpenAIChat:
		return "openai-completions"
	case apistyle.OpenAIResponses:
		return "openai-responses"
	case apistyle.Gemini:
		return "google-generative-ai"
	default:
		return "openai-completions"
	}
}
