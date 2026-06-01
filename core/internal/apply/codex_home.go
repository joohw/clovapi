package apply

import (
	"os"
	"path/filepath"
	"strings"
)

// CodexHomeDir returns the Codex config directory (CODEX_HOME, default ~/.codex).
func CodexHomeDir() (string, error) {
	if v := strings.TrimSpace(os.Getenv("CODEX_HOME")); v != "" {
		return filepath.Clean(v), nil
	}
	h, err := userHome()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, ".codex"), nil
}
