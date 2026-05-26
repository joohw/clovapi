package syslog

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	cfgpkg "github.com/clovapi/switcher/internal/config"
	_ "modernc.org/sqlite"
)

const schemaSQL = `
CREATE TABLE IF NOT EXISTS system_log_meta (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS system_logs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	at TEXT NOT NULL,
	stream TEXT NOT NULL DEFAULT 'system',
	message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_system_logs_at ON system_logs(at DESC, id DESC);
`

const legacyImportMetaKey = "legacy_call_logs_import_v1"

func DBPath() (string, error) {
	return cfgpkg.SystemLogsDBPath()
}

func callLogsDBPath() (string, error) {
	return cfgpkg.CallLogsDBPath()
}

func openDB(dbPath string, migrateLegacy bool) (*sql.DB, error) {
	p := strings.TrimSpace(dbPath)
	if p == "" {
		return nil, errors.New("system log db path is empty")
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return nil, err
	}
	dsn := "file:" + p + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	if _, err := db.Exec(schemaSQL); err != nil {
		_ = db.Close()
		return nil, err
	}
	if migrateLegacy {
		if err := importLegacyIfNeeded(db); err != nil {
			_ = db.Close()
			return nil, err
		}
	}
	return db, nil
}

func importLegacyIfNeeded(db *sql.DB) error {
	if db == nil {
		return errors.New("system log db is nil")
	}
	var value string
	err := db.QueryRow(`SELECT value FROM system_log_meta WHERE key = ?`, legacyImportMetaKey).Scan(&value)
	if err == nil && value == "done" {
		return nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	callLogPath, err := callLogsDBPath()
	if err != nil {
		return err
	}
	if _, err := os.Stat(callLogPath); err != nil {
		if os.IsNotExist(err) {
			return markLegacyImported(db)
		}
		return err
	}

	legacyDSN := "file:" + callLogPath + "?mode=ro&_pragma=busy_timeout(5000)"
	legacyDB, err := sql.Open("sqlite", legacyDSN)
	if err != nil {
		return err
	}
	defer legacyDB.Close()
	if err := legacyDB.Ping(); err != nil {
		return err
	}

	rows, err := legacyDB.Query(`SELECT at, stream, message FROM system_logs ORDER BY id ASC`)
	if err != nil {
		return markLegacyImported(db)
	}
	defer rows.Close()

	imported := 0
	for rows.Next() {
		var entry Entry
		if err := rows.Scan(&entry.At, &entry.Stream, &entry.Message); err != nil {
			return err
		}
		if err := insertEntry(db, entry); err != nil {
			return err
		}
		imported++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if imported == 0 {
		var legacyCount int
		_ = legacyDB.QueryRow(`SELECT COUNT(*) FROM system_logs`).Scan(&legacyCount)
		if legacyCount > 0 {
			return fmt.Errorf("legacy system log import produced 0 rows")
		}
	}
	return markLegacyImported(db)
}

func markLegacyImported(db *sql.DB) error {
	_, err := db.Exec(
		`INSERT INTO system_log_meta(key, value) VALUES(?, ?)
		 ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
		legacyImportMetaKey,
		"done",
	)
	return err
}

func insertEntry(db *sql.DB, entry Entry) error {
	if db == nil {
		return errors.New("system log db is nil")
	}
	_, err := db.Exec(
		`INSERT INTO system_logs (at, stream, message) VALUES (?, ?, ?)`,
		entry.At,
		strings.TrimSpace(entry.Stream),
		entry.Message,
	)
	return err
}

func scanEntry(rows *sql.Rows) (Entry, error) {
	var entry Entry
	var id int64
	if err := rows.Scan(&id, &entry.At, &entry.Stream, &entry.Message); err != nil {
		return Entry{}, err
	}
	entry.ID = strconv.FormatInt(id, 10)
	return entry, nil
}

func listEntries(db *sql.DB, limit int) ([]Entry, error) {
	if db == nil {
		return nil, errors.New("system log db is nil")
	}
	query := `SELECT id, at, stream, message FROM system_logs ORDER BY at DESC, id DESC`
	args := []any{}
	if limit > 0 {
		query += ` LIMIT ?`
		args = append(args, limit)
	}
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []Entry
	for rows.Next() {
		entry, err := scanEntry(rows)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func clearDB(db *sql.DB) error {
	if db == nil {
		return errors.New("system log db is nil")
	}
	if _, err := db.Exec(`DELETE FROM system_logs`); err != nil {
		return err
	}
	return nil
}
