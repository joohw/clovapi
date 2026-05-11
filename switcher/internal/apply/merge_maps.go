package apply

// ensureSubMap returns m[key] as a nested map, replacing invalid/missing entries with a new map.
func ensureSubMap(m map[string]any, key string) map[string]any {
	if cur, ok := m[key].(map[string]any); ok && cur != nil {
		return cur
	}
	nm := map[string]any{}
	m[key] = nm
	return nm
}
