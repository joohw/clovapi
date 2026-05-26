package apply

import (
	"encoding/json"
	"fmt"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
)

// opencodeRelayID is a dedicated provider block for gateway relays (never overwrite stock openai/anthropic definitions wholesale).
const opencodeRelayID = "clovapi"

type openCodeTarget struct{}

func (openCodeTarget) Kind() agentkind.Kind { return agentkind.OpenCode }

func (openCodeTarget) SupportedStyles() []apistyle.Style {
	return []apistyle.Style{apistyle.Claude, apistyle.OpenAIChat, apistyle.OpenAIResponses, apistyle.Gemini}
}

func (openCodeTarget) Description() string {
	return "Global ~/.config/opencode/*.json — provider blocks + top-level model (see OpenCode docs)"
}

func (openCodeTarget) Installed() bool {
	return cliExecutableOnPATH("opencode")
}

func (openCodeTarget) Apply(p profile.Profile) error {
	if p.CLI != agentkind.OpenCode {
		return fmt.Errorf("wrong cli %q for opencode target", p.CLI)
	}
	dir, err := OpenCodeGlobalDir()
	if err != nil {
		return err
	}
	root, err := loadOpenCodeGlobalMerged(dir)
	if err != nil {
		return err
	}
	writePath, err := OpenCodeWritableConfigPath()
	if err != nil {
		return err
	}
	prov, _ := root["provider"].(map[string]any)
	if prov == nil {
		prov = map[string]any{}
		root["provider"] = prov
	}

	seg := profileModelSegment(p.Model)
	if seg == "" {
		return fmt.Errorf("profile model is required for opencode apply")
	}

	switch p.APIStyle {
	case apistyle.Claude:
		ent := map[string]any{}
		if cur, ok := prov["anthropic"].(map[string]any); ok && cur != nil {
			ent = cur
		}
		opts := map[string]any{}
		if o, ok := ent["options"].(map[string]any); ok && o != nil {
			opts = o
		}
		opts["baseURL"] = ensureAnthropicWireBaseURL(p.BaseURL)
		opts["apiKey"] = p.APIKey
		ent["options"] = opts
		prov["anthropic"] = ent
		root["model"] = "anthropic/" + seg

	case apistyle.OpenAIChat:
		prov[opencodeRelayID] = openCodeRelayEntry(p, "@ai-sdk/openai-compatible", seg)
		root["model"] = opencodeRelayID + "/" + seg

	case apistyle.OpenAIResponses:
		prov[opencodeRelayID] = openCodeRelayEntry(p, "@ai-sdk/openai", seg)
		root["model"] = opencodeRelayID + "/" + seg

	case apistyle.Gemini:
		ent := map[string]any{}
		if cur, ok := prov["gemini"].(map[string]any); ok && cur != nil {
			ent = cur
		}
		opts := map[string]any{}
		if o, ok := ent["options"].(map[string]any); ok && o != nil {
			opts = o
		}
		opts["baseURL"] = ensureOpenCodeSDKBaseURL(p.BaseURL)
		opts["apiKey"] = p.APIKey
		ent["options"] = opts
		prov["gemini"] = ent
		root["model"] = "gemini/" + seg

	default:
		return fmt.Errorf("unsupported api style %q for opencode", p.APIStyle)
	}

	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(writePath, out, 0o600)
}

func (openCodeTarget) ResetDefault() error {
	dir, err := OpenCodeGlobalDir()
	if err != nil {
		return err
	}
	root, err := loadOpenCodeGlobalMerged(dir)
	if err != nil {
		return err
	}
	if len(root) == 0 {
		return nil
	}
	writePath, err := OpenCodeWritableConfigPath()
	if err != nil {
		return err
	}
	prov, _ := root["provider"].(map[string]any)
	if prov != nil {
		delete(prov, opencodeRelayID)
		for _, id := range []string{"anthropic", "gemini"} {
			ent, _ := prov[id].(map[string]any)
			if ent == nil {
				continue
			}
			opts, _ := ent["options"].(map[string]any)
			if opts == nil {
				continue
			}
			delete(opts, "baseURL")
			delete(opts, "apiKey")
			if len(opts) == 0 {
				delete(ent, "options")
			} else {
				ent["options"] = opts
			}
			if len(ent) == 0 {
				delete(prov, id)
			} else {
				prov[id] = ent
			}
		}
		if len(prov) == 0 {
			delete(root, "provider")
		} else {
			root["provider"] = prov
		}
	}
	delete(root, "model")
	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(writePath, out, 0o600)
}

func openCodeRelayEntry(p profile.Profile, npm, modelSeg string) map[string]any {
	return map[string]any{
		"npm":  npm,
		"name": "CLOVAPI relay",
		"options": map[string]any{
			"baseURL": ensureOpenCodeSDKBaseURL(p.BaseURL),
			"apiKey":  p.APIKey,
		},
		"models": map[string]any{
			modelSeg: map[string]any{"name": modelSeg},
		},
	}
}
