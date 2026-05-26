package usage

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type codingPlanProvider int

const (
	codingPlanKimi codingPlanProvider = iota
	codingPlanZhipu
	codingPlanMiniMaxCN
	codingPlanMiniMaxEN
)

const (
	tierFiveHour    = "five_hour"
	tierWeeklyLimit = "weekly_limit"
)

func detectCodingPlanProvider(baseURL string) (codingPlanProvider, bool) {
	url := strings.ToLower(strings.TrimSpace(baseURL))
	switch {
	case strings.Contains(url, "api.kimi.com/coding"):
		return codingPlanKimi, true
	case strings.Contains(url, "open.bigmodel.cn"), strings.Contains(url, "bigmodel.cn"), strings.Contains(url, "api.z.ai"):
		return codingPlanZhipu, true
	case strings.Contains(url, "api.minimaxi.com"):
		return codingPlanMiniMaxCN, true
	case strings.Contains(url, "api.minimax.io"):
		return codingPlanMiniMaxEN, true
	default:
		return 0, false
	}
}

func millisToRFC3339(ms int64) string {
	if ms <= 0 {
		return ""
	}
	return time.UnixMilli(ms).UTC().Format(time.RFC3339)
}

func extractResetTime(raw any) string {
	switch v := raw.(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		ms := int64(v)
		if ms < 1_000_000_000_000 {
			ms *= 1000
		}
		return millisToRFC3339(ms)
	case json.Number:
		if n, err := v.Int64(); err == nil {
			ms := n
			if ms < 1_000_000_000_000 {
				ms *= 1000
			}
			return millisToRFC3339(ms)
		}
	}
	return ""
}

func parseZhipuTokenTiers(data map[string]any) []Tier {
	type row struct {
		resetMS *int64
		pct     float64
		resetAt string
	}
	limits, _ := data["limits"].([]any)
	rows := make([]row, 0)
	for _, item := range limits {
		limitItem, _ := item.(map[string]any)
		if limitItem == nil {
			continue
		}
		limitType, _ := limitItem["type"].(string)
		if !strings.EqualFold(strings.TrimSpace(limitType), "TOKENS_LIMIT") {
			continue
		}
		pct := 0.0
		if v := parseFloatField(limitItem, "percentage"); v != nil {
			pct = *v
		}
		var resetMS *int64
		switch v := limitItem["nextResetTime"].(type) {
		case float64:
			n := int64(v)
			resetMS = &n
		case json.Number:
			if n, err := v.Int64(); err == nil {
				resetMS = &n
			}
		}
		resetAt := ""
		if resetMS != nil {
			resetAt = millisToRFC3339(*resetMS)
		}
		rows = append(rows, row{resetMS: resetMS, pct: pct, resetAt: resetAt})
	}
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			leftHas := rows[i].resetMS != nil
			rightHas := rows[j].resetMS != nil
			leftVal := int64(-1)
			rightVal := int64(-1)
			if rows[i].resetMS != nil {
				leftVal = *rows[i].resetMS
			}
			if rows[j].resetMS != nil {
				rightVal = *rows[j].resetMS
			}
			if (!leftHas && rightHas) || (leftHas && rightHas && leftVal > rightVal) {
				rows[i], rows[j] = rows[j], rows[i]
			}
		}
	}
	names := []string{tierFiveHour, tierWeeklyLimit}
	out := make([]Tier, 0, 2)
	for i, r := range rows {
		if i >= len(names) {
			break
		}
		out = append(out, Tier{
			Name:        names[i],
			Utilization: r.pct,
			ResetsAt:    r.resetAt,
		})
	}
	return out
}

