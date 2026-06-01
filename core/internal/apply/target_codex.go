package apply

import (
	"bytes"
	"os"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/pelletier/go-toml/v2"
)

// CodexProviderID is the Codex model_providers block id written by clovapi.
const CodexProviderID = "clovapi"

type codexTarget struct{}

func (codexTarget) Kind() agentkind.Kind { return agentkind.Codex }

func (codexTarget) SupportedStyles() []apistyle.Style {
	return []apistyle.Style{apistyle.OpenAIResponses}
}

func (codexTarget) Description() string {
	return "OpenAI-compatible Codex config.toml under CODEX_HOME (model_providers." + CodexProviderID + ")"
}

func (codexTarget) Installed() bool {
	return CodexInstalled()
}

func (codexTarget) Apply(p profile.Profile) error {
	if p.CLI != agentkind.Codex || p.APIStyle != apistyle.OpenAIResponses {
		return errWrongAdapter("codex", "openai-responses", p)
	}
	path, err := CodexConfigPath()
	if err != nil {
		return err
	}

	var root map[string]any
	if data, err := os.ReadFile(path); err == nil && len(bytes.TrimSpace(data)) > 0 {
		if err := toml.Unmarshal(data, &root); err != nil {
			return err
		}
	}
	if root == nil {
		root = map[string]any{}
	}

	root["model_provider"] = CodexProviderID

	mp, _ := root["model_providers"].(map[string]any)
	if mp == nil {
		mp = map[string]any{}
		root["model_providers"] = mp
	}
	mp[CodexProviderID] = map[string]any{
		"name":                      "clovapi",
		"base_url":                  ensureWireV1BaseURL(p.BaseURL),
		"wire_api":                  "responses",
		"experimental_bearer_token": p.APIKey,
	}
	if m := strings.TrimSpace(p.Model); m != "" {
		root["model"] = m
	}

	var buf bytes.Buffer
	if err := toml.NewEncoder(&buf).Encode(root); err != nil {
		return err
	}
	return writeFileAtomic(path, buf.Bytes(), 0o600)
}

func (codexTarget) ResetDefault() error {
	path, err := CodexConfigPath()
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
	var root map[string]any
	if err := toml.Unmarshal(data, &root); err != nil {
		return err
	}
	mp, _ := root["model_providers"].(map[string]any)
	if mp != nil {
		delete(mp, CodexProviderID)
		if len(mp) == 0 {
			delete(root, "model_providers")
		} else {
			root["model_providers"] = mp
		}
	}
	if v, ok := root["model_provider"].(string); ok && v == CodexProviderID {
		delete(root, "model_provider")
	}
	delete(root, "model")
	var buf bytes.Buffer
	if err := toml.NewEncoder(&buf).Encode(root); err != nil {
		return err
	}
	return writeFileAtomic(path, buf.Bytes(), 0o600)
}
