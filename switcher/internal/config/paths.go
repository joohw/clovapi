package config

import (
	"os"
	"path/filepath"
	"runtime"
)

var overrideDir string

// Dir returns the directory for clovapi state (profiles.json).
func Dir() (string, error) {
	if overrideDir != "" {
		return overrideDir, nil
	}
	if runtime.GOOS == "windows" {
		d, err := os.UserConfigDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(d, "clovapi"), nil
	}
	if x := os.Getenv("XDG_CONFIG_HOME"); x != "" {
		return filepath.Join(x, "clovapi"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "clovapi"), nil
}

func ProfilesPath() (string, error) {
	d, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "profiles.json"), nil
}

// SetDirOverride sets the config directory (tests only). Empty clears.
func SetDirOverride(dir string) {
	overrideDir = dir
}
