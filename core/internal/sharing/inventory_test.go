package sharing

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
)

func TestInventoryRoutesModelsToTheirOwnUpstreamAndRetainsAliases(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	t.Cleanup(func() { config.SetDirOverride("") })
	upstream := func(wantKey, wantModel string) *httptest.Server {
		return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer "+wantKey {
				t.Errorf("wrong transport: %s %s", r.URL.Path, r.Header.Get("Authorization"))
			}
			var body struct {
				Model string `json:"model"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Model != wantModel {
				t.Errorf("wrong upstream model: %q %v", body.Model, err)
			}
			w.Header().Set("Content-Type", "application/json")
			io.WriteString(w, `{"id":"one","object":"chat.completion","choices":[{"index":0,"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}]}`)
		}))
	}
	one, two := upstream("key-one", "upstream-one"), upstream("key-two", "upstream-two")
	defer one.Close()
	defer two.Close()
	store := &profile.Store{Version: profile.StoreVersion, List: []profile.Profile{
		{Name: "first-private-provider", APIStyle: apistyle.OpenAIChat, BaseURL: one.URL + "/v1", APIKey: "key-one", Models: []profile.Model{{ID: "friendly-alias", Model: "upstream-one", APIStyle: apistyle.OpenAIChat}}},
		{Name: "second-private-provider", APIStyle: apistyle.OpenAIChat, BaseURL: "http://127.0.0.1:1", APIKey: "unused", Models: []profile.Model{{ID: "default", Model: "upstream-two", APIStyle: apistyle.OpenAIChat, BaseURL: two.URL + "/v1", APIKey: "key-two"}}},
		{Name: "duplicate-last", APIStyle: apistyle.OpenAIChat, BaseURL: "http://127.0.0.1:1", APIKey: "must-not-run", Models: []profile.Model{{ID: "friendly-alias", Model: "wrong", APIStyle: apistyle.OpenAIChat}}},
		{Name: "missing-key", APIStyle: apistyle.OpenAIChat, BaseURL: one.URL, Model: "no-credential"},
		{Name: "bad-url", APIStyle: apistyle.OpenAIChat, BaseURL: "file:///private", APIKey: "secret", Model: "invalid-url"},
		{Name: "bad-id", APIStyle: apistyle.OpenAIChat, BaseURL: one.URL, APIKey: "secret", Model: "invalid model"},
	}}
	if err := profile.Save(store); err != nil {
		t.Fatal(err)
	}
	inventory, err := Discover()
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(inventory.Models, []string{"friendly-alias", "upstream-two"}) {
		t.Fatalf("inventory = %v", inventory.Models)
	}
	raw, _ := json.Marshal(inventory)
	for _, private := range []string{"key-one", "key-two", "first-private-provider", one.URL, "upstream-one"} {
		if bytes.Contains(raw, []byte(private)) {
			t.Fatalf("private route serialized: %s", raw)
		}
	}
	for _, model := range inventory.Models {
		job := Job{Path: "/v1/chat/completions", Body: json.RawMessage(`{"model":"` + model + `","messages":[{"role":"user","content":"hello"}]}`)}
		state, err := inventory.forJob(testState(), job)
		if err != nil {
			t.Fatal(err)
		}
		recorder := httptest.NewRecorder()
		if err = Execute(context.Background(), state, job, recorder); err != nil {
			t.Fatal(err)
		}
		if recorder.Code != 200 {
			t.Fatalf("response: %d %s", recorder.Code, recorder.Body)
		}
	}
	if _, err := inventory.forJob(testState(), Job{Body: json.RawMessage(`{"model":"not-advertised"}`)}); err == nil {
		t.Fatal("accepted unconfigured model")
	}
}

