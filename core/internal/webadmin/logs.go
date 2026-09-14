package webadmin

import (
	"encoding/json"
	"fmt"
	"github.com/clovapi/switcher/internal/proxy"
	"github.com/clovapi/switcher/internal/syslog"
)

func logs(body []byte, clear bool) (any, error) {
	var p struct {
		Scope        string `json:"scope"`
		Limit        int    `json:"limit"`
		Offset       int    `json:"offset"`
		APIKey       string `json:"apiKey"`
		Unidentified bool   `json:"apiKeyUnidentified"`
	}
	if err := json.Unmarshal(body, &p); err != nil {
		return nil, err
	}
	if p.Scope == "" {
		p.Scope = "all"
	}
	if p.Scope != "all" && p.Scope != "calls" && p.Scope != "system" {
		return nil, fmt.Errorf("invalid log scope")
	}
	if p.Limit <= 0 {
		p.Limit = 20
	}
	if p.Limit > 200 {
		p.Limit = 200
	}
	if p.Offset < 0 {
		p.Offset = 0
	}
	requests := []proxy.CallLogEntry{}
	aggregates := []proxy.CallLogAPIKeyAggregate{}
	system := []syslog.Entry{}
	hasMore := false
	if p.Scope != "system" {
		store := proxy.NewCallLogStore()
		defer store.Close()
		if clear {
			store.Clear()
		}
		requests = store.ListRecentPageFiltered(p.Limit+1, p.Offset, proxy.CallLogFilter{APIKey: p.APIKey, APIKeyUnidentified: p.Unidentified})
		hasMore = len(requests) > p.Limit
		if hasMore {
			requests = requests[:p.Limit]
		}
		aggregates = store.APIKeyAggregates()
	}
	if p.Scope != "calls" {
		if clear {
			if err := syslog.Clear(); err != nil {
				return nil, err
			}
		}
		var err error
		system, err = syslog.List(p.Limit)
		if err != nil {
			return nil, err
		}
	}
	if requests == nil {
		requests = []proxy.CallLogEntry{}
	}
	if aggregates == nil {
		aggregates = []proxy.CallLogAPIKeyAggregate{}
	}
	if system == nil {
		system = []syslog.Entry{}
	}
	return map[string]any{"ok": true, "requests": requests, "system": system, "apiKeyAggregates": aggregates,
		"callLogPage": map[string]any{"limit": p.Limit, "offset": p.Offset, "hasMore": hasMore}}, nil
}
