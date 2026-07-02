//go:build !windows

package subscriptionauth

import "fmt"

func openBrowserURLWindows(_ string) error {
	return fmt.Errorf("openBrowserURLWindows called on non-Windows platform")
}
