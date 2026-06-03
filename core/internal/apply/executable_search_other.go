//go:build !darwin

package apply

func loginShellExecutableSearchDirs() []string {
	return nil
}

func platformExecutableSearchDirs(home string) []string {
	return nil
}
