package apply

import "os/exec"

// cliExecutableOnPATH returns true if exe is found via PATH (same semantics as exec.LookPath).
func cliExecutableOnPATH(exe string) bool {
	_, err := exec.LookPath(exe)
	return err == nil
}
