package subscriptionauth

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func oauthCallbackPort(providerID string) (int, error) {
	switch strings.TrimSpace(providerID) {
	case ProviderClaudeCode:
		return claudeCallbackPort, nil
	case ProviderCodex:
		return codexCallbackPort, nil
	default:
		return 0, fmt.Errorf("unknown provider: %s", providerID)
	}
}

func prepareCallbackPort(port int) error {
	const attempts = 4
	var lastErr error
	for i := 0; i < attempts; i++ {
		if err := tryListenCallbackPort(port); err == nil {
			return nil
		} else {
			lastErr = err
		}
		releaseStaleCallbackListener(port)
		time.Sleep(150 * time.Millisecond)
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("callback port %d is unavailable", port)
	}
	return fmt.Errorf("OAuth callback port %d is already in use; try again later or close the program using that port: %w", port, lastErr)
}

func tryListenCallbackPort(port int) error {
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return err
	}
	return ln.Close()
}

func releaseStaleCallbackListener(port int) {
	pid, err := findListenPID(port)
	if err != nil || pid <= 0 || pid == os.Getpid() {
		return
	}
	if !isClovapiProcess(pid) {
		return
	}
	_ = killProcessTree(pid)
}

func findListenPID(port int) (int, error) {
	if port <= 0 {
		return 0, fmt.Errorf("port is invalid")
	}
	if runtime.GOOS == "windows" {
		cmd := exec.Command("cmd", "/c", fmt.Sprintf("netstat -ano -p tcp | findstr :%d | findstr LISTENING", port))
		out, err := cmd.Output()
		if err != nil {
			return 0, err
		}
		for _, line := range strings.Split(string(out), "\n") {
			fields := strings.Fields(strings.TrimSpace(line))
			if len(fields) < 5 {
				continue
			}
			pid, err := strconv.Atoi(fields[len(fields)-1])
			if err == nil && pid > 0 {
				return pid, nil
			}
		}
		return 0, fmt.Errorf("no listener found")
	}
	cmd := exec.Command("lsof", "-ti", fmt.Sprintf("tcp:%d", port), "-sTCP:LISTEN")
	out, err := cmd.Output()
	if err != nil {
		return 0, err
	}
	for _, field := range strings.Fields(string(out)) {
		pid, err := strconv.Atoi(field)
		if err == nil && pid > 0 {
			return pid, nil
		}
	}
	return 0, fmt.Errorf("no listener found")
}

func isClovapiProcess(pid int) bool {
	name := strings.ToLower(strings.TrimSpace(processName(pid)))
	return strings.Contains(name, "clovapi")
}

func processName(pid int) string {
	if pid <= 0 {
		return ""
	}
	if runtime.GOOS == "windows" {
		cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid), "/FO", "CSV", "/NH")
		out, err := cmd.Output()
		if err != nil {
			return ""
		}
		line := strings.TrimSpace(string(out))
		if line == "" || strings.Contains(line, "No tasks") {
			return ""
		}
		// Image Name is the first CSV field.
		if i := strings.Index(line, ","); i > 0 {
			return strings.Trim(strings.TrimSpace(line[:i]), `"`)
		}
		return strings.Trim(line, `"`)
	}
	if runtime.GOOS == "linux" {
		if data, err := os.ReadFile(fmt.Sprintf("/proc/%d/comm", pid)); err == nil {
			return strings.TrimSpace(string(data))
		}
	}
	cmd := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "comm=")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func killProcessTree(pid int) error {
	if pid <= 0 {
		return nil
	}
	if runtime.GOOS == "windows" {
		cmd := exec.Command("taskkill", "/PID", strconv.Itoa(pid), "/T", "/F")
		if out, err := cmd.CombinedOutput(); err != nil {
			text := strings.TrimSpace(string(out))
			if strings.Contains(text, "not found") {
				return nil
			}
			return fmt.Errorf("taskkill pid %d: %w: %s", pid, err, text)
		}
		return nil
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return nil
	}
	_ = proc.Signal(syscall.SIGTERM)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if !processAlive(pid) {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	_ = proc.Kill()
	return nil
}

func processAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	if runtime.GOOS == "windows" {
		cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid), "/NH")
		out, err := cmd.Output()
		if err != nil {
			return false
		}
		return strings.Contains(string(out), strconv.Itoa(pid))
	}
	err = proc.Signal(syscall.Signal(0))
	return err == nil
}
