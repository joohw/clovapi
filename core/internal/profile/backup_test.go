package profile

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestConfigBackupRoundTripsInStoreJSON(t *testing.T) {
	store := &Store{
		Version: StoreVersion,
		Active:  map[string]ActiveSelection{},
		Proxy:   defaultProxyConfig(),
		Backups: map[string]ConfigBackup{
			"codex": {
				Path:    "/tmp/.codex/config.toml",
				Existed: true,
				Content: []byte("model_provider = \"openai\"\n"),
			},
		},
	}
	data, err := json.Marshal(store)
	if err != nil {
		t.Fatal(err)
	}
	var decoded Store
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	backup, ok := decoded.BackupForCLI("codex")
	if !ok || !backup.Existed || !bytes.Equal(backup.Content, store.Backups["codex"].Content) {
		t.Fatalf("backup roundtrip failed: ok=%v existed=%v content=%q", ok, backup.Existed, string(backup.Content))
	}
}
