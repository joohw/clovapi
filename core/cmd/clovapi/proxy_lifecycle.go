package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/syslog"
)

type proxyPIDRecord struct {
	PID       int    `json:"pid"`
	Host      string `json:"host"`
	Port      int    `json:"port"`
	StartedAt string `json:"started_at"`
}

func proxyPIDPath() (string, error) {
	dir, err := config.Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "proxy.pid"), nil
}

func writeProxyPIDFile(pid int, cfg profile.ProxyConfig) error {
	if pid <= 0 {
		return errors.New("proxy pid is invalid")
	}
	path, err := proxyPIDPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	rec := proxyPIDRecord{
		PID:       pid,
		Host:      strings.TrimSpace(cfg.Host),
		Port:      cfg.Port,
		StartedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	data, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o600)
}

func readProxyPIDFile() (proxyPIDRecord, error) {
	path, err := proxyPIDPath()
	if err != nil {
		return proxyPIDRecord{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return proxyPIDRecord{}, err
		}
		return proxyPIDRecord{}, err
	}
	var rec proxyPIDRecord
	if err := json.Unmarshal(bytesTrimSpace(data), &rec); err != nil {
		return proxyPIDRecord{}, err
	}
	return rec, nil
}

func bytesTrimSpace(data []byte) []byte {
	return []byte(strings.TrimSpace(string(data)))
}

func removeProxyPIDFile() {
	path, err := proxyPIDPath()
	if err != nil {
		return
	}
	_ = os.Remove(path)
}

func removeProxyPIDFileIfPID(pid int) {
	rec, err := readProxyPIDFile()
	if err != nil || rec.PID != pid {
		return
	}
	removeProxyPIDFile()
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
		// FindProcess always succeeds on Windows; use exit code probe via tasklist.
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

func findListenPID(port int) (int, error) {
	if port <= 0 {
		return 0, errors.New("port is invalid")
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
		return 0, errors.New("no listener found")
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
	return 0, errors.New("no listener found")
}

var (
	probeProxyHealthForStop = probeProxyHealth
	processAliveForStop     = processAlive
	killProcessTreeForStop  = killProcessTree
	findListenPIDForStop    = findListenPID
)

func waitProxyDown(cfg profile.ProxyConfig, deadline time.Duration) error {
	deadlineAt := time.Now().Add(deadline)
	for time.Now().Before(deadlineAt) {
		ok, err := probeProxyHealth(cfg)
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("proxy still healthy at %s", proxyHealthURL(cfg))
}

func verifyPortListenerIsClovapiProxy(cfg profile.ProxyConfig, pid int) error {
	ok, err := probeProxyHealthForStop(cfg)
	if err != nil {
		return err
	}
	if ok {
		return nil
	}
	return fmt.Errorf("refusing to stop process %d listening on %s: health endpoint does not identify as clovapi proxy", pid, proxyBaseURL(cfg))
}

func runProxyStop(cfg profile.ProxyConfig, verbose bool) error {
	wasHealthy, _ := probeProxyHealthForStop(cfg)

	if wasHealthy {
		_ = shutdownProxyViaHTTP(cfg)
		_ = waitProxyDown(cfg, 5*time.Second)
	}

	rec, pidErr := readProxyPIDFile()
	if pidErr == nil && rec.PID > 0 {
		if processAliveForStop(rec.PID) {
			if err := killProcessTreeForStop(rec.PID); err != nil && verbose {
				fmt.Fprintf(os.Stderr, "warning: kill proxy pid %d: %v\n", rec.PID, err)
			}
		}
	}

	if listenPID, err := findListenPIDForStop(cfg.Port); err == nil && listenPID > 0 {
		if pidErr != nil || listenPID != rec.PID {
			if err := verifyPortListenerIsClovapiProxy(cfg, listenPID); err != nil {
				return err
			}
			_ = killProcessTreeForStop(listenPID)
		}
	}

	removeProxyPIDFile()

	if wasHealthy {
		if err := waitProxyDown(cfg, 2*time.Second); err != nil {
			return err
		}
	}

	syslog.LogProxyStopped("cli-stop")
	if verbose {
		fmt.Printf("clovapi proxy stopped (%s)\n", proxyBaseURL(cfg))
	}
	return nil
}

func shutdownProxyViaHTTP(cfg profile.ProxyConfig) bool {
	url := proxyBaseURL(cfg) + "/__debug/shutdown"
	req, err := http.NewRequest(http.MethodPost, url, nil)
	if err != nil {
		return false
	}
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}
