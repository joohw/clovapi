package proxy

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestUpstreamHTTPClientIgnoresProxyEnv(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	prevHTTP := os.Getenv("HTTP_PROXY")
	prevHTTPS := os.Getenv("HTTPS_PROXY")
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:1")
	t.Setenv("HTTPS_PROXY", "http://127.0.0.1:1")
	t.Cleanup(func() {
		_ = os.Setenv("HTTP_PROXY", prevHTTP)
		_ = os.Setenv("HTTPS_PROXY", prevHTTPS)
	})

	req, err := http.NewRequest(http.MethodGet, srv.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := defaultUpstreamHTTPClient().Do(req)
	if err != nil {
		t.Fatalf("defaultUpstreamHTTPClient.Do with dead proxy env: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
}