func TestInventoryIncludesLocalWithoutKeyAndSkipsDisabledBackend(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	t.Cleanup(func() { config.SetDirOverride("") })
	disabled := false
	store := &profile.Store{Version: profile.StoreVersion, List: []profile.Profile{{
		Name: profile.OllamaProfileName, Kind: "local", APIStyle: apistyle.OpenAIChat, BaseURL: "http://127.0.0.1:11434/v1", Models: []profile.Model{{ID: "local-one", Model: "llama"}, {ID: "disabled", Model: "other"}},
	}}, RouteBackends: []profile.RouteBackend{{ID: profile.DerivedRouteBackendID("local", profile.OllamaProfileName, "ollama", "disabled"), Enabled: &disabled}}}
	if err := profile.Save(store); err != nil {
		t.Fatal(err)
	}
	got, err := Discover()
	if err != nil || !slices.Equal(got.Models, []string{"local-one"}) {
		t.Fatalf("inventory=%+v err=%v", got, err)
	}
}

func TestInventoryUsesEachSubscriptionAccountCredentialAndSkipsMissing(t *testing.T) {
	dir := t.TempDir()
	config.SetDirOverride(dir)
	t.Cleanup(func() { config.SetDirOverride("") })
	for _, name := range []string{"one", "two"} {
		body := `{"auth_mode":"chatgpt","tokens":{"access_token":"token-` + name + `","account_id":"account-` + name + `"}}`
		if err := os.WriteFile(filepath.Join(dir, name+".json"), []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	store := &profile.Store{Version: profile.StoreVersion}
	for _, name := range []string{"one", "two", "missing"} {
		store.Subscriptions = append(store.Subscriptions, profile.SubscriptionAccount{ID: name, ProviderID: "codex", Label: "private-" + name, CredentialRef: name + ".json", Models: []profile.Model{{ID: "alias-" + name, Model: "gpt-test", APIStyle: apistyle.OpenAIResponses}}})
	}
	if err := profile.Save(store); err != nil {
		t.Fatal(err)
	}
	inventory, err := Discover()
	if err != nil || !slices.Equal(inventory.Models, []string{"alias-one", "alias-two"}) {
		t.Fatalf("subscription models=%+v err=%v", inventory, err)
	}
	for _, name := range []string{"one", "two"} {
		route := inventory.routes["alias-"+name]
		flat, ok := route.store.FlatProfileForProviderModel(route.providerID, "alias-"+name)
		if !ok || flat.APIKey != "token-"+name || flat.AccountID != "account-"+name || flat.Model != "gpt-test" {
			t.Fatalf("wrong account isolated for %s", name)
		}
	}
}

func TestWorkerRevokedKeyStopsWithReconnectInstruction(t *testing.T) {
	saveUpstream(t, "http://127.0.0.1:1")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(401) }))
	defer server.Close()
	err := (&Worker{Dir: fixture(t), Client: NewClient(server.URL, "revoked-secret")}).Run(context.Background())
	if err == nil || !strings.Contains(err.Error(), "share start --key") || strings.Contains(err.Error(), "revoked-secret") {
		t.Fatalf("revocation error: %v", err)
	}
}

func TestDiscoveryWaitsForProfileWriterAndReadsCommittedInventory(t *testing.T) {
	saveUpstream(t, "http://127.0.0.1:1")
	writerEntered := make(chan struct{})
	releaseWriter := make(chan struct{})
	writerDone := make(chan error, 1)
	go func() {
		_, err := profile.WithLockedStore(func(store *profile.Store) (bool, error) {
			close(writerEntered)
			<-releaseWriter
			store.List = []profile.Profile{{Name: "replacement", Model: "committed-model", APIStyle: apistyle.OpenAIChat, BaseURL: "http://127.0.0.1:1", APIKey: "private"}}
			return true, nil
		})
		writerDone <- err
	}()
	<-writerEntered
	type result struct {
		inventory *Inventory
		err       error
	}
	discovered := make(chan result, 1)
	go func() { inventory, err := Discover(); discovered <- result{inventory, err} }()
	select {
	case <-discovered:
		close(releaseWriter)
		<-writerDone
		t.Fatal("discovery opened profiles while its writer held the transaction lock")
	case <-time.After(30 * time.Millisecond):
	}
	close(releaseWriter)
	if err := <-writerDone; err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-discovered:
		if got.err != nil || !slices.Equal(got.inventory.Models, []string{"committed-model"}) {
			t.Fatalf("discovery did not read committed profile: %+v %v", got.inventory, got.err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("discovery did not resume after profile commit")
	}
}
