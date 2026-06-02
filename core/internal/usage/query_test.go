package usage

import (
	"testing"
	"time"
)

func withFixedSubscriptionNow(t *testing.T, now time.Time) {
	t.Helper()
	original := usageTextNow
	usageTextNow = func() time.Time { return now }
	t.Cleanup(func() { usageTextNow = original })
}

func TestDetectBalanceProvider(t *testing.T) {
	cases := []struct {
		base string
		ok   bool
	}{
		{"https://api.deepseek.com/v1", true},
		{"https://openrouter.ai/api/v1", true},
		{"https://api.example.com/v1", false},
	}
	for _, tc := range cases {
		_, ok := detectBalanceProvider(tc.base)
		if ok != tc.ok {
			t.Fatalf("detectBalanceProvider(%q) = %v want %v", tc.base, ok, tc.ok)
		}
	}
}

func TestDetectCodingPlanProvider(t *testing.T) {
	cases := []struct {
		base string
		ok   bool
	}{
		{"https://api.kimi.com/coding/v1", true},
		{"https://api.z.ai/v1", true},
		{"https://api.openai.com/v1", false},
	}
	for _, tc := range cases {
		_, ok := detectCodingPlanProvider(tc.base)
		if ok != tc.ok {
			t.Fatalf("detectCodingPlanProvider(%q) = %v want %v", tc.base, ok, tc.ok)
		}
	}
}

func TestQueryVendorUsageAutoUnsupported(t *testing.T) {
	res := QueryVendorUsage("https://example.com/v1", "sk-test", TemplateAuto)
	if res.Success {
		t.Fatalf("expected unsupported auto query to fail")
	}
	if res.Kind != "unsupported" {
		t.Fatalf("kind = %q want unsupported", res.Kind)
	}
}

func TestFormatResultUsesAdapterTextOnly(t *testing.T) {
	res := Result{Success: true, Kind: "subscription", Text: "adapter text", Tiers: []Tier{{Name: tierFiveHour, Utilization: 12}}}
	if got := FormatResult(res); got != "adapter text" {
		t.Fatalf("FormatResult() = %q want adapter text", got)
	}

	res.Text = ""
	if got := FormatResult(res); got != "" {
		t.Fatalf("FormatResult() fallback = %q want empty", got)
	}
}

func TestSubscriptionUsageTextIncludesReset(t *testing.T) {
	withFixedSubscriptionNow(t, time.Date(2026, 6, 2, 8, 45, 0, 0, time.UTC))

	res := Result{
		Success: true,
		Kind:    "subscription",
		Tiers: []Tier{
			{Name: tierFiveHour, Utilization: 12, ResetsAt: "2026-06-02T09:15:00Z"},
			{Name: tierSevenDay, Utilization: 34, ResetsAt: "2026-06-07T09:00:00.475308+00:00"},
		},
	}
	got := formatSubscriptionUsageText(res.Tiers)
	want := "5小时 12%（30m） · 7天 34%（06-07）"
	if got != want {
		t.Fatalf("formatSubscriptionUsageText() = %q want %q", got, want)
	}
}

func TestCodingPlanUsageTextIncludesReset(t *testing.T) {
	withFixedSubscriptionNow(t, time.Date(2026, 6, 2, 8, 45, 0, 0, time.UTC))

	got := formatCodingPlanUsageText([]Tier{
		{Name: tierFiveHour, Utilization: 90, ResetsAt: "2026-06-02T11:00:00Z"},
		{Name: tierWeeklyLimit, Utilization: 20, ResetsAt: "2026-06-07T19:47:46Z"},
	})
	want := "5小时 90%（2h15m） · 一周 20%（06-07）"
	if got != want {
		t.Fatalf("formatCodingPlanUsageText() = %q want %q", got, want)
	}
}

func TestBalanceUsageTextComesFromRows(t *testing.T) {
	remaining := 12.34
	got := formatBalanceUsageText([]Data{{PlanName: "OpenRouter", Remaining: &remaining, Unit: "USD"}})
	want := "OpenRouter 12.34 USD"
	if got != want {
		t.Fatalf("formatBalanceUsageText() = %q want %q", got, want)
	}
}

func TestWindowSecondsToTierName(t *testing.T) {
	if got := windowSecondsToTierName(18000); got != tierFiveHour {
		t.Fatalf("5h tier = %q", got)
	}
	if got := windowSecondsToTierName(604800); got != tierSevenDay {
		t.Fatalf("7d tier = %q", got)
	}
	if got := windowSecondsToTierName(86400); got != "1_day" {
		t.Fatalf("1d tier = %q", got)
	}
}

func TestZhipuTokenTiersNoResetSortsFirst(t *testing.T) {
	tiers := parseZhipuTokenTiers(map[string]any{
		"limits": []any{
			map[string]any{"type": "TOKENS_LIMIT", "percentage": 53.0, "nextResetTime": float64(2_000_000_000_000)},
			map[string]any{"type": "TOKENS_LIMIT", "percentage": 44.0},
		},
	})
	if len(tiers) != 2 {
		t.Fatalf("len(tiers) = %d want 2", len(tiers))
	}
	if tiers[0].Name != tierFiveHour || tiers[0].Utilization != 44.0 {
		t.Fatalf("first tier = %+v want no-reset five_hour", tiers[0])
	}
	if tiers[1].Name != tierWeeklyLimit || tiers[1].Utilization != 53.0 {
		t.Fatalf("second tier = %+v want reset weekly_limit", tiers[1])
	}
}
