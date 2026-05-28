package proxy

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	cfgpkg "github.com/clovapi/switcher/internal/config"
)

const defaultCallLogUIListMax = 200

// CallLogsDirPath returns the on-disk log directory (~/.config/clovapi/logs).
func CallLogsDirPath() (string, error) {
	return cfgpkg.CallLogsDir()
}

// CallLogsFilePath returns the default JSONL path for requests without a session id.
func CallLogsFilePath() (string, error) {
	return cfgpkg.CallLogsPath()
}

func ensureCallLogsDir(path string) error {
	dir := filepath.Dir(path)
	return os.MkdirAll(dir, 0o700)
}

func appendCallLogEntry(path string, entry CallLogEntry) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("call log path is empty")
	}
	if err := ensureCallLogsDir(path); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetEscapeHTML(false)
	return enc.Encode(entry)
}

func readCallLogEntries(path string, limit int) ([]CallLogEntry, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("call log path is empty")
	}
	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()

	var entries []CallLogEntry
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64*1024), 64*1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var entry CallLogEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			continue
		}
		entries = append(entries, entry)
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	if limit > 0 && len(entries) > limit {
		entries = entries[len(entries)-limit:]
	}
	return entries, nil
}

func sortCallLogEntriesNewestFirst(entries []CallLogEntry) {
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].StartedAt == entries[j].StartedAt {
			return entries[i].ID > entries[j].ID
		}
		return entries[i].StartedAt > entries[j].StartedAt
	})
}

func discoverCallLogFiles(logsDir string) ([]string, error) {
	var paths []string
	seen := map[string]struct{}{}
	add := func(p string) {
		p = strings.TrimSpace(p)
		if p == "" {
			return
		}
		if _, ok := seen[p]; ok {
			return
		}
		if st, err := os.Stat(p); err != nil || st.IsDir() {
			return
		}
		seen[p] = struct{}{}
		paths = append(paths, p)
	}

	if logsDir != "" {
		add(filepath.Join(logsDir, "default.jsonl"))
		claudeDir := filepath.Join(logsDir, "claude")
		_ = filepath.WalkDir(claudeDir, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				if errors.Is(err, fs.ErrNotExist) {
					return nil
				}
				return err
			}
			if d.IsDir() {
				return nil
			}
			if strings.HasSuffix(strings.ToLower(d.Name()), ".jsonl") {
				add(path)
			}
			return nil
		})
	}

	sort.Strings(paths)
	return paths, nil
}

func readAllCallLogEntries(logsDir string, limit int) ([]CallLogEntry, error) {
	paths, err := discoverCallLogFiles(logsDir)
	if err != nil {
		return nil, err
	}
	var all []CallLogEntry
	for _, path := range paths {
		entries, err := readCallLogEntries(path, 0)
		if err != nil {
			return nil, err
		}
		all = append(all, entries...)
	}
	sortCallLogEntriesNewestFirst(all)
	if limit > 0 && len(all) > limit {
		all = all[:limit]
	}
	return all, nil
}

func clearCallLogFile(path string) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("call log path is empty")
	}
	if err := ensureCallLogsDir(path); err != nil {
		return err
	}
	return os.WriteFile(path, nil, 0o600)
}

func clearCallLogDir(logsDir string) error {
	if strings.TrimSpace(logsDir) == "" {
		return errors.New("call log dir is empty")
	}
	if err := os.MkdirAll(logsDir, 0o700); err != nil {
		return err
	}
	paths, err := discoverCallLogFiles(logsDir)
	if err != nil {
		return err
	}
	for _, path := range paths {
		if err := clearCallLogFile(path); err != nil {
			return err
		}
	}
	return nil
}

func findCallLogEntry(logsDir, id string) (CallLogEntry, error) {
	_ = logsDir
	return FindCallLogEntry(id)
}

func exportCallLogDir(logsDir string, w io.Writer) (int, error) {
	_ = logsDir
	return ExportCallLogs(w)
}

func exportCallLogFile(path string, w io.Writer) (int, error) {
	if strings.TrimSpace(path) == "" {
		return 0, errors.New("call log path is empty")
	}
	src, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, nil
		}
		return 0, err
	}
	defer src.Close()
	n, err := io.Copy(w, src)
	return int(n), err
}

func ExportCallLogFile(path string, w io.Writer) (int, error) {
	return exportCallLogFile(path, w)
}

func ExportCallLogDir(logsDir string, w io.Writer) (int, error) {
	_ = logsDir
	return ExportCallLogs(w)
}
