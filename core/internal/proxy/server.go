package proxy

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/buildinfo"
	"github.com/clovapi/switcher/internal/desktop"
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/protocol"
	"github.com/clovapi/switcher/internal/provider"
	"github.com/clovapi/switcher/internal/proxyresolve"
	"github.com/clovapi/switcher/internal/syslog"
)

type Server struct {
	Config profile.ProxyConfig
	// ProfileLoader resolves persisted Desktop v4 profiles; defaults to profile.LoadDesktop when nil (set in ctor).
	ProfileLoader func() (*profile.Store, error)
	// HTTPClient performs upstream calls when serving matching ingress/egress requests; defaults in NewServer (streaming-safe, no whole-request timeout).
	HTTPClient *http.Client
	Server     *http.Server
	CallLogs   *CallLogStore
	Usage      *UsagePoller
}

type Health struct {
	OK      bool   `json:"ok"`
	Service string `json:"service"`
	Version string `json:"version"`
}

type debugTransformRequest struct {
	IngressStyle string          `json:"ingress_style"`
	EgressStyle  string          `json:"egress_style"`
	Upstream     upstreamWire    `json:"upstream"`
	IngressBody  json.RawMessage `json:"ingress_body,omitempty"`
}

type upstreamWire struct {
	Model  string `json:"model,omitempty"`
	Source string `json:"source,omitempty"`
}

type debugTransformResponse struct {
	PathSuffix       string         `json:"path_suffix"`
	UpstreamPreview  map[string]any `json:"upstream_body_preview"`
	IREffectiveModel string         `json:"ir_effective_model,omitempty"`
	Error            string         `json:"error,omitempty"`
}

func NewServer(cfg profile.ProxyConfig) *Server {
	if strings.TrimSpace(cfg.Host) == "" {
		cfg.Host = profile.DefaultProxyHost
	}
	if cfg.Port == 0 {
		cfg.Port = profile.DefaultProxyPort
	}
	s := &Server{
		Config:        cfg,
		ProfileLoader: profile.LoadDesktop,
		CallLogs:      NewCallLogStore(),
		HTTPClient:    defaultUpstreamHTTPClient(),
	}
	s.Usage = NewUsagePoller(s)
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/__debug/call-log", s.handleDebugCallLog)
	mux.HandleFunc("/__debug/system-log", s.handleDebugSystemLog)
	mux.HandleFunc("/__debug/profiles", s.handleDebugProfiles)
	mux.HandleFunc("/__debug/usage", s.handleDebugUsage)
	mux.HandleFunc("/__debug/routes", s.handleDebugRoutes)
	mux.HandleFunc("/__debug/transform-request", s.handleDebugTransform)
	mux.HandleFunc("/__debug/resolve-route", s.handleDebugResolveRoute)
	mux.HandleFunc("/__debug/shutdown", s.handleDebugShutdown)
	mux.HandleFunc("/v1/models", s.handleAggregateModels)
	mux.HandleFunc("/", s.handleProxy)
	s.Server = &http.Server{Addr: cfg.Host + ":" + strconv.Itoa(cfg.Port), Handler: mux}
	return s
}

// handleAggregateModels exposes the cached model surface for every configured
// provider. Provider-scoped /{providerId}/v1/models remains available when a
// client needs models from one provider only.
func (s *Server) handleAggregateModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "GET only"})
		return
	}
	store, err := s.loadStore()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load profiles.json"})
		return
	}
	body := buildAggregateModelsListBody(store)
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write([]byte(body))
	}
}

func (s *Server) handleDebugRoutes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "GET only"})
		return
	}
	store, err := s.loadStore()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load profiles.json"})
		return
	}
	backends := store.DerivedRouteBackends()
	providerID := strings.TrimSpace(r.URL.Query().Get("provider_id"))
	modelID := strings.TrimSpace(r.URL.Query().Get("model_id"))
	if providerID != "" || modelID != "" {
		filtered := backends[:0]
		for _, backend := range backends {
			if providerID != "" && !strings.EqualFold(backend.ProviderID, providerID) {
				continue
			}
			if modelID != "" &&
				!strings.EqualFold(backend.ModelID, modelID) &&
				!strings.EqualFold(backend.UpstreamModel, modelID) {
				continue
			}
			filtered = append(filtered, backend)
		}
		backends = filtered
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"backends": backends,
	})
}

