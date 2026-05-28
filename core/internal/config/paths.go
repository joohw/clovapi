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

// CallLogsDir returns the directory for proxy call logs and system logs.
func CallLogsDir() (string, error) {
	d, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "logs"), nil
}

// CallLogsDBPath returns the SQLite database for persisted proxy call logs.
func CallLogsDBPath() (string, error) {
	d, err := CallLogsDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "call-logs.sqlite"), nil
}

// SystemLogsDBPath returns the SQLite database for persisted system logs.
func SystemLogsDBPath() (string, error) {
	d, err := CallLogsDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "system-logs.sqlite"), nil
}

// CallLogsPath returns the default JSONL file for requests without a session id.
func CallLogsPath() (string, error) {
	d, err := CallLogsDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "default.jsonl"), nil
}

// SetDirOverride sets the config directory (tests only). Empty clears.
func SetDirOverride(dir string) {
	overrideDir = dir
}

// CliBinDir returns the directory for a user-managed clovapi binary (updated separately from the desktop bundle).
func CliBinDir() (string, error) {
	d, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "bin"), nil
}

// CliBinPath returns the default install path for `clovapi update`.
func CliBinPath() (string, error) {
	dir, err := CliBinDir()
	if err != nil {
		return "", err
	}
	name := "clovapi"
	if runtime.GOOS == "windows" {
		name = "clovapi.exe"
	}
	return filepath.Join(dir, name), nil
}

// CliVersionMetaPath stores the version string last installed by `clovapi update`.
func CliVersionMetaPath() (string, error) {
	dir, err := CliBinDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "version.txt"), nil
}

// CliInstallLockPath coordinates writers that install or update the user-managed CLI binary.
func CliInstallLockPath() (string, error) {
	dir, err := CliBinDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, ".install.lock"), nil
}
