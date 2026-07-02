//go:build windows

package subscriptionauth

import (
	"fmt"
	"syscall"
	"unsafe"
)

var shellExecuteW = syscall.NewLazyDLL("shell32.dll").NewProc("ShellExecuteW")

func openBrowserURLWindows(rawURL string) error {
	verb, err := syscall.UTF16PtrFromString("open")
	if err != nil {
		return err
	}
	target, err := syscall.UTF16PtrFromString(rawURL)
	if err != nil {
		return err
	}
	ret, _, callErr := shellExecuteW.Call(
		0,
		uintptr(unsafe.Pointer(verb)),
		uintptr(unsafe.Pointer(target)),
		0,
		0,
		1, // SW_SHOWNORMAL
	)
	if ret > 32 {
		return nil
	}
	if callErr != syscall.Errno(0) {
		return fmt.Errorf("ShellExecuteW failed with code %d: %w", ret, callErr)
	}
	return fmt.Errorf("ShellExecuteW failed with code %d", ret)
}
