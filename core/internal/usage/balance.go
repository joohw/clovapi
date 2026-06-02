package usage

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type balanceProvider int

const (
	balanceDeepSeek balanceProvider = iota
	balanceStepFun
	balanceSiliconFlowCN
	balanceSiliconFlowEN
	balanceOpenRouter
	balanceNovitaAI
)

func detectBalanceProvider(baseURL string) (balanceProvider, bool) {
	url := strings.ToLower(strings.TrimSpace(baseURL))
	switch {
	case strings.Contains(url, "api.deepseek.com"):
		return balanceDeepSeek, true
	case strings.Contains(url, "api.stepfun.ai"), strings.Contains(url, "api.stepfun.com"):
		return balanceStepFun, true
	case strings.Contains(url, "api.siliconflow.cn"):
		return balanceSiliconFlowCN, true
	case strings.Contains(url, "api.siliconflow.com"):
		return balanceSiliconFlowEN, true
	case strings.Contains(url, "openrouter.ai"):
		return balanceOpenRouter, true
	case strings.Contains(url, "api.novita.ai"):
		return balanceNovitaAI, true
	default:
		return 0, false
	}
}

func parseFloatField(obj map[string]any, field string) *float64 {
	raw, ok := obj[field]
	if !ok || raw == nil {
		return nil
	}
	switch v := raw.(type) {
	case float64:
		out := v
		return &out
	case json.Number:
		if f, err := v.Float64(); err == nil {
			return &f
		}
	case string:
		var f float64
		if _, err := fmt.Sscanf(strings.TrimSpace(v), "%f", &f); err == nil {
			return &f
		}
	}
	return nil
}

func authFailureResult(status int) Result {
	valid := false
	msg := fmt.Sprintf("Authentication failed (HTTP %d)", status)
	return Result{
		Success: false,
		Kind:    "balance",
		Data: []Data{{
			IsValid:        &valid,
			InvalidMessage: msg,
		}},
		Error: msg,
	}
}

func httpGetJSON(url string, headers map[string]string) ([]byte, int, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	return body, resp.StatusCode, err
}

func queryDeepSeek(apiKey string) Result {
	body, status, err := httpGetJSON("https://api.deepseek.com/user/balance", map[string]string{
		"Authorization": "Bearer " + strings.TrimSpace(apiKey),
		"Accept":        "application/json",
	})
	if err != nil {
		return Result{Success: false, Kind: "balance", Error: "Network error: " + err.Error()}
	}
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		return authFailureResult(status)
	}
	if status < 200 || status >= 300 {
		return Result{Success: false, Kind: "balance", Error: fmt.Sprintf("API error (HTTP %d): %s", status, string(body))}
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return Result{Success: false, Kind: "balance", Error: "Failed to parse response: " + err.Error()}
	}
	isAvailable := true
	if v, ok := payload["is_available"].(bool); ok {
		isAvailable = v
	}
	out := make([]Data, 0)
	if infos, ok := payload["balance_infos"].([]any); ok {
		for _, item := range infos {
			row, _ := item.(map[string]any)
			if row == nil {
				continue
			}
			currency := "CNY"
			if s, ok := row["currency"].(string); ok && strings.TrimSpace(s) != "" {
				currency = strings.TrimSpace(s)
			}
			remaining := parseFloatField(row, "total_balance")
			valid := isAvailable
			var invalidMsg string
			if !isAvailable {
				invalidMsg = "Insufficient balance"
			}
			out = append(out, Data{
				PlanName:       currency,
				Remaining:      remaining,
				Unit:           currency,
				IsValid:        &valid,
				InvalidMessage: invalidMsg,
			})
		}
	}
	return resultWithBalanceData(out)
}

func queryStepFun(apiKey string) Result {
	body, status, err := httpGetJSON("https://api.stepfun.com/v1/accounts", map[string]string{
		"Authorization": "Bearer " + strings.TrimSpace(apiKey),
		"Accept":        "application/json",
	})
	if err != nil {
		return Result{Success: false, Kind: "balance", Error: "Network error: " + err.Error()}
	}
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		return authFailureResult(status)
	}
	if status < 200 || status >= 300 {
		return Result{Success: false, Kind: "balance", Error: fmt.Sprintf("API error (HTTP %d): %s", status, string(body))}
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return Result{Success: false, Kind: "balance", Error: "Failed to parse response: " + err.Error()}
	}
	balance := parseFloatField(payload, "balance")
	valid := true
	return resultWithBalanceData([]Data{{
		PlanName:  "StepFun",
		Remaining: balance,
		Unit:      "CNY",
		IsValid:   &valid,
	}})
}

