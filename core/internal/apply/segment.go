package apply

import "strings"

// profileModelSegment returns the last path segment of a model id for provider-local ids (e.g. "openai/foo" -> "foo").
func profileModelSegment(m string) string {
	s := strings.TrimSpace(m)
	if s == "" {
		return ""
	}
	if i := strings.LastIndex(s, "/"); i >= 0 {
		return strings.TrimSpace(s[i+1:])
	}
	return s
}
