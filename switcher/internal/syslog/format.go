package syslog

import (
	"fmt"
	"strings"
	"time"
)

// FormatListLine renders one compact line for CLI list output (similar to call logs).
func FormatListLine(entry Entry) string {
	return fmt.Sprintf(
		"%s  %s  %s  %s",
		strings.TrimSpace(entry.ID),
		formatLogTimestamp(entry.At),
		streamTag(entry.Stream),
		oneLineMessage(entry.Message),
	)
}

func formatLogTimestamp(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "—"
	}
	t, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		t, err = time.Parse(time.RFC3339, raw)
	}
	if err != nil {
		return raw
	}
	return t.Local().Format("15:04:05")
}

func streamTag(stream string) string {
	switch strings.ToLower(strings.TrimSpace(stream)) {
	case "stderr":
		return "ERR"
	case "stdout":
		return "OUT"
	case "system":
		return "SYS"
	default:
		s := strings.ToUpper(strings.TrimSpace(stream))
		if s == "" {
			return "SYS"
		}
		if len(s) > 4 {
			return s[:4]
		}
		return s
	}
}

func oneLineMessage(message string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(message)), " ")
}
