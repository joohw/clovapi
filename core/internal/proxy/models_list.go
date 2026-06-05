package proxy

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

const (
	claudeDesktopGatewayAPIKey = "clovapi-local"
	claudeDesktopModelCreated  = "2024-01-01T00:00:00Z"
)

func (s *Server) serveIngressModels(w http.ResponseWriter, r *http.Request, trace *requestTrace, ingress provider.Ingress, store *profile.Store) {
	claudeDesktop := isClaudeDesktopGatewayRequest(r) ||
		strings.EqualFold(strings.TrimSpace(ingress.APIStyle), string(apistyle.Claude))
	body := buildModelsListBody(ingress.ProviderID, ingress.ModelID, store, claudeDesktop)
	trace.setUpstreamResponse(http.StatusOK, http.Header{"Content-Type": []string{"application/json"}}, []byte(body))
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write([]byte(body))
	}
}

func isClaudeDesktopGatewayRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if auth == "" {
		return false
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(auth, prefix) && !strings.HasPrefix(auth, "bearer ") {
		return false
	}
	token := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(auth, "Bearer "), "bearer "))
	return token == claudeDesktopGatewayAPIKey
}

func buildModelsListBody(providerID, modelID string, store *profile.Store, claudeDesktop bool) string {
	ids := vendorModelIDs(providerID, modelID, store)
	if claudeDesktop {
		return buildClaudeDesktopModelsListBody(ids)
	}
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
