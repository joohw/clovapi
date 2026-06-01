//go:build darwin

package desktop

import "syscall"

func isExecutableFile(path string) bool {
	return syscall.Access(path, syscall.X_OK) == nil
}