func queryKimiCodingPlan(apiKey string) Result {
	body, status, err := httpGetJSON("https://api.kimi.com/coding/v1/usages", map[string]string{
		"Authorization": "Bearer " + strings.TrimSpace(apiKey),
		"Accept":        "application/json",
	})
	if err != nil {
		return Result{Success: false, Kind: "token_plan", Error: "Network error: " + err.Error()}
	}
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		return Result{Success: false, Kind: "token_plan", Error: fmt.Sprintf("Authentication failed (HTTP %d)", status)}
	}
	if status < 200 || status >= 300 {
		return Result{Success: false, Kind: "token_plan", Error: fmt.Sprintf("API error (HTTP %d): %s", status, string(body))}
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return Result{Success: false, Kind: "token_plan", Error: "Failed to parse response: " + err.Error()}
	}
	tiers := make([]Tier, 0)
	if limits, ok := payload["limits"].([]any); ok {
		for _, item := range limits {
			limitItem, _ := item.(map[string]any)
			if limitItem == nil {
				continue
			}
			detail, _ := limitItem["detail"].(map[string]any)
			if detail == nil {
				continue
			}
			limit := parseFloatField(detail, "limit")
			remaining := parseFloatField(detail, "remaining")
			if limit == nil || remaining == nil || *limit <= 0 {
				continue
			}
			used := *limit - *remaining
			if used < 0 {
				used = 0
			}
			tiers = append(tiers, Tier{
				Name:        tierFiveHour,
				Utilization: used / *limit * 100,
				ResetsAt:    extractResetTime(detail["resetTime"]),
			})
		}
	}
	if usage, ok := payload["usage"].(map[string]any); ok {
		limit := parseFloatField(usage, "limit")
		remaining := parseFloatField(usage, "remaining")
		if limit != nil && remaining != nil && *limit > 0 {
			used := *limit - *remaining
			if used < 0 {
				used = 0
			}
			tiers = append(tiers, Tier{
				Name:        tierWeeklyLimit,
				Utilization: used / *limit * 100,
				ResetsAt:    extractResetTime(usage["resetTime"]),
			})
		}
	}
	return Result{Success: true, Kind: "token_plan", Tiers: tiers}
}

func queryZhipuCodingPlan(apiKey string) Result {
	body, status, err := httpGetJSON("https://api.z.ai/api/monitor/usage/quota/limit", map[string]string{
		"Authorization": strings.TrimSpace(apiKey),
		"Content-Type":  "application/json",
		"Accept-Language": "en-US,en",
	})
	if err != nil {
		return Result{Success: false, Kind: "token_plan", Error: "Network error: " + err.Error()}
	}
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		return Result{Success: false, Kind: "token_plan", Error: fmt.Sprintf("Authentication failed (HTTP %d)", status)}
	}
	if status < 200 || status >= 300 {
		return Result{Success: false, Kind: "token_plan", Error: fmt.Sprintf("API error (HTTP %d): %s", status, string(body))}
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return Result{Success: false, Kind: "token_plan", Error: "Failed to parse response: " + err.Error()}
	}
	if success, ok := payload["success"].(bool); ok && !success {
		msg, _ := payload["msg"].(string)
		if strings.TrimSpace(msg) == "" {
			msg = "Unknown error"
		}
		return Result{Success: false, Kind: "token_plan", Error: "API error: " + msg}
	}
	data, _ := payload["data"].(map[string]any)
	if data == nil {
		return Result{Success: false, Kind: "token_plan", Error: "Missing 'data' field in response"}
	}
	return Result{Success: true, Kind: "token_plan", Tiers: parseZhipuTokenTiers(data)}
}