func (s *Server) loadStore() (*profile.Store, error) {
	loader := s.ProfileLoader
	if loader == nil {
		loader = profile.Load
	}
	return loader()
}

func (s *Server) ListenAndServe() error {
	if s.Usage != nil {
		s.Usage.Start()
		defer s.Usage.Stop()
	}
	return s.Server.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.Usage != nil {
		s.Usage.Stop()
	}
	return s.Server.Shutdown(ctx)
}

func (s *Server) handleDebugUsage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "GET only"})
		return
	}
	if s.Usage == nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "usages": []UsageSnapshot{}})
		return
	}
	refresh := r.URL.Query().Get("refresh") == "1" || strings.EqualFold(r.URL.Query().Get("refresh"), "true")
	if refresh {
		_ = s.Usage.Refresh(r.Context())
	} else {
		s.Usage.RefreshIfStaleAsync()
	}
	writeJSON(w, http.StatusOK, s.Usage.Snapshot())
}

func (s *Server) handleDebugProfiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "GET only"})
		return
	}
	result := desktop.LoadProfiles()
	if !result.OK {
		writeJSON(w, http.StatusInternalServerError, result)
		return
	}
	if s.Usage != nil {
		s.Usage.RefreshIfStaleAsync()
		usageSnapshot := s.Usage.Snapshot()
		byName := map[string]UsageSnapshot{}
		for _, item := range usageSnapshot.Usages {
			name := strings.ToLower(strings.TrimSpace(item.Vendor))
			if name != "" {
				byName[name] = item
			}
		}
		for i := range result.Profiles {
			name := strings.ToLower(strings.TrimSpace(result.Profiles[i].Name))
			if usage, ok := byName[name]; ok {
				result.Profiles[i].Usage = usage
			}
		}
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleDebugSystemLog(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet, http.MethodHead:
		limit := queryIntDefault(r, "limit", syslog.DefaultListLimit)
		if limit < 1 {
			limit = syslog.DefaultListLimit
		}
		entries, err := syslog.List(limit)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"entries": entries, "limit": limit})
	case http.MethodDelete:
		if err := syslog.Clear(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"ok": "cleared"})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "GET or DELETE only"})
	}
}

func (s *Server) handleDebugShutdown(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST only"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"ok": "shutting down"})
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.Shutdown(ctx)
	}()
}

func (s *Server) handleDebugCallLog(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet, http.MethodHead:
		if r.URL.Query().Has("session") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "call log session API has been removed"})
			return
		}
		limit := queryIntDefault(r, "limit", 20)
		offset := queryIntDefault(r, "offset", 0)
		if limit < 1 {
			limit = 20
		}
		if offset < 0 {
			offset = 0
		}
		filter := callLogFilterFromQuery(r)
		entries := s.CallLogs.ListRecentPageFiltered(limit+1, offset, filter)
		hasMore := len(entries) > limit
		if hasMore {
			entries = entries[:limit]
		}
		apiKeyAggregates := s.CallLogs.APIKeyAggregates()
		writeJSON(w, http.StatusOK, map[string]any{
			"entries":          entries,
			"apiKeyAggregates": apiKeyAggregates,
			"limit":            limit,
			"offset":           offset,
			"hasMore":          hasMore,
		})
	case http.MethodDelete:
		if r.URL.Query().Has("session") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "call log session API has been removed"})
			return
		}
		s.CallLogs.Clear()
		writeJSON(w, http.StatusOK, map[string]string{"ok": "cleared"})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "GET or DELETE only"})
	}
}

func callLogFilterFromQuery(r *http.Request) CallLogFilter {
	if r == nil {
		return CallLogFilter{}
	}
	q := r.URL.Query()
	return CallLogFilter{
		APIKey:            strings.TrimSpace(q.Get("api_key")),
		APIKeyFingerprint: strings.TrimSpace(q.Get("api_key_fingerprint")),
		APIKeyUnidentified: q.Get("api_key_unidentified") == "1" ||
			strings.EqualFold(q.Get("api_key_unidentified"), "true"),
	}
}

func queryIntDefault(r *http.Request, key string, def int) int {
	if r == nil {
		return def
	}
	raw := strings.TrimSpace(r.URL.Query().Get(key))
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return def
	}
	return n
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, Health{
		OK:      true,
		Service: "clovapi-core-proxy",
		Version: buildinfo.Display(),
	})
}

