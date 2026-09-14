package sharing

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type ConnectionResult struct {
	NodeID     string `json:"nodeId"`
	Key        string `json:"key"`
	Name       string `json:"name"`
	DailyLimit int    `json:"dailyLimit"`
}

var deviceIDPattern = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)
var connectionKeyPattern = regexp.MustCompile(`^clv_connect_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})$`)

// deviceID is independent from an authorization attempt and its resulting key.
// The platform can therefore reconnect this installation to its existing node.
func deviceID(dir string) (string, error) {
	if err := prepareDir(dir); err != nil {
		return "", err
	}
	unlock, err := acquireLock(filepath.Join(dir, "state.lock"), true)
	if err != nil {
		return "", err
	}
	defer unlock()
	path := filepath.Join(dir, "device.json")
	var device struct {
		ID string `json:"deviceId"`
	}
	raw, err := os.ReadFile(path)
	if err == nil {
		if json.Unmarshal(raw, &device) != nil || !deviceIDPattern.MatchString(device.ID) {
			return "", errors.New("invalid local sharing device identity")
		}
		return device.ID, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	var id [16]byte
	if _, err := rand.Read(id[:]); err != nil {
		return "", err
	}
	id[6] = (id[6] & 0x0f) | 0x40
	id[8] = (id[8] & 0x3f) | 0x80
	device.ID = fmt.Sprintf("%x-%x-%x-%x-%x", id[0:4], id[4:6], id[6:8], id[8:10], id[10:16])
	raw, err = json.Marshal(device)
	if err != nil {
		return "", err
	}
	if err = os.WriteFile(path, append(raw, '\n'), 0600); err != nil {
		return "", err
	}
	if err = restrictPath(path, false); err != nil {
		return "", err
	}
	return device.ID, nil
}

// PlatformFromConnectionKey reads the account key's embedded origin, so the
// console command works with both hosted and local platforms without a URL flag.
func PlatformFromConnectionKey(key string) (string, error) {
	if len(key) > 4096 {
		return "", errors.New("invalid connection key")
	}
	parts := connectionKeyPattern.FindStringSubmatch(strings.TrimSpace(key))
	if parts == nil {
		return "", errors.New("invalid connection key; copy the clovapi share start --key command from the console")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || base64.RawURLEncoding.EncodeToString(raw) != parts[1] {
		return "", errors.New("invalid connection key platform")
	}
	platform, err := NormalizePlatform(string(raw))
	if err != nil || platform != string(raw) {
		return "", errors.New("connection key requires an HTTPS platform origin (loopback HTTP is allowed)")
	}
	return platform, nil
}

// Connect registers this installation directly using the account connection
// key. Only the returned node credential is saved; the account key is not.
func Connect(ctx context.Context, dir, connectionKey string, dailyLimit int, out io.Writer) error {
	connectionKey = strings.TrimSpace(connectionKey)
	platform, err := PlatformFromConnectionKey(connectionKey)
	if err != nil {
		return err
	}
	if dailyLimit < 1 || dailyLimit > 100000 {
		return errors.New("daily-limit must be between 1 and 100000 requests")
	}
	if err = prepareDir(dir); err != nil {
		return err
	}
	unlock, err := acquireLock(filepath.Join(dir, "run.lock"), false)
	if err != nil {
		return errors.New("stop the running share worker before connecting an account")
	}
	defer unlock()
	device, err := deviceID(dir)
	if err != nil {
		return err
	}
	name, err := os.Hostname()
	if err != nil || strings.TrimSpace(name) == "" {
		name = "clovapi CLI"
	}
	if len(name) > 80 {
		name = "clovapi CLI"
	}
	client := NewClient(platform, connectionKey)
	var result ConnectionResult
	err = client.post(ctx, "/api/node/register", map[string]any{"deviceId": device, "name": name, "dailyLimit": dailyLimit}, &result)
	if err != nil {
		if permanent(err) {
			return errors.New("connection key is invalid or revoked; copy a new clovapi share start --key command from the console")
		}
		return err
	}
	if result.NodeID == "" || strings.TrimSpace(result.Key) == "" || strings.HasPrefix(result.Key, "clv_connect_") || strings.ContainsAny(result.Key, "\r\n") || result.DailyLimit < 1 || result.DailyLimit > 100000 {
		return errors.New("invalid platform registration response")
	}
	if err = saveBindingLocked(dir, State{Platform: platform, Key: result.Key, NodeID: result.NodeID, DeviceID: device, Name: result.Name, DailyLimit: dailyLimit}); err != nil {
		return err
	}
	if out != nil {
		fmt.Fprintf(out, "Account connected. Local ceiling: %d requests per UTC day; platform ceiling: %d.\n", dailyLimit, result.DailyLimit)
	}
	return nil
}
