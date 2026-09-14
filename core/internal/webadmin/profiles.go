package webadmin

import (
	"context"
	"encoding/json"
	"github.com/clovapi/switcher/internal/desktop"
	"io"
	"net"
	"net/http"
	"strconv"
	"time"
)

func loadProfiles(r *http.Request) any {
	result := struct {
		desktop.LoadResult
		UsageCache json.RawMessage `json:"usageCache,omitempty"`
	}{LoadResult: desktop.LoadProfiles()}
	if !result.OK {
		return result
	}
	host := result.Proxy.Host
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", "http://"+net.JoinHostPort(host, strconv.Itoa(result.Proxy.Port))+"/usage", nil)
	if err != nil {
		return result
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return result
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return result
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err == nil && json.Valid(body) {
		result.UsageCache = body
	}
	return result
}
