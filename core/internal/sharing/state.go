package sharing

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/relaywire"
)

// State keeps the node credential separate from upstream profiles. Attempts are
// reserved before execution and survive both failure and process restart.
type State struct {
	Platform string   `json:"platform"`
	Key      string   `json:"key"`
	NodeID   string   `json:"nodeId"`
	DeviceID string   `json:"deviceId,omitempty"`
	Name     string   `json:"name,omitempty"`
	Models   []string `json:"models,omitempty"`
	// Profile and Model are read for compatibility with old node bindings.
	// Workers always discover the current local inventory instead.
	Profile    string   `json:"profile,omitempty"`
	Model      string   `json:"model,omitempty"`
	DailyLimit int      `json:"dailyLimit"`
	Paused     bool     `json:"paused"`
	Day        string   `json:"day"`
	AttemptIDs []string `json:"attemptIds"`
	route      *localRoute
}

type Status struct {
	Platform    string   `json:"platform"`
	NodeID      string   `json:"nodeId"`
	Name        string   `json:"name,omitempty"`
	Models      []string `json:"models"`
	DailyLimit  int      `json:"dailyLimit"`
	Used        int      `json:"used"`
	Day         string   `json:"day"`
	Paused      bool     `json:"paused"`
	Concurrency int      `json:"concurrency"`
	Key         string   `json:"key"`
}

func StateDir() (string, error) {
	dir, err := config.Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "sharing"), nil
}

func NormalizePlatform(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return "", errors.New("platform must be an origin URL without credentials, path, query, or fragment")
	}
	ip := net.ParseIP(u.Hostname())
	loopback := strings.EqualFold(u.Hostname(), "localhost") || (ip != nil && ip.IsLoopback())
	if u.Scheme != "https" && !(u.Scheme == "http" && loopback) {
		return "", errors.New("platform requires HTTPS (HTTP is allowed only for loopback development)")
	}
	return strings.TrimRight(u.String(), "/"), nil
}

func (s State) validate() error {
	if _, err := NormalizePlatform(s.Platform); err != nil {
		return err
	}
	if strings.TrimSpace(s.Key) == "" || strings.ContainsAny(s.Key, "\r\n") {
		return errors.New("node key is required")
	}
	if s.DailyLimit < 1 || s.DailyLimit > 100000 {
		return errors.New("daily limit must be between 1 and 100000 requests")
	}
	return nil
}

func prepareDir(dir string) error {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	return restrictPath(dir, true)
}

func load(dir string) (State, error) {
	var s State
	data, err := os.ReadFile(filepath.Join(dir, "node.json"))
	if err != nil {
		return s, err
	}
	if err = json.Unmarshal(data, &s); err != nil {
		return s, errors.New("invalid local sharing state")
	}
	return s, s.validate()
}

func write(dir string, s State) error {
	if err := s.validate(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, ".node-*")
	if err != nil {
		return err
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	if err = restrictPath(tmp, false); err == nil {
		_, err = f.Write(append(data, '\n'))
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(dir, "node.json"))
}

func transaction(dir string, fn func(*State) error) error {
	if err := prepareDir(dir); err != nil {
		return err
	}
	unlock, err := acquireLock(filepath.Join(dir, "state.lock"), true)
	if err != nil {
		return err
	}
	defer unlock()
	s, err := load(dir)
	if err != nil {
		return err
	}
	if err = fn(&s); err != nil {
		return err
	}
	return write(dir, s)
}

func Read(dir string) (State, error) {
	unlock, err := acquireLock(filepath.Join(dir, "state.lock"), true)
	if err != nil {
		return State{}, err
	}
	defer unlock()
	return load(dir)
}

func SaveBinding(dir string, s State) error {
	if err := prepareDir(dir); err != nil {
		return err
	}
	// Binding cannot change underneath a running worker.
	runUnlock, err := acquireLock(filepath.Join(dir, "run.lock"), false)
	if err != nil {
		return errors.New("stop the running share worker before rebinding")
	}
	defer runUnlock()
	return saveBindingLocked(dir, s)
}

func saveBindingLocked(dir string, s State) error {
	unlock, err := acquireLock(filepath.Join(dir, "state.lock"), true)
	if err != nil {
		return err
	}
	defer unlock()
	if old, readErr := load(dir); readErr == nil {
		// Rebinding does not reset the local allowance, even if a key rotates.
		s.Day = old.Day
		s.AttemptIDs = old.AttemptIDs
		s.Paused = old.Paused
		if s.DeviceID == "" {
			s.DeviceID = old.DeviceID
		}
	} else if !errors.Is(readErr, os.ErrNotExist) {
		return readErr
	}
	return write(dir, s)
}

func SetPaused(dir string, paused bool) error {
	return transaction(dir, func(s *State) error { s.Paused = paused; return nil })
}

func SetDailyLimit(dir string, limit int) error {
	return transaction(dir, func(s *State) error { s.DailyLimit = limit; return nil })
}

func saveModels(dir string, models []string) error {
	return transaction(dir, func(s *State) error {
		s.Models = append([]string{}, models...)
		// Migrate legacy one-model bindings when their inventory is synced.
		s.Profile, s.Model = "", ""
		return nil
	})
}

func Snapshot(dir string, now time.Time) (Status, error) {
	s, err := Read(dir)
	if err != nil {
		return Status{}, err
	}
	used := len(s.AttemptIDs)
	day := now.UTC().Format("2006-01-02")
	if s.Day != day {
		used = 0
	}
	return Status{Platform: s.Platform, NodeID: s.NodeID, Name: s.Name, Models: append([]string{}, s.Models...), DailyLimit: s.DailyLimit, Used: used, Day: day, Paused: s.Paused, Concurrency: relaywire.MaxConcurrency, Key: "[stored locally; redacted]"}, nil
}

func reserve(dir, id string, now time.Time) error {
	return transaction(dir, func(s *State) error {
		if s.Paused {
			return errors.New("sharing is paused locally")
		}
		day := now.UTC().Format("2006-01-02")
		if s.Day != day {
			s.Day = day
			s.AttemptIDs = nil
		}
		for _, attempt := range s.AttemptIDs {
			if attempt == id {
				return errors.New("task was already attempted locally")
			}
		}
		if len(s.AttemptIDs) >= s.DailyLimit {
			return fmt.Errorf("local daily request limit reached")
		}
		s.AttemptIDs = append(s.AttemptIDs, id)
		return nil
	})
}
