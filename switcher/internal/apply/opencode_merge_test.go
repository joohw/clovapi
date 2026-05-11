package apply

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadOpenCodeGlobalMergedOrder(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(`{"model":"a","x":1}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "opencode.json"), []byte(`{"model":"b"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	root, err := loadOpenCodeGlobalMerged(dir)
	if err != nil {
		t.Fatal(err)
	}
	if root["model"] != "b" {
		t.Fatalf("model: %v", root["model"])
	}
	if root["x"] != float64(1) {
		t.Fatalf("x: %v", root["x"])
	}
}
