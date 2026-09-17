package proxy

import (
	"bufio"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/config"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

func TestDeclaredSSEForwardsShortFirstEventBeforeUpstreamCompletes(t *testing.T) {
	config.SetDirOverride(t.TempDir())
	defer config.SetDirOverride("")
	release := make(chan struct{})
	var releaseOnce sync.Once
	releaseUpstream := func() { releaseOnce.Do(func() { close(release) }) }
	defer releaseUpstream()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"id\":\"x\",\"model\":\"small-model\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hello\"}}]}\n\n")
		w.(http.Flusher).Flush()
		select {
		case <-release:
		case <-r.Context().Done():
		}
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer upstream.Close()
	s := newTestServer(profile.ProxyConfig{Host: "127.0.0.1"})
	defer s.HTTPClient.CloseIdleConnections()
	s.ProfileLoader = func() (*profile.Store, error) {
		return &profile.Store{Version: profile.StoreVersion, List: []profile.Profile{{
			Name: profile.CustomAPIProfileName, Kind: "api", APIStyle: apistyle.OpenAIChat, BaseURL: upstream.URL, APIKey: "test-only",
			Models: []profile.Model{{ID: "small-model", Model: "small-model", APIStyle: apistyle.OpenAIChat}},
		}}}, nil
	}
	proxyServer := httptest.NewServer(s.Server.Handler)
	defer proxyServer.Close()
	firstEvent := make(chan error, 1)
	go func() {
		resp, err := http.Post(proxyServer.URL+"/"+provider.CustomAPIProviderID+"/v1/chat/completions", "application/json", strings.NewReader(`{"model":"small-model","messages":[{"role":"user","content":"test"}],"stream":true}`))
		if err != nil {
			firstEvent <- err
			return
		}
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			if strings.Contains(scanner.Text(), "hello") {
				firstEvent <- nil
				return
			}
		}
		firstEvent <- fmt.Errorf("missing first event: status %d, error %v", resp.StatusCode, scanner.Err())
	}()
	select {
	case err := <-firstEvent:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		releaseUpstream()
		t.Fatal("short SSE frame was buffered until upstream completion")
	}
	releaseUpstream()
}
