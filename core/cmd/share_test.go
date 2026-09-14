package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/relaywire"
	"github.com/clovapi/switcher/internal/sharing"
	"github.com/gorilla/websocket"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestShareBindUsesEnvironmentKeyWithoutLoginOrUploadingUpstreamCredential(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	defer config.SetDirOverride("")
	t.Setenv("CLOVAPI_NODE_KEY", "direct-node-secret")
	err := profile.Save(&profile.Store{Version: profile.StoreVersion, List: []profile.Profile{{
		Name: "my-saved-profile", Model: "model-one", APIStyle: apistyle.OpenAIChat, BaseURL: "http://127.0.0.1:1/v1", APIKey: "private-upstream-secret",
	}}})
	if err != nil {
		t.Fatal(err)
	}
	requests := 0
	platform := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.Path != "/api/node/bind" || r.Method != http.MethodPost {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer direct-node-secret" {
			t.Error("environment key was not used")
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if len(body) != 1 || body["model"] != "model-one" {
			t.Errorf("unexpected binding payload: %+v", body)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "nodeId": "node-one", "model": "model-one", "dailyLimit": 10})
	}))
	defer platform.Close()
	var out bytes.Buffer
	cmd := newRoot()
	cmd.SetOut(&out)
	cmd.SetArgs([]string{"share", "bind", "--platform", platform.URL, "--profile", "my-saved-profile", "--model", "model-one", "--daily-limit", "3"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if requests != 1 {
		t.Fatalf("expected only key binding request, got %d", requests)
	}
	if strings.Contains(out.String(), "direct-node-secret") || strings.Contains(out.String(), "private-upstream-secret") {
		t.Fatal("binding printed a credential")
	}
	dir, _ := sharing.StateDir()
	state, err := sharing.Read(dir)
	if err != nil || state.NodeID != "node-one" || state.DailyLimit != 3 {
		t.Fatalf("binding not saved: %+v, %v", state, err)
	}
}

func TestShareSubcommandsNeverStartPublicProxy(t *testing.T) {
	for _, name := range []string{"bind", "start", "status", "pause", "resume"} {
		root := newRoot()
		cmd, _, err := root.Find([]string{"share", name})
		if err != nil {
			t.Fatal(err)
		}
		if cmd.Name() != name || !shouldSkipAutoProxy(cmd) {
			t.Fatalf("share %s could start automatic proxy", name)
		}
	}
}

func TestShareStartConnectsWithKeyAndDiscoversWithoutProfileOrPlatformFlags(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	defer config.SetDirOverride("")
	if err := profile.Save(&profile.Store{Version: profile.StoreVersion, List: []profile.Profile{{Name: "private-profile", Model: "configured-model", APIStyle: apistyle.OpenAIChat, BaseURL: "https://private.example/v1", APIKey: "private-upstream-key"}}}); err != nil {
		t.Fatal(err)
	}
	var deviceID string
	var synced bool
	var connectionKey string
	var cancel context.CancelFunc
	registrations := 0
	var platform *httptest.Server
	platform = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/node/register":
			registrations++
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			if len(body) != 3 || body["dailyLimit"] != float64(7) || r.Header.Get("Authorization") != "Bearer "+connectionKey {
				t.Errorf("connect metadata: %+v", body)
			}
			newDeviceID, _ := body["deviceId"].(string)
			if deviceID != "" && newDeviceID != deviceID {
				t.Error("reconnection changed device identity")
			}
			deviceID = newDeviceID
			io.WriteString(w, `{"ok":true,"nodeId":"automatic-node","name":"local-machine","key":"private-node-key","dailyLimit":7}`)
		case "/api/node/connect":
			if r.Header.Get("Authorization") != "Bearer private-node-key" {
				t.Error("incorrect node connection credential")
			}
			conn, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
			if err != nil {
				t.Error(err)
				return
			}
			defer conn.Close()
			_ = conn.WriteJSON(relaywire.Message{Type: "welcome", Protocol: relaywire.Protocol, NodeID: "automatic-node", Concurrency: relaywire.MaxConcurrency})
			var hello relaywire.Message
			if err := conn.ReadJSON(&hello); err != nil {
				t.Error(err)
				return
			}
			if hello.Type != "hello" || len(hello.Models) != 1 || hello.Models[0] != "configured-model" || hello.Concurrency != 5 || hello.Remaining != 7 {
				t.Errorf("node hello=%+v", hello)
			}
			synced = true
			cancel()
		default:
			t.Errorf("unexpected endpoint %s", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer platform.Close()
	connectionKey = "clv_connect_" + base64.RawURLEncoding.EncodeToString([]byte(platform.URL)) + "." + strings.Repeat("s", 43)
	var out bytes.Buffer
	for index, args := range [][]string{
		{"share", "start", "--key", connectionKey, "--daily-limit", "7"},
		{"share", "start"},
		{"share", "start", "--key", connectionKey},
	} {
		ctx, cancelRun := context.WithTimeout(context.Background(), 5*time.Second)
		cancel = cancelRun
		cmd := newRoot()
		cmd.SetContext(ctx)
		cmd.SetOut(&out)
		cmd.SetArgs(args)
		err := cmd.Execute()
		cancelRun()
		if err != nil {
			t.Fatal(err)
		}
		want := 1
		if index == 2 {
			want = 2
		}
		if registrations != want {
			t.Fatalf("run%d registrations=%d", index, registrations)
		}
	}
	if !synced || deviceID == "" {
		t.Fatal("start did not authorize and discover automatically")
	}
	for _, secret := range []string{connectionKey, "private-node-key", "private-upstream-key", "private.example", "private-profile"} {
		if strings.Contains(out.String(), secret) {
			t.Fatalf("CLI leaked %q", secret)
		}
	}
	dir, _ := sharing.StateDir()
	state, err := sharing.Read(dir)
	if err != nil || state.NodeID != "automatic-node" || state.DeviceID != deviceID || len(state.Models) != 1 || state.DailyLimit != 7 {
		t.Fatalf("automatic state=%+v err=%v", state, err)
	}
}

func TestShareStartUnconnectedRequiresConsoleKey(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	defer config.SetDirOverride("")
	cmd := newRoot()
	cmd.SetOut(io.Discard)
	cmd.SetErr(io.Discard)
	cmd.SetArgs([]string{"share", "start"})
	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "share start --key") {
		t.Fatalf("missing key result=%v", err)
	}
	start, _, err := newRoot().Find([]string{"share", "start"})
	if err != nil || start.Flags().Lookup("platform") != nil || start.Flags().Lookup("profile") != nil || start.Flags().Lookup("model") != nil {
		t.Fatal("start still asks for platform or model selection")
	}
	for _, command := range cmdShare().Commands() {
		if command.Name() == "login" {
			t.Fatal("obsolete browser authorization command retained")
		}
	}
}

func TestShareStatusRedactsCredential(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	defer config.SetDirOverride("")
	dir, err := sharing.StateDir()
	if err != nil {
		t.Fatal(err)
	}
	if err = sharing.SaveBinding(dir, sharing.State{Platform: "https://example.com", Key: "secret-never-in-output", Profile: "saved-api", Model: "model", NodeID: "node-1", DailyLimit: 5}); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	cmd := newRoot()
	cmd.SetOut(&out)
	cmd.SetArgs([]string{"share", "status", "--json"})
	if err = cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out.String(), "secret-never-in-output") || !strings.Contains(out.String(), "redacted") {
		t.Fatalf("unexpected status: %s", out.String())
	}
}