func queryMiniMaxCodingPlan(apiKey string, cn bool) Result {
	domain := "api.minimax.io"
	if cn {
		domain = "api.minimaxi.com"
	}
	url := fmt.Sprintf("https://%s/v1/api/openplatform/coding_plan/remains", domain)
	body, status, err := httpGetJSON(url, map[string]string{
		"Authorization": "Bearer " + strings.TrimSpace(apiKey),
		"Content-Type":  "application/json",
	})
	if err != nil {
		return Result{Success: false, Kind: "token_plan", Error: "Network error: " + err.Error()}
	}
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		return Result{Success: false, Kind: "token_plan", Error: fmt.Sprintf("Authentication failed (HTTP %d)", status)}
	}
	if status < 200 || status >= 300 {
		return Result{Success: false, Kind: "token_plan", Error: fmt.Sprintf("API error (HTTP %d): %s", status, string(body))}
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return Result{Success: false, Kind: "token_plan", Error: "Failed to parse response: " + err.Error()}
	}
	if baseResp, ok := payload["base_resp"].(map[string]any); ok {
		code := int64(-1)
		switch v := baseResp["status_code"].(type) {
		case float64:
			code = int64(v)
		case json.Number:
			if n, err := v.Int64(); err == nil {
				code = n
			}
		}
		if code != 0 {
			msg, _ := baseResp["status_msg"].(string)
			if strings.TrimSpace(msg) == "" {
				msg = "Unknown error"
			}
			return Result{Success: false, Kind: "token_plan", Error: fmt.Sprintf("API error (code %d): %s", code, msg)}
		}
	}
	tiers := make([]Tier, 0)
	if remains, ok := payload["model_remains"].([]any); ok && len(remains) > 0 {
		item, _ := remains[0].(map[string]any)
		if item != nil {
			intervalTotal := parseFloatField(item, "current_interval_total_count")
			intervalRemaining := parseFloatField(item, "current_interval_usage_count")
			if intervalTotal != nil && intervalRemaining != nil && *intervalTotal > 0 {
				tiers = append(tiers, Tier{
					Name:        tierFiveHour,
					Utilization: (*intervalTotal - *intervalRemaining) / *intervalTotal * 100,
					ResetsAt:    extractResetTime(item["end_time"]),
				})
			}
			weeklyTotal := parseFloatField(item, "current_weekly_total_count")
			weeklyRemaining := parseFloatField(item, "current_weekly_usage_count")
			if weeklyTotal != nil && weeklyRemaining != nil && *weeklyTotal > 0 {
				tiers = append(tiers, Tier{
					Name:        tierWeeklyLimit,
					Utilization: (*weeklyTotal - *weeklyRemaining) / *weeklyTotal * 100,
					ResetsAt:    extractResetTime(item["weekly_end_time"]),
				})
			}
		}
	}
	return Result{Success: true, Kind: "token_plan", Tiers: tiers}
}

// QueryCodingPlan queries token-plan utilization for Kimi / Zhipu / MiniMax coding endpoints.
func QueryCodingPlan(baseURL, apiKey string) Result {
	key := strings.TrimSpace(apiKey)
	if key == "" {
		return Result{Success: false, Kind: "token_plan", Error: "API key is empty"}
	}
	provider, ok := detectCodingPlanProvider(baseURL)
	if !ok {
		return Result{Success: false, Kind: "token_plan", Error: "Unknown coding plan provider"}
	}
	switch provider {
	case codingPlanKimi:
		return queryKimiCodingPlan(key)
	case codingPlanZhipu:
		return queryZhipuCodingPlan(key)
	case codingPlanMiniMaxCN:
		return queryMiniMaxCodingPlan(key, true)
	case codingPlanMiniMaxEN:
		return queryMiniMaxCodingPlan(key, false)
	default:
		return Result{Success: false, Kind: "token_plan", Error: "Unknown coding plan provider"}
	}
}

// TiersToUsageData converts token-plan tiers into flat rows for the desktop UI.
func TiersToUsageData(tiers []Tier) []Data {
	out := make([]Data, 0, len(tiers))
	for _, tier := range tiers {
		total := 100.0
		used := tier.Utilization
		remaining := total - used
		valid := true
		out = append(out, Data{
			PlanName:  tier.Name,
			Total:     &total,
			Used:      &used,
			Remaining: &remaining,
			Unit:      "%",
			IsValid:   &valid,
			Extra:     tier.ResetsAt,
		})
	}
	return out
}
