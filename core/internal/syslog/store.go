package syslog

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const defaultListMax = 0 // 0 = no limit

// Entry is one persisted system log row.
type Entry struct {
	ID      string `json:"id"`
	At      string `json:"at"`
	Stream  string `json:"stream"`
	Message string `json:"message"`
}

type Store struct {
	mu     sync.Mutex
	dbPath string
	db     *sql.DB
}

func NewStore() *Store {
	dbPath, err := DBPath()
	if err != nil {
		return &Store{}
	}
	db, err := openDB(dbPath, true)
	if err != nil {
		return &Store{dbPath: dbPath}
	}
	return &Store{dbPath: dbPath, db: db}
}

func newStoreAt(dir string) *Store {
	dbPath := filepath.Join(strings.TrimSpace(dir), "system-logs.sqlite")
	db, err := openDB(dbPath, false)
	if err != nil {
		return &Store{dbPath: dbPath}
	}
	return &Store{dbPath: dbPath, db: db}
}

func (s *Store) Push(stream, message string) {
	s.PushEntry(Entry{
		Stream:  stream,
		Message: message,
	})
}

func (s *Store) PushEntry(entry Entry) {
	if s == nil || s.db == nil {
		return
	}
	if strings.TrimSpace(entry.At) == "" {
		entry.At = time.Now().UTC().Format(time.RFC3339Nano)
	}
	if strings.TrimSpace(entry.Stream) == "" {
		entry.Stream = "system"
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = insertEntry(s.db, entry)
}

func (s *Store) ListRecent(limit int) []Entry {
	if s == nil || s.db == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entries, err := listEntries(s.db, limit)
	if err != nil {
		return nil
	}
	if entries == nil {
		return []Entry{}
	}
	return entries
}

func (s *Store) Clear() {
	if s == nil || s.db == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = clearDB(s.db)
}

func Write(stream, message string) {
	NewStore().Push(stream, message)
}

func Writef(stream, format string, args ...any) {
	Write(stream, fmt.Sprintf(format, args...))
}

func List(limit int) ([]Entry, error) {
	store := NewStore()
	if store == nil || store.db == nil {
		return nil, fmt.Errorf("system log store unavailable")
	}
	entries := store.ListRecent(limit)
	if entries == nil {
		return []Entry{}, nil
	}
	return entries, nil
}

func Clear() error {
	store := NewStore()
	if store == nil || store.db == nil {
		return fmt.Errorf("system log store unavailable")
	}
	store.Clear()
	return nil
}

func Append(entries []Entry) error {
	store := NewStore()
	if store == nil || store.db == nil {
		return fmt.Errorf("system log store unavailable")
	}
	for _, entry := range entries {
		store.PushEntry(entry)
	}
	return nil
}
