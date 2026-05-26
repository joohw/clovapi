package proxy

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/provider"
	"github.com/clovapi/switcher/internal/proxyresolve"
)

const codexModelsPathSuffix = "/codex/models"

func (s *Server) serveIngressModels(w http.ResponseWriter, r *http.Request, trace *requestTrace, ingress provider.Ingress, store *profile.Store) {
	if ingress.ProviderID == provider.CodexProviderID {
		s.forwardCodexModelsList(w, r, trace, ingress, store)
		return
	}
	body := buildStaticModelsListBody(ingress.APIStyle, ingress.ModelID)
	trace.setUpstreamResponse(http.StatusOK, http.Header{"Content-Type": []string{"application/json"}}, []byte(body))
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write([]byte(body))
	}
}

func (s *Server) forwardCodexModelsList(w http.ResponseWriter, r *http.Request, trace *requestTrace, ingress provider.Ingress, store *profile.Store) {
	route, err := proxyresolve.ResolveForwardRoute(store, ingress.ProviderID, ingress.ModelID, ingress.APIStyle)
	if err != nil {
		trace.setError(err.Error())
		status := http.StatusBadRequest
		if errors.Is(err, proxyresolve.ErrSubscriptionUpstreamNotReady) {
			status = http.StatusConflict
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}

	upURL := proxyresolve.JoinURL(route.BaseNormalized, codexModelsPathSuffix)
	if q := strings.TrimSpace(r.URL.RawQuery); q != "" {
		upURL += "?" + q
	}

	upReq, err := http.NewRequestWithContext(r.Context(), r.Method, upURL, nil)
	if err != nil {
		trace.setError("invalid codex models upstream URL")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "invalid codex models upstream URL"})
		return
	}
	trace.setUpstreamRequest(upReq.Method, upReq.URL.String())

	authHdr := proxyresolve.UpstreamAuthHeaders(proxyresolve.UpstreamAuth{
		Style:     route.EgressStyle,
		APIKey:    route.APIKey,
		Source:    route.Source,
		AccountID: route.AccountID,
	})
	for k, vv := range authHdr {
		upReq.Header[k] = vv
	}
	upReq.Header.Set("Accept", "application/json")
	upReq.Header.Set("Accept-Encoding", "identity")

	upResp, err := s.upstreamHTTP().Do(upReq)
	if err != nil {
		trace.setError("codex models upstream request failed")
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "codex models upstream request failed"})
		return
	}
	defer upResp.Body.Close()

	body, err := io.ReadAll(upResp.Body)
	if err != nil {
		trace.setError("read codex models upstream body")
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "read codex models upstream body"})
		return
	}

	trace.setUpstreamResponse(upResp.StatusCode, upResp.Header.Clone(), body)
	if ct := strings.TrimSpace(upResp.Header.Get("Content-Type")); ct != "" {
		w.Header().Set("Content-Type", ct)
	} else {
		w.Header().Set("Content-Type", "application/json")
	}
	w.WriteHeader(upResp.StatusCode)
	if r.Method != http.MethodHead && len(body) > 0 {
		_, _ = w.Write(body)
	}
}

func buildStaticModelsListBody(apiStyle, modelID string) string {
	id := strings.TrimSpace(modelID)
	if strings.ToLower(strings.TrimSpace(apiStyle)) == string(apistyle.Claude) {
		data, _ := json.Marshal(map[string]any{"data": []map[string]string{{"type": "model", "id": id, "display_name": id}}})
		return string(data)
	}
	data, _ := json.Marshal(map[string]any{"object": "list", "data": []map[string]string{{"id": id, "object": "model", "owned_by": "clovapi"}}})
	return string(data)
}
