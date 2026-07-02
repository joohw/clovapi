package proxy

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
)

func (s *Server) serveIngressModels(w http.ResponseWriter, r *http.Request, trace *requestTrace, ingress provider.Ingress, store *profile.Store) {
	body := buildModelsListBody(ingress.ProviderID, ingress.ModelID, store)
	trace.setUpstreamResponse(http.StatusOK, http.Header{"Content-Type": []string{"application/json"}}, []byte(body))
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write([]byte(body))
	}
}

func buildModelsListBody(providerID, modelID string, store *profile.Store) string {
	ids := vendorModelIDs(providerID, modelID, store)
	rows := make([]map[string]string, 0, len(ids))
	for _, id := range ids {
		rows = append(rows, map[string]string{"id": id, "object": "model", "owned_by": "clovapi"})
	}
	data, _ := json.Marshal(map[string]any{"object": "list", "data": rows})
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
