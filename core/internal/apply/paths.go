package apply

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func userHome() (string, error) {
	return os.UserHomeDir()
}

// ClaudeSettingsPath is Claude Code user settings.
func ClaudeSettingsPath() (string, error) {
	h, err := userHome()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, ".claude", "settings.json"), nil
}

// CodexConfigPath is Codex user config.toml under CodexHomeDir (CODEX_HOME, default ~/.codex).
func CodexConfigPath() (string, error) {
	dir, err := CodexHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.toml"), nil
}

// envOpenCodeDirOverride is optional absolute path to the OpenCode global config directory
// (the folder that contains config.json / opencode.json / opencode.jsonc). Tests set this so
// Windows hosts do not pick the real %AppData%\opencode when HOME is a temp dir.
const envOpenCodeDirOverride = "CLOVAPI_SWITCHER_OPENCODE_DIR"

func openCodeGlobalDirs(h string) ([]string, error) {
	if runtime.GOOS == "windows" {
		var dirs []string
		if cfg, err := os.UserConfigDir(); err == nil {
			dirs = append(dirs, filepath.Join(cfg, "opencode"))
		}
		dirs = append(dirs, filepath.Join(h, ".config", "opencode"))
		return dirs, nil
	}
	return []string{filepath.Join(h, ".config", "opencode")}, nil
}

func openCodeDirHasGlobalFile(dir string) bool {
	for _, name := range []string{"config.json", "opencode.json", "opencode.jsonc"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
			return true
		}
	}
	return false
}

// OpenCodeGlobalDir returns the directory OpenCode uses for Global.Path.config (xdg config + "opencode").
// On Windows, %AppData%\opencode is checked before ~/.config/opencode to match Node xdg-basedir.
func OpenCodeGlobalDir() (string, error) {
	if v := strings.TrimSpace(os.Getenv(envOpenCodeDirOverride)); v != "" {
		return filepath.Clean(v), nil
	}
	h, err := userHome()
	if err != nil {
		return "", err
	}
	dirs, err := openCodeGlobalDirs(h)
	if err != nil {
		return "", err
	}
	for _, d := range dirs {
		if openCodeDirHasGlobalFile(d) {
			return d, nil
		}
	}
	if len(dirs) > 0 {
		return dirs[0], nil
	}
	return filepath.Join(h, ".config", "opencode"), nil
}

// OpenCodeWritableConfigPath returns the global file OpenCode updates first (Config.globalConfigFile):
// first existing among opencode.jsonc, opencode.json, config.json; if none exist, opencode.jsonc in that dir.
func OpenCodeWritableConfigPath() (string, error) {
	dir, err := OpenCodeGlobalDir()
	if err != nil {
		return "", err
	}
	for _, name := range []string{"opencode.jsonc", "opencode.json", "config.json"} {
		p := filepath.Join(dir, name)
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return filepath.Join(dir, "opencode.jsonc"), nil
}

// OpenCodeConfigPath is the file clovapi writes for OpenCode changes. It matches OpenCode’s writable
// global path so values win over legacy config.json (upstream merges config.json then opencode.json then opencode.jsonc).
func OpenCodeConfigPath() (string, error) {
	return OpenCodeWritableConfigPath()
}

// OpenClawConfigPath returns ~/.openclaw/openclaw.json (OpenClaw gateway; override with OPENCLAW_CONFIG_PATH).
func OpenClawConfigPath() (string, error) {
	if v := strings.TrimSpace(os.Getenv("OPENCLAW_CONFIG_PATH")); v != "" {
		return v, nil
	}
	h, err := userHome()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, ".openclaw", "openclaw.json"), nil
}

// HermesConfigPath returns ~/.hermes/config.yaml when present, else that path for creation.
func HermesConfigPath() (string, error) {
	h, err := userHome()
	if err != nil {
		return "", err
	}
	p := filepath.Join(h, ".hermes", "config.yaml")
	return p, nil
}

// KimiConfigPath returns ~/.kimi/config.toml (Kimi Code CLI).
func KimiConfigPath() (string, error) {
	h, err := userHome()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, ".kimi", "config.toml"), nil
}
