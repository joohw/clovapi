package desktop

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apply"
	"github.com/clovapi/switcher/internal/profile"
)

func cliConfigPath(kind agentkind.Kind) (string, error) {
	switch kind {
	case agentkind.ClaudeCode:
		return apply.ClaudeSettingsPath()
	case agentkind.Codex:
		return apply.CodexConfigPath()
	case agentkind.OpenCode:
		return apply.OpenCodeConfigPath()
	case agentkind.OpenClaw:
		return apply.OpenClawConfigPath()
	case agentkind.Hermes:
		return apply.HermesConfigPath()
	case agentkind.KimiCode:
		return apply.KimiConfigPath()
	default:
		return "", fmt.Errorf("unsupported cli %q", kind)
	}
}

func writeBackupFileAtomic(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, perm); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

// EnsureCLIBackup captures the original config file before clovapi mutates it.
// Once a backup exists for the CLI, later switches keep reusing it until reset.
func EnsureCLIBackup(kind agentkind.Kind) error {
	_, err := profile.WithLockedStore(func(s *profile.Store) (bool, error) {
		if _, ok := s.BackupForCLI(string(kind)); ok {
			return false, nil
		}
		path, err := cliConfigPath(kind)
		if err != nil {
			return false, err
		}
		backup := profile.ConfigBackup{Path: path}
		data, err := os.ReadFile(path)
		if err != nil {
			if !os.IsNotExist(err) {
				return false, err
			}
		} else {
			backup.Existed = true
			backup.Content = append([]byte(nil), data...)
		}
		s.SetBackup(string(kind), backup)
		if s.Version < profile.StoreVersion {
			s.Version = profile.StoreVersion
		}
		return true, nil
	})
	return err
}

func restoreBackupFile(kind agentkind.Kind, backup profile.ConfigBackup) error {
	path, err := cliConfigPath(kind)
	if err != nil {
		return err
	}
	if backup.Existed {
		return writeBackupFileAtomic(path, backup.Content, 0o600)
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	stale := strings.TrimSpace(backup.Path)
	if stale != "" && stale != path {
		if err := os.Remove(stale); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

// ResetCLIToDefault restores the exact pre-clovapi config snapshot when one is
// available. Older stores without a snapshot fall back to the legacy
// best-effort field deletion logic.
func ResetCLIToDefault(kind agentkind.Kind) error {
	restored := false
	_, err := profile.WithLockedStore(func(s *profile.Store) (bool, error) {
		backup, ok := s.BackupForCLI(string(kind))
		if !ok {
			return false, nil
		}
		if err := restoreBackupFile(kind, backup); err != nil {
			return false, err
		}
		s.ClearBackup(string(kind))
		s.ClearActive(string(kind))
		restored = true
		return true, nil
	})
	if err != nil {
		return err
	}
	if restored {
		return nil
	}
	if err := apply.ResetDefault(kind); err != nil {
		return err
	}
	_, err = profile.WithLockedStore(func(s *profile.Store) (bool, error) {
		changed := false
		if _, ok := s.BackupForCLI(string(kind)); ok {
			s.ClearBackup(string(kind))
			changed = true
		}
		if _, ok := s.Active[string(kind)]; ok {
			s.ClearActive(string(kind))
			changed = true
		}
		return changed, nil
	})
	return err
}
