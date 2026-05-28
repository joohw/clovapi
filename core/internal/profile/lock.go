package profile

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	cfgpkg "github.com/clovapi/switcher/internal/config"
)

const (
	profilesLockName    = ".profiles.lock"
	profilesLockWait    = 5 * time.Second
	profilesLockStaleIn = 2 * time.Minute
)

func profilesLockPath() (string, error) {
	dir, err := cfgpkg.Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, profilesLockName), nil
}

func lockProfiles() (func(), error) {
	lockPath, err := profilesLockPath()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(lockPath), 0o700); err != nil {
		return nil, err
	}
	deadline := time.Now().Add(profilesLockWait)
	for {
		file, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if err == nil {
			_, _ = fmt.Fprintf(file, "pid=%d time=%s\n", os.Getpid(), time.Now().Format(time.RFC3339Nano))
			return func() {
				_ = file.Close()
				_ = os.Remove(lockPath)
			}, nil
		}
		if !os.IsExist(err) {
			return nil, err
		}
		if isStaleProfileLock(lockPath) {
			_ = os.Remove(lockPath)
			continue
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("timed out waiting for profiles lock: %s", lockPath)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func isStaleProfileLock(lockPath string) bool {
	info, err := os.Stat(lockPath)
	if err != nil {
		return false
	}
	return time.Since(info.ModTime()) > profilesLockStaleIn
}
