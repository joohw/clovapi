//go:build windows

package desktop

func isExecutableFile(path string) bool {
	return true
}
