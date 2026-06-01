package proxycontrol

import (
	"os"
	"os/exec"

	"github.com/clovapi/switcher/internal/profile"
)

// ResumeIfWasRunning restarts the local proxy when OAuth paused a healthy daemon.
func ResumeIfWasRunning(wasRunning bool) {
	if !wasRunning {
		return
	}
	s, err := profile.Load()
	if err != nil || !s.Proxy.Enabled {
		return
	}
	if ok, _ := probeHealth(s.Proxy); ok {
		return
	}
	exe, err := os.Executable()
	if err != nil {
		return
	}
	cmd := exec.Command(exe, "proxy", "start")
	setDetachedProcess(cmd)
	_ = cmd.Start()
}
