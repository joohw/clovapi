package sharing

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testConnectionKey(origin string) string {
	return "clv_connect_" + base64.RawURLEncoding.EncodeToString([]byte(origin)) + "." + strings.Repeat("s", 22)
}

func TestDeviceIdentitySurvivesRegistrationRetries(t *testing.T) {
	dir := t.TempDir()
	first, err := deviceID(dir)
	if err != nil || !deviceIDPattern.MatchString(first) {
		t.Fatalf("device identity: %q %v", first, err)
	}
	second, err := deviceID(dir)
	if err != nil || first != second {
		t.Fatalf("identity changed: %q %q %v", first, second, err)
	}
	other, err := deviceID(t.TempDir())
	if err != nil || other == first {
		t.Fatal("different installations reused a device identity")
	}
}

func TestConnectionKeyValidatesEmbeddedPlatform(t *testing.T) {
	for _, origin := range []string{"https://clovapi.com", "https://self-hosted.example:4443", "http://localhost:3100", "http://127.0.0.1:1234", "http://[::1]:3100"} {
		for _, secretLength := range []int{22, 43} {
			key := "clv_connect_" + base64.RawURLEncoding.EncodeToString([]byte(origin)) + "." + strings.Repeat("s", secretLength)
			got, err := PlatformFromConnectionKey(key)
			if err != nil || got != origin {
				t.Errorf("secretLength=%d origin=%s got=%s err=%v", secretLength, origin, got, err)
			}
		}
	}
	for _, secretLength := range []int{0, 21, 23, 42, 44} {
		key := "clv_connect_" + base64.RawURLEncoding.EncodeToString([]byte("https://clovapi.com")) + "." + strings.Repeat("s", secretLength)
		if _, err := PlatformFromConnectionKey(key); err == nil {
			t.Errorf("accepted invalid secret length %d", secretLength)
		}
	}
	for _, origin := range []string{"http://public.example", "https://u:secret@example.com", "https://example.com/path", "https://example.com?key=secret", "https://example.com#fragment", "file:///private", "", "https://example.com\n"} {
		if _, err := PlatformFromConnectionKey(testConnectionKey(origin)); err == nil {
			t.Errorf("accepted invalid origin %q", origin)
		}
	}
	for _, key := range []string{"", "clv_node_secret", "clv_connect_!." + strings.Repeat("s", 43), "clv_connect_a." + strings.Repeat("s", 43), testConnectionKey("https://clovapi.com") + "x", testConnectionKey("https://clovapi.com") + "\nsecret", "clv_connect_aGVsbG8=." + strings.Repeat("s", 43)} {
		_, err := PlatformFromConnectionKey(key)
		if err == nil {
			t.Errorf("accepted invalid connection key")
		}
		if key != "" && err != nil && strings.Contains(err.Error(), key) {
			t.Fatal("key leaked through validation error")
		}
	}
}

func TestConnectRegistersMetadataAndPersistsOnlyNodeKeyAcrossReconnect(t *testing.T) {
	dir := fixture(t)
	if err := reserve(dir, "previous-job", time.Now()); err != nil {
		t.Fatal(err)
	}
	if err := SetPaused(dir, true); err != nil {
		t.Fatal(err)
	}
	var firstDevice string
	var connectionKey string
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.Method != http.MethodPost || r.URL.Path != "/api/node/register" || r.Header.Get("Authorization") != "Bearer "+connectionKey {
			t.Error("incorrect registration transport")
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		device, _ := body["deviceId"].(string)
		if len(body) != 3 || !deviceIDPattern.MatchString(device) || body["dailyLimit"] != float64(3) || body["name"] == "" {
			t.Errorf("registration metadata=%+v", body)
		}
		if firstDevice == "" {
			firstDevice = device
		} else if firstDevice != device {
			t.Error("reconnection changed device identity")
		}
		io.WriteString(w, `{"ok":true,"nodeId":"node-1","key":"private-node-credential","dailyLimit":3,"name":"machine"}`)
	}))
	defer server.Close()
	connectionKey = testConnectionKey(server.URL)
	var output bytes.Buffer
	for i := 0; i < 2; i++ {
		if err := Connect(context.Background(), dir, connectionKey, 3, &output); err != nil {
			t.Fatal(err)
		}
	}
	state, err := Read(dir)
	if err != nil || state.Key != "private-node-credential" || state.DeviceID != firstDevice || state.NodeID != "node-1" || state.DailyLimit != 3 || len(state.AttemptIDs) != 1 || !state.Paused || requests != 2 {
		t.Fatalf("reconnected state=%+v requests=%d err=%v", state, requests, err)
	}
	for _, filename := range []string{"node.json", "device.json"} {
		raw, err := os.ReadFile(filepath.Join(dir, filename))
		if err != nil {
			t.Fatal(err)
		}
		if bytes.Contains(raw, []byte(connectionKey)) {
			t.Fatal("account connection key persisted locally")
		}
	}
	if strings.Contains(output.String(), connectionKey) || strings.Contains(output.String(), "private-node-credential") {
		t.Fatal("credential leaked in connection output")
	}
}

func TestConnectRejectedKeyProvidesActionWithoutLeaking(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(401) }))
	defer server.Close()
	key := testConnectionKey(server.URL)
	err := Connect(context.Background(), t.TempDir(), key, 100, nil)
	if err == nil || !strings.Contains(err.Error(), "share start --key") || strings.Contains(err.Error(), key) {
		t.Fatalf("registration rejection=%v", err)
	}
}
