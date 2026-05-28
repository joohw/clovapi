//go:build windows

package selfupdate

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func installBinary(data []byte, targetPath, execPath string) error {
	targetPath = strings.TrimSpace(targetPath)
	if targetPath == "" {
		return fmt.Errorf("target path is empty")
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o700); err != nil {
		return err
	}

	tmp, err := os.CreateTemp(filepath.Dir(targetPath), ".clovapi-update-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	cleanupTmp := func() { _ = os.Remove(tmpName) }
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		cleanupTmp()
		return err
	}
	if err := tmp.Close(); err != nil {
		cleanupTmp()
		return err
	}

	stopper := strings.TrimSpace(execPath)
	if stopper == "" {
		stopper = targetPath
	}
	stopProxyBeforeInstall(stopper)

	if sameInstalledBinary(targetPath, execPath) {
		return installBinaryDeferredSelfUpdate(tmpName, targetPath, stopper)
	}

	if err := replaceWindowsBinary(tmpName, targetPath, stopper); err == nil {
		return nil
	}
	cleanupTmp()
	return installBinaryDeferredReplace(data, targetPath, stopper)
}

func stopProxyBeforeInstall(cliPath string) {
	cliPath = strings.TrimSpace(cliPath)
	if cliPath == "" {
		return
	}
	if _, err := os.Stat(cliPath); err != nil {
		return
	}
	cmd := exec.Command(cliPath, "proxy", "stop")
	cmd.Stdout = nil
	cmd.Stderr = nil
	_ = cmd.Run()
	time.Sleep(400 * time.Millisecond)
}

func replaceWindowsBinary(sourcePath, targetPath, cliPath string) error {
	for attempt := 0; attempt < 8; attempt++ {
		if _, err := os.Stat(targetPath); err == nil {
			_ = os.Remove(targetPath)
			if _, err := os.Stat(targetPath); err == nil {
				oldPath := targetPath + ".old"
				_ = os.Remove(oldPath)
				_ = os.Rename(targetPath, oldPath)
			}
		}
		if err := os.Rename(sourcePath, targetPath); err == nil {
			_ = os.Remove(targetPath + ".old")
			return nil
		}
		stopProxyBeforeInstall(cliPath)
		time.Sleep(time.Duration(300*(attempt+1)) * time.Millisecond)
	}
	return fmt.Errorf("replace locked binary %s", targetPath)
}

func installBinaryDeferredReplace(data []byte, targetPath, cliPath string) error {
	pendingPath := targetPath + ".new"
	if err := os.WriteFile(pendingPath, data, 0o755); err != nil {
		return err
	}
	if runDeferredWindowsReplace(targetPath, pendingPath, cliPath, 0) {
		return nil
	}
	_ = os.Remove(pendingPath)
	return fmt.Errorf("EPERM: operation not permitted, replace %q; stop the clovapi proxy and retry", targetPath)
}

func installBinaryDeferredSelfUpdate(tmpPath, targetPath, cliPath string) error {
	pendingPath := targetPath + ".new"
	_ = os.Remove(pendingPath)
	if err := os.Rename(tmpPath, pendingPath); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	pid := os.Getpid()
	if !runDeferredWindowsReplaceDetached(targetPath, pendingPath, cliPath, pid) {
		_ = os.Remove(pendingPath)
		return fmt.Errorf("failed to schedule self-update for %q", targetPath)
	}
	return nil
}

func runDeferredWindowsReplace(targetPath, pendingPath, cliPath string, waitPID int) bool {
	script := deferredReplaceScript(targetPath, pendingPath, cliPath, waitPID)
	cmd := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script)
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Run(); err != nil {
		return false
	}
	if _, err := os.Stat(targetPath); err != nil {
		return false
	}
	if _, err := os.Stat(pendingPath); err == nil {
		return false
	}
	return true
}

func runDeferredWindowsReplaceDetached(targetPath, pendingPath, cliPath string, waitPID int) bool {
	script := deferredReplaceScript(targetPath, pendingPath, cliPath, waitPID)
	cmd := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script)
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Stdin = nil
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Start() == nil
}

func deferredReplaceScript(targetPath, pendingPath, cliPath string, waitPID int) string {
	waitBlock := ""
	if waitPID > 0 {
		waitBlock = fmt.Sprintf(
			"Wait-Process -Id %d -ErrorAction SilentlyContinue\nStart-Sleep -Milliseconds 300\n",
			waitPID,
		)
	}
	return strings.Join([]string{
		"$ErrorActionPreference = 'Continue'",
		fmt.Sprintf("$target = %q", targetPath),
		fmt.Sprintf("$pending = %q", pendingPath),
		fmt.Sprintf("$cli = %q", cliPath),
		"for ($i = 0; $i -lt 40; $i++) {",
		"  try {",
		waitBlock,
		"    if (Test-Path $cli) { & $cli proxy stop 2>$null | Out-Null }",
		"    Start-Sleep -Milliseconds 300",
		"    if (Test-Path $target) { Remove-Item -LiteralPath $target -Force -ErrorAction Stop }",
		"    Move-Item -LiteralPath $pending -Destination $target -Force -ErrorAction Stop",
		"    Remove-Item -LiteralPath ($target + '.old') -Force -ErrorAction SilentlyContinue",
		"    exit 0",
		"  } catch {",
		"    Start-Sleep -Milliseconds 500",
		"  }",
		"}",
		"exit 1",
	}, "\n")
}
