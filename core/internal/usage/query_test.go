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
