package usage

import "strings"

const (
	TemplateAuto      = "auto"
	TemplateBalance   = "balance"
	TemplateTokenPlan = "token_plan"
)

// QueryVendorUsage resolves API vendor quota using cc-switch-compatible template routing.
func QueryVendorUsage(baseURL, apiKey, templateType string) Result {
	baseURL = strings.TrimSpace(baseURL)
	apiKey = strings.TrimSpace(apiKey)
	templateType = strings.ToLower(strings.TrimSpace(templateType))
	if templateType == "" {
		templateType = TemplateAuto
	}

	switch templateType {
	case TemplateBalance:
		return QueryBalance(baseURL, apiKey)
	case TemplateTokenPlan:
		res := QueryCodingPlan(baseURL, apiKey)
		if res.Success {
			res.Data = TiersToUsageData(res.Tiers)
		}
		return res
	case TemplateAuto:
		if _, ok := detectCodingPlanProvider(baseURL); ok {
			res := QueryCodingPlan(baseURL, apiKey)
			if res.Success {
				res.Data = TiersToUsageData(res.Tiers)
				return res
			}
		}
		if _, ok := detectBalanceProvider(baseURL); ok {
			return QueryBalance(baseURL, apiKey)
		}
		return Result{
			Success: false,
			Kind:    "unsupported",
			Error:   "No built-in balance or coding-plan endpoint for this base URL",
		}
	default:
		return Result{
			Success: false,
			Kind:    "unsupported",
			Error:   "Unsupported usage template: " + templateType,
		}
	}
}
