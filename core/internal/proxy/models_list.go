package proxy

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/clovapi/switcher/internal/agentkind"
	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/ingresstoken"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

const (
	claudeDesktopModelCreated = "2024-01-01T00:00:00Z"
)

func (s *Server) serveIngressModels(w http.ResponseWriter, r *http.Request, trace *requestTrace, ingress provider.Ingress, store *profile.Store) {
	claudeDesktop := isClaudeDesktopIngress(r, ingress)
	body := buildModelsListBody(ingress.ProviderID, ingress.ModelID, store, claudeDesktop)
	trace.setUpstreamResponse(http.StatusOK, http.Header{"Content-Type": []string{"application/json"}}, []byte(body))
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write([]byte(body))
	}
}

func isClaudeDesktopIngress(r *http.Request, ingress provider.Ingress) bool {
	auth := ingresstoken.FromHTTPRequest(r)
	if auth.Agent == agentkind.ClaudeDesktop {
		return true
	}
	if auth.Token == ingresstoken.Legacy &&
		strings.EqualFold(strings.TrimSpace(ingress.APIStyle), string(apistyle.Claude)) {
		return true
	}
	return false
}

func isClaudeDesktopGatewayRequest(r *http.Request) bool {
	return ingresstoken.FromHTTPRequest(r).Agent == agentkind.ClaudeDesktop ||
		strings.TrimSpace(ingresstoken.FromHTTPRequest(r).Token) == ingresstoken.Legacy
}

func buildModelsListBody(providerID, modelID string, store *profile.Store, claudeDesktop bool) string {
	if claudeDesktop {
		routes := profile.ClaudeDesktopRouteIDs(store, providerID)
		if len(routes) == 0 && strings.TrimSpace(modelID) != "" {
			routes = []string{profile.ClaudeDesktopRouteName(modelID, 0)}
		}
		return buildClaudeDesktopModelsListBody(routes)
	}
	ids := vendorModelIDs(providerID, modelID, store)
	rows := make([]map[string]string, 0, len(ids))
	for _, id := range ids {
		rows = append(rows, map[string]string{"id": id, "object": "model", "owned_by": "clovapi"})
	}
	data, _ := json.Marshal(map[string]any{"object": "list", "data": rows})
	return string(data)
}

func buildClaudeDesktopModelsListBody(ids []string) string {
	rows := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		rows = append(rows, map[string]any{
			"type":       "model",
			"id":         id,
			"created_at": claudeDesktopModelCreated,
		})
	}
	var firstID, lastID any
	if len(ids) > 0 {
		firstID = ids[0]
		lastID = ids[len(ids)-1]
	}
	data, _ := json.Marshal(map[string]any{
		"data":      rows,
		"has_more":  false,
		"first_id":  firstID,
		"last_id":   lastID,
	})
	return string(data)
}

func vendorModelIDs(providerID, modelID string, store *profile.Store) []string {
	seen := map[string]bool{}
	var ids []string
	add := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			return
		}
		seen[id] = true
		ids = append(ids, id)
	}
	if store != nil {
		for _, p := range store.List {
			if profile.ProviderIDFromStoreProfile(p) != strings.TrimSpace(providerID) {
				continue
			}
			for i, raw := range p.Models {
				m := profile.NormalizeModelEntry(raw, i)
				add(m.ID)
			}
			if len(ids) == 0 {
				add(p.Model)
			}
			break
		}
	}
	if len(ids) == 0 {
		add(modelID)
	}
	return ids
}
