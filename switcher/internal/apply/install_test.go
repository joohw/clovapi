package apply

import (
	"testing"

	"github.com/clovapi/switcher/internal/clikind"
)

func TestPartitionKindsByInstall_CoversAllKindsExactlyOnce(t *testing.T) {
	installed, notReady := PartitionKindsByInstall()
	seen := map[clikind.Kind]bool{}
	for _, k := range installed {
		if seen[k] {
			t.Fatalf("duplicate in installed: %s", k)
		}
		seen[k] = true
	}
	for _, k := range notReady {
		if seen[k] {
			t.Fatalf("duplicate / overlap: %s", k)
		}
		seen[k] = true
	}
	for _, k := range RegisteredKinds() {
		if !seen[k] {
			t.Fatalf("missing kind %s", k)
		}
	}
}