func (s *Server) handleDebugResolveRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "GET only"})
		return
	}
	store, err := s.loadStore()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load profiles.json"})
		return
	}
	q := r.URL.Query()
	providerID := strings.TrimSpace(q.Get("provider_id"))
	modelID := strings.TrimSpace(q.Get("model_id"))
	ingressStyle := strings.TrimSpace(q.Get("ingress_style"))
	if providerID == "" || modelID == "" || ingressStyle == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "require provider_id model_id ingress_style query params"})
		return
	}
	ctx, err := proxyresolve.ResolveIngressContext(store, providerID, modelID, ingressStyle)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, proxyresolve.ErrSubscriptionUpstreamNotReady) {
			status = http.StatusConflict
			writeJSON(w, status, map[string]string{"error": "subscription upstream requires Desktop auth wiring"})
			return
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, ctx)
}

func (s *Server) handleDebugTransform(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST only"})
		return
	}
	lim := io.LimitReader(r.Body, 1<<22)
	raw, err := io.ReadAll(lim)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "read body"})
		return
	}
	var req debugTransformRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON envelope"})
		return
	}
	ingressStyle, err := apistyle.Parse(req.IngressStyle)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	egressStyle, err := apistyle.Parse(req.EgressStyle)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	body := ([]byte)(req.IngressBody)
	if len(body) == 0 {
		body = []byte("{}")
	}

	pathSuffix := proxyresolve.UpstreamPathSuffix(egressStyle, req.Upstream.Source)
	upstreamPayload, _, err := protocol.PrepareUpstreamRequest(ingressStyle, egressStyle, body, protocol.PrepareOptions{
		Model:       req.Upstream.Model,
		ForceStream: true,
		Configure: func(ir *protocol.Request) {
			applyUpstreamRequestPolicy(ir, req.Upstream.Source)
		},
	})
	resp := debugTransformResponse{PathSuffix: pathSuffix}
	if err != nil {
		resp.Error = err.Error()
		writeJSON(w, http.StatusBadRequest, resp)
		return
	}

	dec := json.NewDecoder(bytes.NewReader(upstreamPayload))
	dec.UseNumber()
	var preview map[string]any
	if err := dec.Decode(&preview); err != nil {
		resp.Error = "upstream JSON preview decode failed"
		writeJSON(w, http.StatusInternalServerError, resp)
		return
	}
	irFin, err := protocol.DecodeRequestForStyle(ingressStyle, body)
	if err != nil {
		resp.Error = "ingress decode echo failed after transform"
		writeJSON(w, http.StatusInternalServerError, resp)
		return
	}
	if model := strings.TrimSpace(req.Upstream.Model); model != "" {
		irFin.Model = model
	}
	applyUpstreamRequestPolicy(&irFin, req.Upstream.Source)
	resp.UpstreamPreview = summarizeUpstreamPreview(preview)
	resp.IREffectiveModel = irFin.Model
	writeJSON(w, http.StatusOK, resp)
}

// summarizeUpstreamPreview removes large arrays from debug output to keep responses bounded.
func summarizeUpstreamPreview(full map[string]any) map[string]any {
	if full == nil {
		return nil
	}
	out := make(map[string]any)
	for k, v := range full {
		switch k {
		case "messages", "input":
			out[k+"_length"] = countWireArray(v)
		default:
			out[k] = v
		}
	}
	return out
}

func countWireArray(v any) int {
	arr, ok := v.([]any)
	if !ok || arr == nil {
		return 0
	}
	return len(arr)
}

const maxInboundProxyBody = 1 << 22

// maxUpstreamBufferedBody bounds non-streaming upstream responses read fully
// into memory (~64Mi), matching the buffered decompression cap.
const maxUpstreamBufferedBody int64 = 1 << 26

// maxCallLogBodyBytes bounds how much of a streaming SSE response is retained in
// memory for the call log (~8Mi). Long streaming responses can produce many MB/hour;
// without a cap the capture buffer grows for the lifetime of the request.
const maxCallLogBodyBytes int64 = 1 << 23

// cappedBuffer is an io.Writer that retains at most limit bytes. Writes beyond
// the limit are discarded (the underlying read still proceeds), so it can back
// an io.TeeReader without unbounded memory growth.
type cappedBuffer struct {
	buf       bytes.Buffer
	limit     int64
	truncated bool
}

func (c *cappedBuffer) Write(p []byte) (int, error) {
	if remaining := c.limit - int64(c.buf.Len()); remaining > 0 {
		if int64(len(p)) <= remaining {
			c.buf.Write(p)
		} else {
			c.buf.Write(p[:remaining])
			c.truncated = true
		}
	} else if len(p) > 0 {
		c.truncated = true
	}
	return len(p), nil
}

