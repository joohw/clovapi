package desktop

import (
	"testing"

	cfgpkg "github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
)

func TestLoadSaveProxyConfigRoundtrip(t *testing.T) {
	dir := t.TempDir()
	cfgpkg.SetDirOverride(dir)
	t.Cleanup(func() { cfgpkg.SetDirOverride("") })

	if got := LoadProxyConfig(); !got.OK {
		t.Fatalf("LoadProxyConfig: %s", got.Error)
	}
	saved := SaveProxyConfig(UIProxyConfig{Enabled: true, Host: "127.0.0.1", Port: 27484})
	if !saved.OK {
		t.Fatalf("SaveProxyConfig: %s", saved.Error)
	}
	if saved.Proxy.Port != 27484 {
		t.Fatalf("port = %d, want 27484", saved.Proxy.Port)
	}

	s, err := profile.LoadDesktop()
	if err != nil {
		t.Fatal(err)
	}
	if s.Proxy.Port != 27484 {
		t.Fatalf("store port = %d, want 27484", s.Proxy.Port)
	}
}
