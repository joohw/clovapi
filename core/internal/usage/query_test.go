package usage

import "testing"

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

func TestFormatResultTokenPlan(t *testing.T) {
	res := Result{
		Success: true,
		Kind:    "token_plan",
		Tiers: []Tier{
			{Name: tierFiveHour, Utilization: 12.5, ResetsAt: "2026-06-02T10:00:00Z"},
			{Name: tierWeeklyLimit, Utilization: 40},
		},
	}
	got := FormatResult(res)
	want := "5小时 12.5% · 一周 40%"
	if got != want {
		t.Fatalf("FormatResult() = %q want %q", got, want)
	}
}

func TestFormatResultSubscriptionTiers(t *testing.T) {
	res := Result{
		Success: true,
		Kind:    "subscription",
		Tiers: []Tier{
			{Name: tierFiveHour, Utilization: 12},
			{Name: tierSevenDay, Utilization: 34},
		},
	}
	got := FormatResult(res)
	want := "5小时 12% · 7天 34%"
	if got != want {
		t.Fatalf("FormatResult() = %q want %q", got, want)
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