func (c *cappedBuffer) Bytes() []byte {
	if c.truncated {
		return append(c.buf.Bytes(), []byte("\n…[truncated]")...)
	}
	return c.buf.Bytes()
}

func readInboundBody(r *http.Request) ([]byte, error) {
	if r == nil || r.Body == nil {
		return nil, nil
	}
	lim := io.LimitReader(r.Body, maxInboundProxyBody+1)
	payload, err := io.ReadAll(lim)
	if err != nil {
		return payload, err
	}
	if len(payload) > maxInboundProxyBody {
		return nil, fmt.Errorf("request body too large")
	}
	return payload, nil
}

func modelIDFromIngressPayload(payload []byte, ingress provider.Ingress) string {
	if model := topLevelJSONModel(payload); model != "" {
		return model
	}
	if strings.EqualFold(strings.TrimSpace(ingress.APIStyle), string(apistyle.Gemini)) {
		return geminiModelFromPathSuffix(ingress.PathSuffix)
	}
	return ""
}

func topLevelJSONModel(payload []byte) string {
	if len(bytes.TrimSpace(payload)) == 0 {
		return ""
	}
	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return ""
	}
	model, _ := raw["model"].(string)
	return strings.TrimSpace(model)
}

func geminiModelFromPathSuffix(pathSuffix string) string {
	p := strings.Trim(strings.TrimSpace(pathSuffix), "/")
	if !strings.HasPrefix(strings.ToLower(p), "models/") {
		return ""
	}
	rest := strings.TrimPrefix(p, "models/")
	if idx := strings.Index(rest, ":"); idx >= 0 {
		rest = rest[:idx]
	}
	return strings.TrimSpace(rest)
}

func defaultModelIDForProvider(store *profile.Store, providerID string) string {
	if store == nil {
		return ""
	}
	for _, p := range store.List {
		if profile.ProviderIDFromStoreProfile(p) != strings.TrimSpace(providerID) {
			continue
		}
		if len(p.Models) > 0 {
			return strings.TrimSpace(profile.NormalizeModelEntry(p.Models[0], 0).ID)
		}
		if model := strings.TrimSpace(p.Model); model != "" {
			return model
		}
	}
	return ""
}

func (s *Server) handleProxy(w http.ResponseWriter, r *http.Request) {
	path := r.URL.EscapedPath()
	if path == "" {
		path = r.URL.Path
	}
	ingress, pathOK := provider.ParseProxyIngressPath(path)
	trace := startRequestTraceIfNeeded(s.CallLogs, r, ingress, pathOK)
	defer func() {
		if trace != nil {
			trace.finish()
		}
	}()

	payload, bodyErr := readInboundBody(r)
	_ = r.Body.Close()
	trace.setRequestBody(payload)
	if bodyErr != nil {
		trace.setError("read request body")
		logProxyProbeIfNeeded(r, trace, pathOK, http.StatusBadRequest, "read request body")
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "read request body"})
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(payload))

	if !pathOK {
		msg := "invalid path; use /{providerId}/v1/messages, /{providerId}/v1/responses, or /{providerId}/v1/chat/completions"
		trace.setError(msg)
		logProxyProbeIfNeeded(r, trace, pathOK, http.StatusNotFound, msg)
		writeJSON(w, http.StatusNotFound, map[string]string{"error": msg})
		return
	}
	if (r.Method == http.MethodGet || r.Method == http.MethodHead) && isModelsPath(ingress.PathSuffix) {
		store, err := s.loadStore()
		if err != nil {
			trace.setError("failed to load profiles.json")
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load profiles.json"})
			return
		}
		if strings.TrimSpace(ingress.ModelID) == "" {
			ingress.ModelID = defaultModelIDForProvider(store, ingress.ProviderID)
		}
		s.serveIngressModels(w, r, trace, ingress, store)
		return
	}
	if !shouldTransformProxyMethod(r.Method) {
		msg := "method not supported for proxy route"
		trace.setError(msg)
		logProxyProbeIfNeeded(r, trace, pathOK, http.StatusMethodNotAllowed, msg)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": msg})
		return
	}

	store, err := s.loadStore()
	if err != nil {
		trace.setError("failed to load profiles.json")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load profiles.json"})
		return
	}

	if strings.TrimSpace(ingress.ModelID) == "" {
		ingress.ModelID = modelIDFromIngressPayload(payload, ingress)
	}
	if strings.TrimSpace(ingress.ModelID) == "" {
		msg := "request body model is required for proxy route"
		trace.setError(msg)
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
		return
	}

	routes, err := proxyresolve.ResolveForwardRoutes(store, ingress.ProviderID, ingress.ModelID, ingress.APIStyle)
	if err != nil {
		if errors.Is(err, proxyresolve.ErrSubscriptionUpstreamNotReady) {
			trace.setError("subscription upstream requires Desktop auth wiring")
			writeJSON(w, http.StatusConflict, map[string]string{"error": "subscription upstream requires Desktop auth wiring"})
			return
		}
		trace.setError(err.Error())
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if s.Usage != nil {
		routes = s.Usage.OrderRoutes(routes)
		if len(routes) == 0 {
			msg := "all route backends are unavailable: usage exhausted"
			trace.setError(msg)
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": msg})
			return
		}
	}

	contentType := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
	if contentType != "" && !strings.Contains(contentType, "json") {
		trace.setError("Content-Type must be application/json")
		writeJSON(w, http.StatusUnsupportedMediaType, map[string]string{"error": "Content-Type must be application/json"})
		return
	}

	var lastErr string
	for i, route := range routes {
		if route.APIKey == "" {
			lastErr = "resolved profile has no upstream credentials"
			trace.setError(lastErr)
			if i < len(routes)-1 {
				continue
			}
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": lastErr})
			return
		}
		if s.tryProxyRoute(w, r, trace, route, payload, i < len(routes)-1, &lastErr) {
			return
		}
	}
	if strings.TrimSpace(lastErr) == "" {
		lastErr = "upstream request failed"
	}
	trace.setError(lastErr)
	writeJSON(w, http.StatusBadGateway, map[string]string{"error": lastErr})
}

