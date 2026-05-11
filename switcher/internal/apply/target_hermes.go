package apply

import (
	"fmt"
	"os"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
	"gopkg.in/yaml.v3"
)

type hermesTarget struct{}

func (hermesTarget) Kind() clikind.Kind { return clikind.Hermes }

func (hermesTarget) SupportedStyles() []apistyle.Style {
	return []apistyle.Style{apistyle.Claude, apistyle.OpenAIChat, apistyle.OpenAIResponses, apistyle.Gemini}
}

func (hermesTarget) Description() string {
	return "Hermes ~/.hermes/config.yaml — model.provider + base_url + api_key"
}

func (hermesTarget) Installed() bool {
	return cliExecutableOnPATH("hermes")
}

func (hermesTarget) Apply(p profile.Profile) error {
	if p.CLI != clikind.Hermes {
		return fmt.Errorf("wrong cli %q for hermes target", p.CLI)
	}
	if strings.TrimSpace(p.Model) == "" {
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
	modelObj["default"] = hermesModelDefault(p)
	modelObj["provider"] = hermesInferenceProvider(p.APIStyle)
	modelObj["base_url"] = strings.TrimRight(strings.TrimSpace(p.BaseURL), "/")
	modelObj["api_key"] = p.APIKey

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
		for _, k := range []string{"default", "provider", "base_url", "api_key"} {
			delete(modelObj, k)
		}
		if len(modelObj) == 0 {
			delete(root, "model")
		} else {
			root["model"] = modelObj
		}
	}
	out, err := yaml.Marshal(root)
	if err != nil {
		return err
	}
	return writeFileAtomic(path, out, 0o600)
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

func hermesModelDefault(p profile.Profile) string {
	m := strings.TrimSpace(p.Model)
	if m == "" {
		return ""
	}
	if strings.Contains(m, "/") {
		return m
	}
	switch p.APIStyle {
	case apistyle.Claude:
		return "anthropic/" + m
	case apistyle.OpenAIChat, apistyle.OpenAIResponses:
		return "openai/" + m
	case apistyle.Gemini:
		return "google/" + m
	default:
		return m
	}
}
