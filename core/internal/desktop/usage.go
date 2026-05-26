package desktop

import (
	"fmt"
	"strings"

	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/usage"
)

type UsageQueryUI struct {
	Enabled          bool   `json:"enabled"`
	TemplateType     string `json:"templateType"`
	AutoIntervalMins int    `json:"autoIntervalMinutes,omitempty"`
}

type VendorUsageResult struct {
	OK       bool         `json:"ok"`
	Vendor   string       `json:"vendor,omitempty"`
	Template string       `json:"templateType,omitempty"`
	Usage    usage.Result `json:"usage,omitempty"`
	Error    string       `json:"error,omitempty"`
}

func usageQueryToUI(q *profile.UsageQuery) *UsageQueryUI {
	if q == nil {
		return &UsageQueryUI{Enabled: true, TemplateType: usage.TemplateAuto}
	}
	return &UsageQueryUI{
		Enabled:          q.Enabled,
		TemplateType:     strings.TrimSpace(q.TemplateType),
		AutoIntervalMins: q.AutoIntervalMins,
	}
}

func usageQueryFromUI(q *UsageQueryUI) *profile.UsageQuery {
	if q == nil {
		return nil
	}
	return &profile.UsageQuery{
		Enabled:          q.Enabled,
		TemplateType:     strings.TrimSpace(q.TemplateType),
		AutoIntervalMins: q.AutoIntervalMins,
	}
}

func resolveVendorCredentials(vendor profile.Profile) (baseURL, apiKey, templateType string, err error) {
	if strings.ToLower(strings.TrimSpace(vendor.Kind)) != "api" {
		return "", "", "", fmt.Errorf("usage query is only supported for API vendors")
	}
	baseURL = strings.TrimSpace(vendor.BaseURL)
	apiKey = strings.TrimSpace(vendor.APIKey)
	if baseURL == "" || apiKey == "" {
		return "", "", "", fmt.Errorf("vendor base URL and API key are required")
	}
	templateType = usage.TemplateAuto
	if vendor.UsageQuery != nil {
		if !vendor.UsageQuery.Enabled {
			return "", "", "", fmt.Errorf("usage query is disabled for this vendor")
		}
		if t := strings.TrimSpace(vendor.UsageQuery.TemplateType); t != "" {
			templateType = t
		}
	}
	return baseURL, apiKey, templateType, nil
}

// QueryVendorUsage queries upstream quota/balance for one persisted API vendor.
func QueryVendorUsage(vendorName string) VendorUsageResult {
	name := strings.TrimSpace(vendorName)
	if name == "" {
		return VendorUsageResult{OK: false, Error: "vendorName is required"}
	}
	s, err := profile.LoadDesktop()
	if err != nil {
		return VendorUsageResult{OK: false, Error: err.Error()}
	}
	vendor, ok := profile.FindStoreVendorProfile(s, name)
	if !ok {
		return VendorUsageResult{OK: false, Error: fmt.Sprintf("vendor not found: %s", name)}
	}
	baseURL, apiKey, templateType, err := resolveVendorCredentials(vendor)
	if err != nil {
		return VendorUsageResult{OK: false, Vendor: name, Error: err.Error()}
	}
	result := usage.QueryVendorUsage(baseURL, apiKey, templateType)
	return VendorUsageResult{
		OK:       result.Success,
		Vendor:   name,
		Template: templateType,
		Usage:    result,
		Error:    result.Error,
	}
}
