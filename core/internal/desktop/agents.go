package desktop

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apply"
)

type AgentStatusItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Command     string `json:"command"`
	Kind        string `json:"kind"`
	Installed   bool   `json:"installed"`
	CommandPath string `json:"commandPath,omitempty"`
}

type AgentStatusResult struct {
	OK    bool              `json:"ok"`
	Items []AgentStatusItem `json:"items,omitempty"`
	Error string            `json:"error,omitempty"`
}

type CommandWhichResult struct {
	OK     bool   `json:"ok"`
	Exists bool   `json:"exists"`
	Path   string `json:"path,omitempty"`
	Error  string `json:"error,omitempty"`
}

type agentDefinition struct {
	ID      string
	Name    string
	Command string
	Kind    agentkind.Kind
}

var agentDefinitions = []agentDefinition{
	{ID: "cli-claude", Name: "ClaudeCli", Command: "claude", Kind: agentkind.ClaudeCode},
	{ID: "cli-codex", Name: "Codex", Command: "codex", Kind: agentkind.Codex},
	{ID: "cli-opencode", Name: "OpenCodeCli", Command: "opencode", Kind: agentkind.OpenCode},
	{ID: "cli-openclaw", Name: "OpenClaw", Command: "openclaw", Kind: agentkind.OpenClaw},
	{ID: "cli-hermes", Name: "Hermes", Command: "hermes", Kind: agentkind.Hermes},
	{ID: "cli-kimi-code", Name: "KimiCodeCli", Command: "kimi", Kind: agentkind.KimiCode},
}

// ResolveCommandPath finds agent CLIs from core, not the desktop shell. Packaged
// desktop apps launched from Finder often have a minimal PATH, so include common
// user-level install locations used by agent CLIs.
func ResolveCommandPath(command string) (string, bool) {
	name := strings.TrimSpace(command)
	if name == "" {
		return "", false
	}
	if p, err := exec.LookPath(name); err == nil && strings.TrimSpace(p) != "" {
		return p, true
	}
	for _, dir := range commandSearchDirs() {
		candidate := filepath.Join(dir, name)
		if executableFile(candidate) {
			return candidate, true
		}
		if runtime.GOOS == "windows" {
			for _, ext := range []string{".exe", ".cmd", ".ps1", ".bat"} {
				if strings.HasSuffix(strings.ToLower(candidate), ext) {
					continue
				}
				shim := candidate + ext
				if executableFile(shim) {
					return shim, true
				}
			}
		}
	}
	return "", false
}

func AgentStatus() AgentStatusResult {
	items := make([]AgentStatusItem, 0, len(agentDefinitions))
	for _, def := range agentDefinitions {
		cmdPath, installed := resolveAgentInstall(def)
		items = append(items, AgentStatusItem{
			ID:          def.ID,
			Name:        def.Name,
			Command:     def.Command,
			Kind:        string(def.Kind),
			Installed:   installed,
			CommandPath: cmdPath,
		})
	}
	return AgentStatusResult{OK: true, Items: items}
}

func resolveAgentInstall(def agentDefinition) (cmdPath string, installed bool) {
	if def.Kind == agentkind.Codex {
		installed = apply.CodexInstalled()
		if p, ok := apply.ResolveCodexExecutable(); ok {
			cmdPath = p
		}
		return cmdPath, installed
	}
	cmdPath, installed = ResolveCommandPath(def.Command)
	return cmdPath, installed
}

func CommandWhich(command string) CommandWhichResult {
	name := strings.TrimSpace(command)
	if name == "" {
		return CommandWhichResult{OK: false, Exists: false, Error: "command is required"}
	}
	if p, ok := ResolveCommandPath(name); ok {
		return CommandWhichResult{OK: true, Exists: true, Path: p}
	}
	return CommandWhichResult{OK: true, Exists: false, Error: "command not found: " + name}
}

func commandSearchDirs() []string {
	var dirs []string
	seen := map[string]bool{}
	add := func(dir string) {
		dir = strings.TrimSpace(dir)
		if dir == "" || seen[dir] {
			return
		}
		seen[dir] = true
		dirs = append(dirs, dir)
	}
	for _, dir := range filepath.SplitList(os.Getenv("PATH")) {
		add(dir)
	}
	home, _ := os.UserHomeDir()
	if home != "" {
		add(filepath.Join(home, ".config", "clovapi", "bin"))
		add(filepath.Join(home, ".local", "bin"))
		add(filepath.Join(home, ".opencode", "bin"))
		for _, dir := range platformSearchDirs(home) {
			add(dir)
		}
		for _, dir := range loginShellSearchDirs() {
			add(dir)
		}
	}
	if runtime.GOOS != "windows" {
		add("/opt/homebrew/bin")
		add("/opt/homebrew/sbin")
		add("/usr/local/bin")
		add("/usr/local/sbin")
		add("/usr/bin")
		add("/bin")
	}
	return dirs
}

func executableFile(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	return isExecutableFile(path)
}
