package ratio_setting

import "testing"

func TestFormatMatchingModelName_XiaomiMimoAlias(t *testing.T) {
	got := FormatMatchingModelName("xiaomimimo/mimo-v2-flash")
	want := "xiaomi/mimo-v2-flash"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestFormatMatchingModelName_ProviderPrefixFallback(t *testing.T) {
	got := FormatMatchingModelName("someprovider/gpt-4o")
	want := "gpt-4o"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestFormatMatchingModelName_KeepUnknownPrefixedModel(t *testing.T) {
	model := "someprovider/non-existent-model-xyz"
	got := FormatMatchingModelName(model)
	if got != model {
		t.Fatalf("expected %q to remain unchanged, got %q", model, got)
	}
}
