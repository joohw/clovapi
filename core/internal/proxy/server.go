package proxy

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/clovapi/switcher/internal/apistyle"
	"github.com/clovapi/switcher/internal/buildinfo"
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
		cfg.Host = "127.0.0.1"
	}
	if cfg.Port == 0 {
		cfg.Port = 27483
	}
	s := &Server{
		Config:        cfg,
		ProfileLoader: profile.LoadDesktop,
		CallLogs:      NewCallLogStore(),
		HTTPClient:    defaultUpstreamHTTPClient(),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/__debug/call-log", s.localOnly(s.handleDebugCallLog))
	mux.HandleFunc("/__debug/system-log", s.localOnly(s.handleDebugSystemLog))
	mux.HandleFunc("/__debug/transform-request", s.localOnly(s.handleDebugTransform))
	mux.HandleFunc("/__debug/resolve-route", s.localOnly(s.handleDebugResolveRoute))
	mux.HandleFunc("/__debug/shutdown", s.localOnly(s.handleDebugShutdown))
	mux.HandleFunc("/", s.handleProxy)
	s.Server = &http.Server{Addr: cfg.Host + ":" + strconv.Itoa(cfg.Port), Handler: mux}
	return s
}

func (s *Server) localOnly(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.Config.DebugLocalOnly && !isLocalRequest(r) {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "debug endpoints are only available from loopback clients"})
			return
		}
		next(w, r)
	}
}

func isLocalRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err != nil {
		host = strings.TrimSpace(r.RemoteAddr)
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (s *Server) loadStore() (*profile.Store, error) {
	loader := s.ProfileLoader
	if loader == nil {
		loader = profile.Load
	}
	return loader()
}

func (s *Server) ListenAndServe() error {
	return s.Server.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.Server.Shutdown(ctx)
}

func (s *Server) handleDebugSystemLog(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet, http.MethodHead:
		entries, err := syslog.List(0)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
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
		syslog.LogProxyStopped("debug-shutdown")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.Shutdown(ctx)
	}()
}

func (s *Server) handleDebugCallLog(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet, http.MethodHead:
		limit := queryIntDefault(r, "limit", 20)
		offset := queryIntDefault(r, "offset", 0)
		if limit < 1 {
			limit = 20
		}
		if offset < 0 {
			offset = 0
		}
		entries := s.CallLogs.ListRecentPage(limit+1, offset)
		hasMore := len(entries) > limit
		if hasMore {
			entries = entries[:limit]
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"entries":  entries,
			"limit":    limit,
			"offset":   offset,
			"hasMore":  hasMore,
			"sessions": s.CallLogs.ListSessions(100),
		})
	case http.MethodDelete:
		s.CallLogs.Clear()
		writeJSON(w, http.StatusOK, map[string]string{"ok": "cleared"})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "GET or DELETE only"})
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
			writeJSON(w, status, map[string]string{"error": "subscription upstream requires Desktop auth/session wiring"})
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
// memory for the call log (~8Mi). Long agent sessions can stream many MB/hour;
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
		logProxyProbeIfNeeded(r, trace, http.StatusBadRequest, "read request body")
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "read request body"})
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(payload))

	if !pathOK {
		msg := "invalid path; use /{providerId}/{modelId}/{apiStyle}/v1/..."
		trace.setError(msg)
		logProxyProbeIfNeeded(r, trace, http.StatusNotFound, msg)
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
		s.serveIngressModels(w, r, trace, ingress, store)
		return
	}
	if !shouldTransformProxyMethod(r.Method) {
		msg := "method not supported for proxy route"
		trace.setError(msg)
		logProxyProbeIfNeeded(r, trace, http.StatusMethodNotAllowed, msg)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": msg})
		return
	}

	store, err := s.loadStore()
	if err != nil {
		trace.setError("failed to load profiles.json")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load profiles.json"})
		return
	}

	route, err := proxyresolve.ResolveForwardRoute(store, ingress.ProviderID, ingress.ModelID, ingress.APIStyle)
	if err != nil {
		if errors.Is(err, proxyresolve.ErrSubscriptionUpstreamNotReady) {
			trace.setError("subscription upstream requires Desktop auth/session wiring")
			writeJSON(w, http.StatusConflict, map[string]string{"error": "subscription upstream requires Desktop auth/session wiring"})
			return
		}
		trace.setError(err.Error())
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	if route.APIKey == "" {
		trace.setError("resolved profile has no upstream credentials")
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "resolved profile has no upstream credentials"})
		return
	}

	contentType := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
	if contentType != "" && !strings.Contains(contentType, "json") {
		trace.setError("Content-Type must be application/json")
		writeJSON(w, http.StatusUnsupportedMediaType, map[string]string{"error": "Content-Type must be application/json"})
		return
	}

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
		return
	}
	upReq, err := http.NewRequestWithContext(r.Context(), r.Method, route.UpstreamURL, bytes.NewReader(upJSON))
	if err != nil {
		trace.setError("invalid upstream URL")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "invalid upstream URL"})
		return
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
		trace.setError(fmt.Sprintf("upstream request failed: %v", err))
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "upstream request failed"})
		return
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
		streamErr = protocol.TranscodePlaintextSSEToIngress(r.Context(), route.IngressStyle, route.EgressStyle, ir.Model, tee, w)
		if shouldRecordStreamError(streamErr) {
			trace.setError(streamErr.Error())
		}
		trace.setUpstreamResponse(upResp.StatusCode, upResp.Header, capture.Bytes())
		return
	}

	upBody, err := io.ReadAll(io.LimitReader(buf, maxUpstreamBufferedBody+1))
	if err != nil {
		trace.setError("read upstream response")
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "read upstream response"})
		return
	}
	if int64(len(upBody)) > maxUpstreamBufferedBody {
		trace.setError("upstream response too large")
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "upstream response too large"})
		return
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
		meta.ScrubHermesIdentity = true
	}
}

func ensureProtocolMeta(r *protocol.Request) *protocol.Metadata {
	if r.Meta == nil {
		r.Meta = &protocol.Metadata{}
	}
	return r.Meta
}

func defaultUpstreamHTTPClient() *http.Client {
	return &http.Client{
		// Do not set Timeout: it applies to the full round trip including long SSE bodies.
		Transport: &http.Transport{
			Proxy:                 http.ProxyFromEnvironment,
			ForceAttemptHTTP2:     true,
			DisableCompression:    true,
			ResponseHeaderTimeout: 10 * time.Minute,
		},
	}
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
