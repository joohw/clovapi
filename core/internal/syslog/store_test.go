package syslog

import (
	"os"
	"path/filepath"
	"testing"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	store := newStoreAt(dir)
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func TestStorePushListAndClear(t *testing.T) {
	store := openTestStore(t)
	store.Push("system", "hello")
	store.Push("stderr", "warn")
	entries := store.ListRecent(10)
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	if entries[0].Message != "warn" || entries[1].Message != "hello" {
		t.Fatalf("unexpected order/messages: %+v", entries)
	}
	store.Clear()
	if len(store.ListRecent(10)) != 0 {
		t.Fatalf("expected cleared store")
	}
}

func TestStorePersistsAcrossReopen(t *testing.T) {
	dir := t.TempDir()
	store := newStoreAt(dir)
	store.Push("system", "persist me")
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	reopened := newStoreAt(dir)
	t.Cleanup(func() { _ = reopened.Close() })
	entries := reopened.ListRecent(10)
	if len(entries) != 1 || entries[0].Message != "persist me" {
		t.Fatalf("unexpected reopened entries: %+v", entries)
	}
	dbPath := filepath.Join(dir, "system-logs.sqlite")
	if _, err := os.Stat(dbPath); err != nil {
		t.Fatalf("expected sqlite file at %s: %v", dbPath, err)
	}
}
