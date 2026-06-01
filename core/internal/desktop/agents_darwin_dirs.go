package desktop

import "path/filepath"

// darwinExtraSearchDirs lists common user-level install roots on macOS that are
// often missing from the minimal PATH Finder/Dock gives GUI apps.
func darwinExtraSearchDirs(home string) []string {
	home = filepath.Clean(home)
	if home == "" || home == "." {
		return nil
	}
	return []string{
		filepath.Join(home, "bin"),
		filepath.Join(home, ".npm-global", "bin"),
		filepath.Join(home, "Library", "pnpm"),
		filepath.Join(home, ".volta", "bin"),
		filepath.Join(home, ".local", "share", "fnm", "current", "bin"),
		filepath.Join(home, ".fnm", "current", "bin"),
	}
}