func (s *Server) tryProxyRoute(
	w http.ResponseWriter,
	r *http.Request,
	trace *requestTrace,
	route proxyresolve.ForwardRoute,
	payload []byte,
	canRetry bool,
	lastErr *string,
) bool {
	trace.addRouteAttempt(route)
	upJSON, ir, err := protocol.PrepareUpstreamRequest(route.IngressStyle, route.EgressStyle, payload, protocol.PrepareOptions{
		Model:       route.EffectiveModel,
		ForceStream: true,
		Configure: func(ir *protocol.Request) {
			applyUpstreamRequestPolicy(ir, route.Source)
		},
	})
	if err != nil {
		trace.setError(err.Error())
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return true
	}
	upReq, err := http.NewRequestWithContext(r.Context(), r.Method, route.UpstreamURL, bytes.NewReader(upJSON))
	if err != nil {
		trace.setError("invalid upstream URL")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "invalid upstream URL"})
		return true
	}
	trace.setUpstreamRequest(upReq.Method, upReq.URL.String())

	authHdr := proxyresolve.UpstreamAuthHeaders(proxyresolve.UpstreamAuth{
		Style:     route.EgressStyle,
		APIKey:    route.APIKey,
		Source:    route.Source,
		AccountID: route.AccountID,
		Stream:    true,
	})
	for k, vv := range authHdr {
		upReq.Header[k] = vv
	}
	upReq.Header.Set("Content-Type", "application/json")
	upReq.Header.Set("Content-Length", strconv.Itoa(len(upJSON)))
	upReq.Header.Set("Accept-Encoding", "identity")
	trace.setUpstreamRequestHeaders(upReq)

	upResp, err := s.upstreamHTTP().Do(upReq)
	if err != nil {
		msg := fmt.Sprintf("upstream request failed: %v", err)
		*lastErr = msg
		trace.setError(msg)
		if canRetry {
			return false
		}
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "upstream request failed"})
		return true
	}
	if canRetry && isRetryableRouteStatus(upResp.StatusCode) {
		*lastErr = fmt.Sprintf("upstream returned retryable status %d", upResp.StatusCode)
		trace.setError(*lastErr)
		_, _ = io.Copy(io.Discard, io.LimitReader(upResp.Body, 1<<20))
		_ = upResp.Body.Close()
		return false
	}

	plain, layered := protocol.WrapStreamingPlaintextReader(upResp.Header.Get("Content-Encoding"), upResp.Body)
	defer layered()

	ctypeLower := strings.ToLower(strings.TrimSpace(upResp.Header.Get("Content-Type")))
	buf := bufio.NewReader(plain)
	peek, _ := buf.Peek(512)
	streamingSSE := protocol.UpstreamResponseLooksLikeSSE(ctypeLower, peek)

	if streamingSSE {
		baseSan := protocol.SanitizeUpstreamResponseHeaders(upResp.Header.Clone())
		streamHdr := protocol.MergeSSEProxyDownstreamHeaders(baseSan)
		for k, vv := range streamHdr {
			kCanon := strings.TrimSpace(http.CanonicalHeaderKey(k))
			for _, v := range vv {
				w.Header().Add(kCanon, v)
			}
		}
		w.WriteHeader(upResp.StatusCode)
		capture := &cappedBuffer{limit: maxCallLogBodyBytes}
		tee := io.TeeReader(buf, capture)
		var streamErr error
		if route.IngressStyle == apistyle.OpenAIResponses && route.EgressStyle == apistyle.OpenAIResponses {
			streamErr = protocol.CopyPlaintextSSEToDownstream(r.Context(), tee, w)
		} else {
			streamErr = protocol.TranscodePlaintextSSEToIngress(r.Context(), route.IngressStyle, route.EgressStyle, ir.Model, tee, w)
		}
		if shouldRecordStreamError(streamErr) {
			trace.setError(streamErr.Error())
		}
		trace.setUpstreamResponse(upResp.StatusCode, upResp.Header, capture.Bytes())
		return true
	}

	upBody, err := io.ReadAll(io.LimitReader(buf, maxUpstreamBufferedBody+1))
	if err != nil {
		trace.setError("read upstream response")
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "read upstream response"})
		return true
	}
	if int64(len(upBody)) > maxUpstreamBufferedBody {
		trace.setError("upstream response too large")
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "upstream response too large"})
		return true
	}
	trace.setUpstreamResponse(upResp.StatusCode, upResp.Header, upBody)

	upStatus := upResp.StatusCode
	ev := protocol.MaterializePlainUpstreamEvents(route.EgressStyle, upStatus, upBody)
	if upStatus >= 400 {
		for k, vv := range protocol.MergeMinimalSSEStreamingErrorHeaders() {
			for _, v := range vv {
				w.Header().Add(k, v)
			}
		}
	} else {
		baseSan := protocol.SanitizeUpstreamResponseHeaders(upResp.Header.Clone())
		streamHdr := protocol.MergeSSEProxyDownstreamHeaders(baseSan)
		for k, vv := range streamHdr {
			for _, v := range vv {
				w.Header().Add(strings.TrimSpace(http.CanonicalHeaderKey(k)), v)
			}
		}
	}
	w.WriteHeader(upStatus)
	_ = protocol.WriteSSEFromBufferedIR(route.IngressStyle, ir.Model, ev, w)
	return true
}

