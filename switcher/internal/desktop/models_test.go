package desktop

import "testing"

func TestVendorCatalogMatchesFixedProviders(t *testing.T) {
	catalog := VendorCatalog()
	if !catalog.OK {
		t.Fatalf("catalog not ok: %s", catalog.Error)
	}
	want := []string{"claude-code", "codex", "ollama", "custom-api"}
	if len(catalog.FixedProviderIDs) != len(want) {
		t.Fatalf("fixed ids = %v, want %v", catalog.FixedProviderIDs, want)
	}
	for i := range want {
		if catalog.FixedProviderIDs[i] != want[i] {
			t.Fatalf("fixed ids[%d] = %q, want %q", i, catalog.FixedProviderIDs[i], want[i])
		}
	}
	if len(catalog.Providers) != len(want) {
		t.Fatalf("providers = %d, want %d", len(catalog.Providers), len(want))
	}
	if len(catalog.Adapters) != 4 {
		t.Fatalf("adapters = %d, want 4", len(catalog.Adapters))
	}
}
