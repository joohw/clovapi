package usage

import (
	"fmt"
	"math"
	"strings"
)

// TierDisplayName returns a compact human label for token-plan buckets.
func TierDisplayName(name string) string {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case tierFiveHour:
		return "5小时"
	case tierWeeklyLimit:
		return "一周"
	case tierSevenDay:
		return "7天"
	case tierSevenDayOpus:
		return "7天 Opus"
	case tierSevenDaySonnet:
		return "7天 Sonnet"
	default:
		return strings.TrimSpace(name)
	}
}

func formatNumber(v float64) string {
	if math.Abs(v-math.Round(v)) < 0.000001 {
		return fmt.Sprintf("%.0f", v)
	}
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.2f", v), "0"), ".")
}

// FormatDataRow renders one usage row as plain text for CLI and desktop summaries.
func FormatDataRow(row Data) string {
	name := strings.TrimSpace(row.PlanName)
	if name == tierFiveHour || name == tierWeeklyLimit || name == tierSevenDay || name == tierSevenDayOpus || name == tierSevenDaySonnet {
		name = TierDisplayName(name)
	}
	unit := strings.TrimSpace(row.Unit)
	if row.Used != nil && row.Total != nil {
		if unit == "%" {
			pct := *row.Used
			if *row.Total > 0 {
				pct = *row.Used / *row.Total * 100
			}
			if name == "" {
				return formatNumber(pct) + "%"
			}
			return name + " " + formatNumber(pct) + "%"
		}
		if row.Remaining != nil {
			body := formatNumber(*row.Remaining)
			if unit != "" {
				body += " " + unit
			}
			if name == "" {
				return body
			}
			return name + " " + body
		}
		body := formatNumber(*row.Used) + "/" + formatNumber(*row.Total)
		if unit != "" {
			body += " " + unit
		}
		if name == "" {
			return body
		}
		return name + " " + body
	} else if row.Remaining != nil {
		body := formatNumber(*row.Remaining)
		if unit != "" {
			body += " " + unit
		}
		if name == "" {
			return body
		}
		return name + " " + body
	}
	if msg := strings.TrimSpace(row.InvalidMessage); msg != "" {
		return msg
	}
	if name == "" {
		return "no details"
	}
	return name
}

// FormatResult renders a complete usage query result as plain text.
func FormatResult(result Result) string {
	if text := strings.TrimSpace(result.Text); text != "" {
		return text
	}
	if !result.Success {
		if err := strings.TrimSpace(result.Error); err != "" {
			return err
		}
		return "usage query failed"
	}
	return ""
}