func querySiliconFlow(apiKey string, cn bool) Result {
	domain := "api.siliconflow.com"
	unit := "USD"
	plan := "SiliconFlow (EN)"
	if cn {
		domain = "api.siliconflow.cn"
		unit = "CNY"
		plan = "SiliconFlow"
	}
	body, status, err := httpGetJSON("https://"+domain+"/v1/user/info", map[string]string{
		"Authorization": "Bearer " + strings.TrimSpace(apiKey),
		"Accept":        "application/json",
	})
	if err != nil {
		return Result{Success: false, Kind: "balance", Error: "Network error: " + err.Error()}
	}
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		return authFailureResult(status)
	}
	if status < 200 || status >= 300 {
		return Result{Success: false, Kind: "balance", Error: fmt.Sprintf("API error (HTTP %d): %s", status, string(body))}
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return Result{Success: false, Kind: "balance", Error: "Failed to parse response: " + err.Error()}
	}
	data, _ := payload["data"].(map[string]any)
	if data == nil {
		return Result{Success: false, Kind: "balance", Error: "Missing 'data' field in response"}
	}
	remaining := parseFloatField(data, "totalBalance")
	valid := true
	return resultWithBalanceData([]Data{{
		PlanName:  plan,
		Remaining: remaining,
		Unit:      unit,
		IsValid:   &valid,
	}})
}

func queryOpenRouter(apiKey string) Result {
	body, status, err := httpGetJSON("https://openrouter.ai/api/v1/credits", map[string]string{
		"Authorization": "Bearer " + strings.TrimSpace(apiKey),
		"Accept":        "application/json",
	})
	if err != nil {
		return Result{Success: false, Kind: "balance", Error: "Network error: " + err.Error()}
	}
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		return authFailureResult(status)
	}
	if status < 200 || status >= 300 {
		return Result{Success: false, Kind: "balance", Error: fmt.Sprintf("API error (HTTP %d): %s", status, string(body))}
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return Result{Success: false, Kind: "balance", Error: "Failed to parse response: " + err.Error()}
	}
	data, _ := payload["data"].(map[string]any)
	if data == nil {
		data = payload
	}
	total := parseFloatField(data, "total_credits")
	used := parseFloatField(data, "used")
	var remaining *float64
	if total != nil && used != nil {
		v := *total - *used
		remaining = &v
	}
	valid := remaining == nil || *remaining > 0
	var invalidMsg string
	if remaining != nil && *remaining <= 0 {
		invalidMsg = "No credits remaining"
	}
	return resultWithBalanceData([]Data{{
		PlanName:       "OpenRouter",
		Remaining:      remaining,
		Total:          total,
		Used:           used,
		Unit:           "USD",
		IsValid:        &valid,
		InvalidMessage: invalidMsg,
	}})
}

func queryNovita(apiKey string) Result {
	body, status, err := httpGetJSON("https://api.novita.ai/v3/user/balance", map[string]string{
		"Authorization": "Bearer " + strings.TrimSpace(apiKey),
		"Accept":        "application/json",
	})
	if err != nil {
		return Result{Success: false, Kind: "balance", Error: "Network error: " + err.Error()}
	}
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		return authFailureResult(status)
	}
	if status < 200 || status >= 300 {
		return Result{Success: false, Kind: "balance", Error: fmt.Sprintf("API error (HTTP %d): %s", status, string(body))}
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return Result{Success: false, Kind: "balance", Error: "Failed to parse response: " + err.Error()}
	}
	raw := parseFloatField(payload, "availableBalance")
	var remaining *float64
	if raw != nil {
		v := *raw / 10000.0
		remaining = &v
	}
	valid := remaining == nil || *remaining > 0
	var invalidMsg string
	if remaining != nil && *remaining <= 0 {
		invalidMsg = "No balance remaining"
	}
	return resultWithBalanceData([]Data{{
		PlanName:       "Novita AI",
		Remaining:      remaining,
		Unit:           "USD",
		IsValid:        &valid,
		InvalidMessage: invalidMsg,
	}})
}

func formatBalanceUsageText(rows []Data) string {
	parts := make([]string, 0, len(rows))
	for _, row := range rows {
		if text := strings.TrimSpace(FormatDataRow(row)); text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, " · ")
}

func resultWithBalanceData(rows []Data) Result {
	res := Result{Success: true, Kind: "balance", Text: formatBalanceUsageText(rows)}
	if len(rows) > 0 {
		res.Data = rows
	}
	return res
}

// QueryBalance queries vendor account balance when base_url matches a known provider.
func QueryBalance(baseURL, apiKey string) Result {
	key := strings.TrimSpace(apiKey)
	if key == "" {
		return Result{Success: false, Kind: "balance", Error: "API key is empty"}
	}
	provider, ok := detectBalanceProvider(baseURL)
	if !ok {
		return Result{Success: false, Kind: "balance", Error: "Unknown balance provider"}
	}
	switch provider {
	case balanceDeepSeek:
		return queryDeepSeek(key)
	case balanceStepFun:
		return queryStepFun(key)
	case balanceSiliconFlowCN:
		return querySiliconFlow(key, true)
	case balanceSiliconFlowEN:
		return querySiliconFlow(key, false)
	case balanceOpenRouter:
		return queryOpenRouter(key)
	case balanceNovitaAI:
		return queryNovita(key)
	default:
		return Result{Success: false, Kind: "balance", Error: "Unknown balance provider"}
	}
}
