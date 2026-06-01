//go:build !windows

package desktop

import (
	"os"
	"runtime"
	"syscall"
)

func isExecutableFile(path string) bool {
	if runtime.GOOS == "darwin" {
		return syscall.Access(path, syscall.X_OK) == nil
	}
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	return info.Mode().Perm()&0o111 != 0
}
