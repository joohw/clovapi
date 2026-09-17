//go:build !windows

package sharing

import (
	"os"
	"syscall"
)

func restrictPath(path string, dir bool) error {
	if dir {
		return os.Chmod(path, 0700)
	}
	return os.Chmod(path, 0600)
}

func acquireLock(path string, wait bool) (func(), error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	flags := syscall.LOCK_EX
	if !wait {
		flags |= syscall.LOCK_NB
	}
	if err = syscall.Flock(int(f.Fd()), flags); err != nil {
		f.Close()
		return nil, err
	}
	return func() { _ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN); _ = f.Close() }, nil
}
