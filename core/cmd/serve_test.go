package main

import (
	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/desktop"
	"github.com/clovapi/switcher/internal/profile"
	"testing"
)

func TestBrowserRebindPreservesOldAddressUntilRestart(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	defer config.SetDirOverride("")
	controller := &browserProxy{active: profile.ProxyConfig{Host: "127.0.0.1", Port: 37483}}
	result, err := controller.Save(desktop.UIProxyConfig{Enabled: true, Host: "127.0.0.1", Port: 37485})
	if err != nil {
		t.Fatal(err)
	}
	if !result.(desktop.ProxyConfigResult).OK {
		t.Fatal(result)
	}
	if controller.active.Port != 37483 {
		t.Fatal("lost old listener address before stop")
	}
	saved := desktop.LoadProxyConfig()
	if saved.Proxy.Port != 37485 {
		t.Fatal("new proxy address not saved")
	}
	if _, err := controller.Save(desktop.UIProxyConfig{Host: "127.0.0.1", Port: 70000}); err == nil {
		t.Fatal("invalid port accepted")
	}
	if desktop.LoadProxyConfig().Proxy.Port != 37485 {
		t.Fatal("invalid configuration overwrote previous configuration")
	}
}

func TestServeDoesNotAutostartBeforeBindingManagement(t *testing.T) {
	if !shouldSkipAutoProxy(cmdServe()) {
		t.Fatal("serve must control its own startup order")
	}
}
