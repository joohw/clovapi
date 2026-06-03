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

func (openCodeTarget) InstallPlan() string {
	return "将通过 npm 安装 OpenCode（opencode-ai）。如果未检测到 npm，会先尝试自动安装 Node.js LTS/npm。"
}
func (openCodeTarget) Install() error {
	return npmGlobalInstall("opencode-ai")
}

func (openCodeTarget) Uninstall() error {
	return uninstallFromCandidates(
		npmGlobalUninstall("opencode-ai"),
		brewUninstall("opencode"),
		standaloneUninstall("opencode-npm-shim", npmGlobalShimFiles("opencode")...),
		standaloneUninstall("opencode", opencodeStandaloneFiles()...),
		standaloneUninstall("opencode-local", homeLocalBinFiles("opencode")...),
	)
}

func (openCodeTarget) Apply(p profile.Profile) error {
	if p.CLI != agentkind.OpenCode {
		return fmt.Errorf("wrong cli %q for opencode target", p.CLI)
	}
	root, writePath, err := loadOpenCodeWritableRoot()
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
		prov[opencodeRelayID] = openCodeRelayEntry(p, "@ai-sdk/anthropic", seg, ensureOpenCodeSDKBaseURL(p.BaseURL))
		root["model"] = opencodeRelayID + "/" + seg

	case apistyle.OpenAIChat:
		prov[opencodeRelayID] = openCodeRelayEntry(p, "@ai-sdk/openai-compatible", seg, ensureOpenCodeSDKBaseURL(p.BaseURL))
		root["model"] = opencodeRelayID + "/" + seg

	case apistyle.OpenAIResponses:
		prov[opencodeRelayID] = openCodeRelayEntry(p, "@ai-sdk/openai", seg, ensureOpenCodeSDKBaseURL(p.BaseURL))
		root["model"] = opencodeRelayID + "/" + seg

	case apistyle.Gemini:
		prov[opencodeRelayID] = openCodeRelayEntry(p, "@ai-sdk/google", seg, ensureOpenCodeSDKBaseURL(p.BaseURL))
		root["model"] = opencodeRelayID + "/" + seg

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
	root, writePath, err := loadOpenCodeWritableRoot()
	if err != nil {
		return err
	}
	if len(root) == 0 {
		return nil
	}
	changed := false
	prov, _ := root["provider"].(map[string]any)
	if prov != nil {
		if _, ok := prov[opencodeRelayID]; ok {
			delete(prov, opencodeRelayID)
			changed = true
		}
		if len(prov) == 0 {
			delete(root, "provider")
		} else {
			root["provider"] = prov
		}
	}
	if model, ok := root["model"].(string); ok && model == opencodeRelayID+"/"+profileModelSegment(model) {
		delete(root, "model")
		changed = true
	}
	if !changed {
		return nil
	}
	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(writePath, out, 0o600)
}

func loadOpenCodeWritableRoot() (map[string]any, string, error) {
	writePath, err := OpenCodeWritableConfigPath()
	if err != nil {
		return nil, "", err
	}
	root, err := readOpenCodeJSONLikeFile(writePath)
	if err != nil {
		return nil, "", err
	}
	if root == nil {
		root = map[string]any{}
	}
	return root, writePath, nil
}

func openCodeRelayEntry(p profile.Profile, npm, modelSeg, baseURL string) map[string]any {
	return map[string]any{
		"npm":  npm,
		"name": "clovapi",
		"options": map[string]any{
			"baseURL": baseURL,
			"apiKey":  p.APIKey,
		},
		"models": map[string]any{
			modelSeg: map[string]any{"name": modelSeg},
		},
	}
}
