package proxy

import (
	"database/sql"
	"errors"

	cfgpkg "github.com/clovapi/switcher/internal/config"
)

const callLogJSONLImportMetaKey = "jsonl_import_v1"

func importJSONLIfNeeded(db *sql.DB, logsDir string) error {
	if db == nil {
		return errors.New("call log db is nil")
	}
	var value string
	err := db.QueryRow(`SELECT value FROM call_log_meta WHERE key = ?`, callLogJSONLImportMetaKey).Scan(&value)
	if err == nil && value == "1" {
		return nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	paths, err := discoverCallLogFiles(logsDir)
	if err != nil {
		return err
	}
	for _, path := range paths {
		entries, err := readCallLogEntries(path, 0)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if err := insertCallLogEntry(db, entry); err != nil {
				return err
			}
		}
	}

	_, err = db.Exec(
		`INSERT INTO call_log_meta(key, value) VALUES(?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		callLogJSONLImportMetaKey,
		"1",
	)
	return err
}

func importJSONLForConfiguredStore(db *sql.DB) error {
	logsDir, err := cfgpkg.CallLogsDir()
	if err != nil {
		return err
	}
	return importJSONLIfNeeded(db, logsDir)
}
