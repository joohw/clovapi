//go:build darwin

package desktop

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

var (
	darwinLoginShellDirsOnce sync.Once
	darwinLoginShellDirs     []string
)

func loginShellSearchDirs() []string {
	darwinLoginShellDirsOnce.Do(func() {
		home, err := os.UserHomeDir()
		if err != nil || strings.TrimSpace(home) == "" {
			return
		}
		user := strings.TrimSpace(os.Getenv("USER"))
		if user == "" {
			user = strings.TrimSpace(os.Getenv("LOGNAME"))
		}
		shell := strings.TrimSpace(os.Getenv("SHELL"))
		if shell == "" {
			shell = "/bin/zsh"
		}
		cmd := exec.Command(shell, "-ilc", `printf %s "$PATH"`)
		cmd.Env = []string{
			"HOME=" + home,
			"USER=" + user,
			"LOGNAME=" + user,
			"SHELL=" + shell,
		}
		out, err := cmd.Output()
		if err != nil {
			return
		}
		seen := map[string]struct{}{}
		for _, dir := range filepath.SplitList(strings.TrimSpace(string(out))) {
			dir = strings.TrimSpace(dir)
			if dir == "" {
				continue
			}
			if _, ok := seen[dir]; ok {
				continue
			}
			seen[dir] = struct{}{}
			darwinLoginShellDirs = append(darwinLoginShellDirs, dir)
		}
	})
	return darwinLoginShellDirs
}

func platformSearchDirs(home string) []string {
	return darwinExtraSearchDirs(home)
}
