package main

import (
	"os"
	"path/filepath"
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
