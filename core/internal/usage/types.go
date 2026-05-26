package usage

// Data is one quota/balance row returned to the desktop UI.
type Data struct {
	PlanName       string  `json:"planName,omitempty"`
	Extra          string  `json:"extra,omitempty"`
	IsValid        *bool   `json:"isValid,omitempty"`
	InvalidMessage string  `json:"invalidMessage,omitempty"`
	Total          *float64 `json:"total,omitempty"`
	Used           *float64 `json:"used,omitempty"`
	Remaining      *float64 `json:"remaining,omitempty"`
	Unit           string  `json:"unit,omitempty"`
}

// Tier is a token-plan utilization bucket (five_hour, weekly_limit, …).
type Tier struct {
	Name         string  `json:"name"`
	Utilization  float64 `json:"utilization"`
	ResetsAt     string  `json:"resetsAt,omitempty"`
}

// Result mirrors cc-switch UsageResult for API vendors.
type Result struct {
	Success bool    `json:"success"`
	Kind    string  `json:"kind,omitempty"` // balance | token_plan | unsupported
	Data    []Data  `json:"data,omitempty"`
	Tiers   []Tier  `json:"tiers,omitempty"`
	Error   string  `json:"error,omitempty"`
}
