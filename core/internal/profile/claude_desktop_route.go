package profile

import (
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
)

var claudeDesktopFallbackRoutes = []string{
	"claude-sonnet-4-6",
	"claude-sonnet-4-5",
	"claude-opus-4-6",
	"claude-haiku-4-5",
}

var claudeDesktopRouteKeywords = []string{"claude", "sonnet", "opus", "haiku", "anthropic"}

// IsAnthropicGatewayRouteName reports whether name satisfies Claude Desktop gateway validation.
func IsAnthropicGatewayRouteName(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	if lower == "" {
		return false
	}
	for _, kw := range claudeDesktopRouteKeywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}

// ClaudeDesktopRouteName returns the model route Claude Desktop accepts for inferenceModels.
// Non-Anthropic wire names are mapped to stable Claude-style aliases; the proxy resolves them back.
func ClaudeDesktopRouteName(wireModel string, index int) string {
	wireModel = strings.TrimSpace(wireModel)
	if IsAnthropicGatewayRouteName(wireModel) {
		return wireModel
	}
	if index < 0 {
		index = 0
	}
	return claudeDesktopFallbackRoutes[index%len(claudeDesktopFallbackRoutes)]
}

// ResolveModelIDFromClaudeDesktopRoute maps a Desktop gateway route back to a persisted model id.
func ResolveModelIDFromClaudeDesktopRoute(store *Store, providerID, routeName string) (string, bool) {
	routeName = strings.TrimSpace(routeName)
	if store == nil || routeName == "" {
		return "", false
	}
	providerID = strings.TrimSpace(providerID)
	for _, prof := range store.List {
		if ProviderIDFromStoreProfile(prof) != providerID {
			continue
		}
		for i, raw := range prof.Models {
			m := NormalizeModelEntry(raw, i)
			wire := strings.TrimSpace(firstNonEmpty(m.Model, m.ID))
			route := ClaudeDesktopRouteName(wire, i)
			if routeName == route || routeName == m.ID || routeName == wire {
				id := strings.TrimSpace(m.ID)
				if id == "" {
					id = wire
				}
				return id, id != ""
			}
		}
		break
	}
	return "", false
}

// ClaudeDesktopRouteIDs lists gateway route ids for models under providerID.
func ClaudeDesktopRouteIDs(store *Store, providerID string) []string {
	if store == nil {
		return nil
	}
	providerID = strings.TrimSpace(providerID)
	seen := map[string]bool{}
	var routes []string
	add := func(route string) {
		route = strings.TrimSpace(route)
		if route == "" || seen[route] {
			return
		}
		seen[route] = true
		routes = append(routes, route)
	}
	for _, prof := range store.List {
		if ProviderIDFromStoreProfile(prof) != providerID {
			continue
		}
		if len(prof.Models) == 0 {
			add(ClaudeDesktopRouteName(prof.Model, 0))
			break
		}
		for i, raw := range prof.Models {
			m := NormalizeModelEntry(raw, i)
			wire := strings.TrimSpace(firstNonEmpty(m.Model, m.ID))
			add(ClaudeDesktopRouteName(wire, i))
		}
		break
	}
	return routes
}

// ResolveIngressModelID maps Claude Desktop gateway routes back to persisted model ids.
func ResolveIngressModelID(store *Store, providerID, modelID string) string {
	modelID = strings.TrimSpace(modelID)
	if modelID == "" || store == nil {
		return modelID
	}
	if wire, ok := ResolveModelIDFromClaudeDesktopRoute(store, providerID, modelID); ok {
		return wire
	}
	if !IsAnthropicGatewayRouteName(modelID) {
		return modelID
	}
	sel, ok := store.Active[string(agentkind.ClaudeDesktop)]
	if !ok {
		return modelID
	}
	if strings.TrimSpace(sel.ProviderID) != strings.TrimSpace(providerID) {
		return modelID
	}
	if wire := strings.TrimSpace(sel.ModelID); wire != "" {
		return wire
	}
	return modelID
}
