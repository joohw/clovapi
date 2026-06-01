package usage

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	SubscriptionClaudeCode = "claude-code"
	SubscriptionCodex      = "codex"

	tierSevenDay       = "seven_day"
	tierSevenDayOpus   = "seven_day_opus"
	tierSevenDaySonnet = "seven_day_sonnet"
)

type claudeUsageWindow struct {
	Utilization *float64 `json:"utilization"`
	ResetsAt    string   `json:"resets_at"`
}

func queryClaudeSubscriptionUsage(accessToken string) Result {
	body, status, err := httpGetJSON("https://api.anthropic.com/api/oauth/usage", map[string]string{
		"Authorization":  "Bearer " + strings.TrimSpace(accessToken),
		"anthropic-beta": "oauth-2025-04-20",
		"Accept":         "application/json",
	})
	if err != nil {
		return Result{Success: false, Kind: "subscription", Error: "Network error: " + err.Error()}
	}
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		return Result{Success: false, Kind: "subscription", Error: fmt.Sprintf("Authentication failed (HTTP %d)", status)}
	}
	if status < 200 || status >= 300 {
		return Result{Success: false, Kind: "subscription", Error: fmt.Sprintf("API error (HTTP %d): %s", status, string(body))}
	}

	var payload map[string]json.RawMessage
	if err := json.Unmarshal(body, &payload); err != nil {
		return Result{Success: false, Kind: "subscription", Error: "Failed to parse response: " + err.Error()}
	}

	tierNames := []string{tierFiveHour, tierSevenDay, tierSevenDayOpus, tierSevenDaySonnet}
	known := map[string]bool{"extra_usage": true}
	for _, name := range tierNames {
		known[name] = true
	}
	tiers := make([]Tier, 0)
	for _, name := range tierNames {
		if raw, ok := payload[name]; ok {
			if tier, ok := parseClaudeUsageTier(name, raw); ok {
				tiers = append(tiers, tier)
			}
		}
	}
	for name, raw := range payload {
		if known[name] {
			continue
		}
		if tier, ok := parseClaudeUsageTier(name, raw); ok {
			tiers = append(tiers, tier)
		}
	}
	return resultWithTiers("subscription", tiers)
}

func parseClaudeUsageTier(name string, raw json.RawMessage) (Tier, bool) {
	var window claudeUsageWindow
	if err := json.Unmarshal(raw, &window); err != nil || window.Utilization == nil {
		return Tier{}, false
	}
	return Tier{Name: name, Utilization: *window.Utilization, ResetsAt: strings.TrimSpace(window.ResetsAt)}, true
}

type codexUsageResponse struct {
	RateLimit *struct {
		PrimaryWindow   *codexUsageWindow `json:"primary_window"`
		SecondaryWindow *codexUsageWindow `json:"secondary_window"`
	} `json:"rate_limit"`
}

type codexUsageWindow struct {
	UsedPercent        *float64 `json:"used_percent"`
	LimitWindowSeconds *int64   `json:"limit_window_seconds"`
	ResetAt            *int64   `json:"reset_at"`
}

func queryCodexSubscriptionUsage(accessToken, accountID string) Result {
	headers := map[string]string{
		"Authorization": "Bearer " + strings.TrimSpace(accessToken),
		"User-Agent":    "codex-cli",
		"Accept":        "application/json",
	}
	if strings.TrimSpace(accountID) != "" {
		headers["ChatGPT-Account-Id"] = strings.TrimSpace(accountID)
	}
	body, status, err := httpGetJSON("https://chatgpt.com/backend-api/wham/usage", headers)
	if err != nil {
		return Result{Success: false, Kind: "subscription", Error: "Network error: " + err.Error()}
	}
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		return Result{Success: false, Kind: "subscription", Error: fmt.Sprintf("Authentication failed (HTTP %d)", status)}
	}
	if status < 200 || status >= 300 {
		return Result{Success: false, Kind: "subscription", Error: fmt.Sprintf("API error (HTTP %d): %s", status, string(body))}
	}

	var payload codexUsageResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return Result{Success: false, Kind: "subscription", Error: "Failed to parse response: " + err.Error()}
	}
	tiers := make([]Tier, 0, 2)
	if payload.RateLimit != nil {
		for _, window := range []*codexUsageWindow{payload.RateLimit.PrimaryWindow, payload.RateLimit.SecondaryWindow} {
			if window == nil || window.UsedPercent == nil {
				continue
			}
			name := "unknown"
			if window.LimitWindowSeconds != nil {
				name = windowSecondsToTierName(*window.LimitWindowSeconds)
			}
			tiers = append(tiers, Tier{Name: name, Utilization: *window.UsedPercent, ResetsAt: unixSecondsToRFC3339(window.ResetAt)})
		}
	}
	return resultWithTiers("subscription", tiers)
}

func windowSecondsToTierName(seconds int64) string {
	switch seconds {
	case 18000:
		return tierFiveHour
	case 604800:
		return tierSevenDay
	default:
		hours := seconds / 3600
		if hours >= 24 {
			return fmt.Sprintf("%d_day", hours/24)
		}
		return fmt.Sprintf("%d_hour", hours)
	}
}

func unixSecondsToRFC3339(seconds *int64) string {
	if seconds == nil || *seconds <= 0 {
		return ""
	}
	return time.Unix(*seconds, 0).UTC().Format(time.RFC3339)
}

func resultWithTiers(kind string, tiers []Tier) Result {
	res := Result{Success: true, Kind: kind, Tiers: tiers}
	if len(tiers) > 0 {
		res.Data = TiersToUsageData(tiers)
	}
	return res
}

// QuerySubscriptionUsage queries official OAuth subscription quota when supported.
func QuerySubscriptionUsage(providerID, accessToken, accountID string) Result {
	key := strings.TrimSpace(accessToken)
	if key == "" {
		return Result{Success: false, Kind: "subscription", Error: "subscription access token is empty"}
	}
	switch strings.TrimSpace(providerID) {
	case SubscriptionClaudeCode:
		return queryClaudeSubscriptionUsage(key)
	case SubscriptionCodex:
		return queryCodexSubscriptionUsage(key, accountID)
	default:
		return Result{Success: false, Kind: "unsupported", Error: "Unsupported subscription usage provider: " + providerID}
	}
}