func isRetryableRouteStatus(status int) bool {
	return status == http.StatusTooManyRequests ||
		status == http.StatusInternalServerError ||
		status == http.StatusBadGateway ||
		status == http.StatusServiceUnavailable ||
		status == http.StatusGatewayTimeout
}

func shouldTransformProxyMethod(m string) bool {
	switch strings.ToUpper(strings.TrimSpace(m)) {
	case http.MethodPost, http.MethodPut, http.MethodPatch:
		return true
	default:
		return false
	}
}

func shouldRecordStreamError(err error) bool {
	if err == nil {
		return false
	}
	return !errors.Is(err, context.Canceled)
}

func applyUpstreamRequestPolicy(r *protocol.Request, source string) {
	switch strings.TrimSpace(source) {
	case "subscription:codex":
		ensureProtocolMeta(r).OpenAIResponsesOmitSampling = true
	case "subscription:claude-code":
		meta := ensureProtocolMeta(r)
		meta.ClaudeOAuthEncodingCompatibility = true
	}
}

func ensureProtocolMeta(r *protocol.Request) *protocol.Metadata {
	if r.Meta == nil {
		r.Meta = &protocol.Metadata{}
	}
	return r.Meta
}

func (s *Server) upstreamHTTP() *http.Client {
	if s.HTTPClient != nil {
		return s.HTTPClient
	}
	return defaultUpstreamHTTPClient()
}

func isModelsPath(pathSuffix string) bool {
	s := strings.TrimRight(strings.ToLower(strings.TrimSpace(pathSuffix)), "/")
	return s == "/models" || s == "/v1/models"
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
