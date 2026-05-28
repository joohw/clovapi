package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
)

func TestShouldSkipAutoProxyForProxyStop(t *testing.T) {
	parent := &cobra.Command{Use: "proxy"}
	stop := &cobra.Command{Use: "stop"}
	parent.AddCommand(stop)

	if !shouldSkipAutoProxy(stop) {
		t.Fatal("proxy stop should not trigger auto proxy startup")
	}
}

func TestProxyPIDFileRoundTrip(t *testing.T) {
	dir := t.TempDir()
	config.SetDirOverride(dir)
	t.Cleanup(func() { config.SetDirOverride("") })

	cfg := profile.ProxyConfig{Host: "127.0.0.1", Port: 27483}
	if err := writeProxyPIDFile(4242, cfg); err != nil {
		t.Fatal(err)
	}
	rec, err := readProxyPIDFile()
	if err != nil {
		t.Fatal(err)
	}
	if rec.PID != 4242 || rec.Port != 27483 {
		t.Fatalf("unexpected record: %+v", rec)
	}
	removeProxyPIDFile()
	if _, err := os.Stat(filepath.Join(dir, "proxy.pid")); !os.IsNotExist(err) {
		t.Fatalf("expected pid file removed, err=%v", err)
	}
}

func TestRunProxyStopRefusesForeignListenerWithoutPIDFile(t *testing.T) {
	dir := t.TempDir()
	config.SetDirOverride(dir)
	t.Cleanup(func() { config.SetDirOverride("") })

	cfg := profile.ProxyConfig{Host: "127.0.0.1", Port: 27483}
	var killed []int
	restoreProxyStopHooks(t,
		func(profile.ProxyConfig) (bool, error) { return false, nil },
		func(int) bool { return false },
		func(pid int) error {
			killed = append(killed, pid)
			return nil
		},
		func(int) (int, error) { return 4242, nil },
	)

	err := runProxyStop(cfg, false)
	if err == nil {
		t.Fatal("expected foreign listener error")
	}
	if !strings.Contains(err.Error(), "does not identify as clovapi proxy") {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(killed) != 0 {
		t.Fatalf("foreign listener was killed: %v", killed)
	}
}

func TestRunProxyStopRefusesForeignListenerWithStalePIDFile(t *testing.T) {
	dir := t.TempDir()
	config.SetDirOverride(dir)
	t.Cleanup(func() { config.SetDirOverride("") })

	cfg := profile.ProxyConfig{Host: "127.0.0.1", Port: 27483}
	if err := writeProxyPIDFile(1111, cfg); err != nil {
		t.Fatal(err)
	}
	var killed []int
	restoreProxyStopHooks(t,
		func(profile.ProxyConfig) (bool, error) { return false, nil },
		func(int) bool { return false },
		func(pid int) error {
			killed = append(killed, pid)
			return nil
		},
		func(int) (int, error) { return 4242, nil },
	)

	err := runProxyStop(cfg, false)
	if err == nil {
		t.Fatal("expected foreign listener error")
	}
	if !strings.Contains(err.Error(), "does not identify as clovapi proxy") {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(killed) != 0 {
		t.Fatalf("foreign listener was killed: %v", killed)
	}
}

func TestRunProxyStopKillsVerifiedClovapiListenerWithoutPIDFile(t *testing.T) {
	dir := t.TempDir()
	config.SetDirOverride(dir)
	t.Cleanup(func() { config.SetDirOverride("") })

	cfg := profile.ProxyConfig{Host: "127.0.0.1", Port: 27483}
	probes := 0
	var killed []int
	restoreProxyStopHooks(t,
		func(profile.ProxyConfig) (bool, error) {
			probes++
			return probes > 1, nil
		},
		func(int) bool { return false },
		func(pid int) error {
			killed = append(killed, pid)
			return nil
		},
		func(int) (int, error) { return 4242, nil },
	)

	if err := runProxyStop(cfg, false); err != nil {
		t.Fatal(err)
	}
	if len(killed) != 1 || killed[0] != 4242 {
		t.Fatalf("expected verified listener killed, got %v", killed)
	}
}

func restoreProxyStopHooks(
	t *testing.T,
	probe func(profile.ProxyConfig) (bool, error),
	alive func(int) bool,
	kill func(int) error,
	find func(int) (int, error),
) {
	t.Helper()
	originalProbe := probeProxyHealthForStop
	originalAlive := processAliveForStop
	originalKill := killProcessTreeForStop
	originalFind := findListenPIDForStop
	probeProxyHealthForStop = probe
	processAliveForStop = alive
	killProcessTreeForStop = kill
	findListenPIDForStop = find
	t.Cleanup(func() {
		probeProxyHealthForStop = originalProbe
		processAliveForStop = originalAlive
		killProcessTreeForStop = originalKill
		findListenPIDForStop = originalFind
	})
}

func TestVerifyPortListenerIsClovapiProxyPropagatesProbeError(t *testing.T) {
	want := errors.New("probe failed")
	restoreProxyStopHooks(t,
		func(profile.ProxyConfig) (bool, error) { return false, want },
		func(int) bool { return false },
		func(int) error { return nil },
		func(int) (int, error) { return 0, nil },
	)

	err := verifyPortListenerIsClovapiProxy(profile.ProxyConfig{Host: "127.0.0.1", Port: 27483}, 4242)
	if !errors.Is(err, want) {
		t.Fatalf("error = %v, want %v", err, want)
	}
}
