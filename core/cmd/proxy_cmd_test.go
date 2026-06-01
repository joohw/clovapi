package main

import (
	"testing"

	"github.com/spf13/cobra"

	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/syslog"
)

func TestProxyHealthClientHost(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"127.0.0.1", "127.0.0.1"},
		{"0.0.0.0", "127.0.0.1"},
		{"::", "127.0.0.1"},
		{"", "127.0.0.1"},
	}
	for _, tc := range tests {
		if got := proxyHealthClientHost(tc.in); got != tc.want {
			t.Fatalf("proxyHealthClientHost(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestProxyBaseURLUsesLoopbackForWildcardBind(t *testing.T) {
	got := proxyBaseURL(profile.ProxyConfig{Host: "0.0.0.0", Port: 27483})
	want := "http://127.0.0.1:27483"
	if got != want {
		t.Fatalf("proxyBaseURL = %q, want %q", got, want)
	}
}

func TestShouldSkipAutoProxyForProxyStart(t *testing.T) {
	parent := &cobra.Command{Use: "proxy"}
	start := &cobra.Command{Use: "start"}
	parent.AddCommand(start)

	if !shouldSkipAutoProxy(start) {
		t.Fatal("proxy start should not trigger auto proxy startup")
	}
}

func TestShouldSkipAutoProxyForProfilesTest(t *testing.T) {
	profiles := &cobra.Command{Use: "profiles"}
	testCmd := &cobra.Command{Use: "test"}
	profiles.AddCommand(testCmd)

	if !shouldSkipAutoProxy(testCmd) {
		t.Fatal("profiles test should manage proxy startup itself")
	}
}

func TestShouldSkipAutoProxyForAuthLogin(t *testing.T) {
	auth := &cobra.Command{Use: "auth"}
	login := &cobra.Command{Use: "login"}
	auth.AddCommand(login)

	if !shouldSkipAutoProxy(login) {
		t.Fatal("auth login should not auto-start proxy during OAuth")
	}
}

func TestShouldSkipAutoProxyForDesktopAuthLogin(t *testing.T) {
	desktop := &cobra.Command{Use: "desktop"}
	auth := &cobra.Command{Use: "auth"}
	login := &cobra.Command{Use: "login"}
	desktop.AddCommand(auth)
	auth.AddCommand(login)

	if !shouldSkipAutoProxy(login) {
		t.Fatal("desktop auth login should not auto-start proxy during OAuth")
	}
}

func TestProxySyslogsListDefaultLimit(t *testing.T) {
	cmd := cmdProxySyslogs()
	listCmd, _, err := cmd.Find([]string{"list"})
	if err != nil {
		t.Fatal(err)
	}
	flag := listCmd.Flags().Lookup("limit")
	if flag == nil {
		t.Fatal("missing --limit flag")
	}
	want := "20"
	if flag.DefValue != want {
		t.Fatalf("syslogs list --limit default = %q, want %q", flag.DefValue, want)
	}
	if syslog.DefaultListLimit != 20 {
		t.Fatalf("syslog.DefaultListLimit = %d, want 20", syslog.DefaultListLimit)
	}
}
