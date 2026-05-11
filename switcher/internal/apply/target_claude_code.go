package apply

import (
	"encoding/json"
	"os"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/clikind"
	"github.com/clovapi/switcher/internal/profile"
)

type claudeCodeTarget struct{}

func (claudeCodeTarget) Kind() clikind.Kind { return clikind.ClaudeCode }

func (claudeCodeTarget) SupportedStyles() []apistyle.Style {
	return []apistyle.Style{apistyle.Claude}
}

func (claudeCodeTarget) Description() string {
	return "Anthropic env in ~/.claude/settings.json (ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL)"
}

func (claudeCodeTarget) Installed() bool {
	return cliExecutableOnPATH("claude")
}

func (claudeCodeTarget) Apply(p profile.Profile) error {
	if p.CLI != clikind.ClaudeCode || p.APIStyle != apistyle.Claude {
		return errWrongAdapter("claude-code", "claude", p)
	}
	path, err := ClaudeSettingsPath()
	if err != nil {
		return err
	}

	root := map[string]any{}
	if data, err := os.ReadFile(path); err == nil && len(data) > 0 {
		_ = json.Unmarshal(data, &root)
	}
	env, _ := root["env"].(map[string]any)
	if env == nil {
		env = map[string]any{}
	}
	delete(env, "ANTHROPIC_API_KEY")
	env["ANTHROPIC_AUTH_TOKEN"] = p.APIKey
	env["ANTHROPIC_BASE_URL"] = p.BaseURL
	if m := strings.TrimSpace(p.Model); m != "" {
		root["model"] = m
		env["ANTHROPIC_MODEL"] = m
		env["ANTHROPIC_DEFAULT_OPUS_MODEL"] = m
		env["ANTHROPIC_DEFAULT_SONNET_MODEL"] = m
		env["ANTHROPIC_DEFAULT_HAIKU_MODEL"] = m
		env["ANTHROPIC_SMALL_FAST_MODEL"] = m
	}
	root["env"] = env

	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(path, out, 0o600)
}

func (claudeCodeTarget) ResetDefault() error {
	path, err := ClaudeSettingsPath()
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
		return err
	}
	env, _ := root["env"].(map[string]any)
	if env != nil {
		for _, k := range []string{
			"ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL",
			"ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
			"ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_SMALL_FAST_MODEL",
		} {
			delete(env, k)
		}
		if len(env) == 0 {
			delete(root, "env")
		} else {
			root["env"] = env
		}
	}
	delete(root, "model")
	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(path, out, 0o600)
}
