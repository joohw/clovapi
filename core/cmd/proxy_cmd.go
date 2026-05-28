package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
	coreproxy "github.com/clovapi/switcher/internal/proxy"
	"github.com/clovapi/switcher/internal/syslog"
)

func resolveProxyConfig(hostFlag string, portFlag int) (profile.ProxyConfig, error) {
	s, err := profile.Load()
	if err != nil {
		return profile.ProxyConfig{}, err
	}
	cfg := s.Proxy
	if strings.TrimSpace(hostFlag) != "" {
		cfg.Host = strings.TrimSpace(hostFlag)
	}
	if portFlag != 0 {
		cfg.Port = portFlag
	}
	return cfg, nil
}

func proxyHealthClientHost(bindHost string) string {
	host := strings.TrimSpace(bindHost)
	if host == "" {
		return "127.0.0.1"
	}
	switch strings.ToLower(host) {
	case "0.0.0.0", "::", "::ffff:0.0.0.0":
		return "127.0.0.1"
	default:
		return host
	}
}

func proxyHealthURL(cfg profile.ProxyConfig) string {
	host := proxyHealthClientHost(cfg.Host)
	return fmt.Sprintf("http://%s:%d/health", host, cfg.Port)
}

func proxyBaseURL(cfg profile.ProxyConfig) string {
	host := proxyHealthClientHost(cfg.Host)
	return fmt.Sprintf("http://%s:%d", host, cfg.Port)
}

func probeProxyHealth(cfg profile.ProxyConfig) (bool, error) {
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(proxyHealthURL(cfg))
	if err != nil {
		return false, nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false, nil
	}
	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return false, nil
	}
	ok, _ := body["ok"].(bool)
	service, _ := body["service"].(string)
	return ok && strings.Contains(service, "clovapi-core-proxy"), nil
}

func waitForProxyHealth(cfg profile.ProxyConfig, deadline time.Duration) error {
	deadlineAt := time.Now().Add(deadline)
	var lastErr error
	for time.Now().Before(deadlineAt) {
		ok, err := probeProxyHealth(cfg)
		if err != nil {
			return err
		}
		if ok {
			return nil
		}
		lastErr = fmt.Errorf("proxy not healthy yet at %s", proxyHealthURL(cfg))
		time.Sleep(100 * time.Millisecond)
	}
	if lastErr != nil {
		return lastErr
	}
	return fmt.Errorf("timeout waiting for proxy at %s", proxyHealthURL(cfg))
}

func proxyLogPath() (string, error) {
	dir, err := config.Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "proxy.log"), nil
}

func spawnDetachedProxyServe(cfg profile.ProxyConfig) (int, error) {
	exe, err := os.Executable()
	if err != nil {
		return 0, err
	}
	logPath, err := proxyLogPath()
	if err != nil {
		return 0, err
	}
	if err := os.MkdirAll(filepath.Dir(logPath), 0o700); err != nil {
		return 0, err
	}
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return 0, err
	}

	host := strings.TrimSpace(cfg.Host)
	if host == "" {
		host = "127.0.0.1"
	}
	args := []string{"__proxy-daemon", "--host", host, "--port", strconv.Itoa(cfg.Port)}
	cmd := exec.Command(exe, args...)
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	setDetachedProcess(cmd)
	if err := cmd.Start(); err != nil {
		_ = logFile.Close()
		return 0, err
	}
	_ = logFile.Close()
	if err := writeProxyPIDFile(cmd.Process.Pid, cfg); err != nil {
		return cmd.Process.Pid, fmt.Errorf("proxy started (pid %d) but failed to write pid file: %w", cmd.Process.Pid, err)
	}
	return cmd.Process.Pid, nil
}

func runProxyForeground(cfg profile.ProxyConfig) error {
	pid := os.Getpid()
	if err := writeProxyPIDFile(pid, cfg); err != nil {
		return err
	}
	defer removeProxyPIDFileIfPID(pid)

	server := coreproxy.NewServer(cfg)
	syslog.LogProxyStarted(server.Config.Host, server.Config.Port)
	fmt.Printf("clovapi core proxy listening on %s\n", proxyBaseURL(server.Config))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		errCh <- server.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		syslog.LogProxyStopped("signal")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
		return nil
	case err := <-errCh:
		if err != nil && err != http.ErrServerClosed {
			return err
		}
		return nil
	}
}

func runProxyStart(cfg profile.ProxyConfig, verbose bool) error {
	ok, err := probeProxyHealth(cfg)
	if err != nil {
		return err
	}
	baseURL := proxyBaseURL(cfg)
	if ok {
		if verbose {
			fmt.Printf("clovapi proxy already running at %s\n", baseURL)
		}
		return nil
	}

	pid, err := spawnDetachedProxyServe(cfg)
	if err != nil {
		return fmt.Errorf("start proxy: %w", err)
	}
	if err := waitForProxyHealth(cfg, 15*time.Second); err != nil {
		return fmt.Errorf("proxy started (pid %d) but health check failed: %w", pid, err)
	}
	if verbose {
		fmt.Printf("clovapi proxy started (pid %d) at %s\n", pid, baseURL)
	}
	return nil
}

func ensureProxyRunning() error {
	cfg, err := resolveProxyConfig("", 0)
	if err != nil {
		return err
	}
	if !cfg.Enabled {
		return nil
	}
	return runProxyStart(cfg, false)
}

func shouldSkipAutoProxy(cmd *cobra.Command) bool {
	if cmd != nil && cmd.Parent() != nil && cmd.Parent().Name() == "proxy" {
		switch cmd.Name() {
		case "start", "stop", "status", "config", "logs", "syslogs":
			return true
		}
	}
	// proxy logs/syslogs subcommands (list, read, …)
	for c := cmd; c != nil; c = c.Parent() {
		if c.Name() == "logs" || c.Name() == "syslogs" {
			if p := c.Parent(); p != nil && p.Name() == "proxy" {
				return true
			}
		}
	}
	if cmd != nil &&
		cmd.Name() == "test" &&
		cmd.Parent() != nil &&
		cmd.Parent().Name() == "profiles" &&
		cmd.Parent().Parent() != nil &&
		cmd.Parent().Parent().Name() == "desktop" {
		return true
	}
	for c := cmd; c != nil; c = c.Parent() {
		switch c.Name() {
		case "__proxy-daemon", "update", "version":
			return true
		}
	}
	return false
}

func cmdHiddenProxyDaemon() *cobra.Command {
	var host string
	var port int
	c := &cobra.Command{
		Use:    "__proxy-daemon",
		Hidden: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := resolveProxyConfig(host, port)
			if err != nil {
				return err
			}
			return runProxyForeground(cfg)
		},
	}
	c.Flags().StringVar(&host, "host", "", "Host to listen on")
	c.Flags().IntVar(&port, "port", 0, "Port to listen on")
	return c
}
