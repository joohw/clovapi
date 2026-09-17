package profile

import (
	"os"
	"testing"

	"github.com/clovapi/switcher/internal/config"
	"golang.org/x/sys/windows"
)

func TestProfileLockRetriesWindowsDeletePendingCreation(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	t.Cleanup(func() { config.SetDirOverride("") })
	attempts := 0
	unlock, err := lockProfilesWithOpen(func(path string, flags int, mode os.FileMode) (*os.File, error) {
		attempts++
		if attempts == 1 {
			// Reproduce the transient error from exclusive creation racing the
			// previous owner's deletion; the next attempt uses the real file API.
			return nil, &os.PathError{Op: "open", Path: path, Err: windows.ERROR_ACCESS_DENIED}
		}
		return os.OpenFile(path, flags, mode)
	})
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	if attempts != 2 {
		t.Fatalf("lock was not retried after pending deletion: attempts=%d", attempts)
	}
	path, err := profilesLockPath()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("retry did not acquire the actual lock file: %v", err)
	}
}
