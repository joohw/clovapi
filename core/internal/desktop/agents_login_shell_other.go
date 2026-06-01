//go:build !darwin && !windows

package desktop

func loginShellSearchDirs() []string {
	return nil
}

func platformSearchDirs(home string) []string {
	return nil
}
