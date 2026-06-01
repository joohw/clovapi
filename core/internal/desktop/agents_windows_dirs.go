//go:build windows

package desktop

import "github.com/clovapi/switcher/internal/apply"

func platformSearchDirs(home string) []string {
	return apply.CodexSearchDirs(home)
}

func loginShellSearchDirs() []string {
	return nil
}
