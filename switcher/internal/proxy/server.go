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
	"github.com/clovapi/switcher/internal/profile"
	"github.com/clovapi/switcher/internal/protocol"
	"github.com/clovapi/switcher/internal/provider"
	"github.com/clovapi/switcher/internal/proxyresolve"
	"github.com/clovapi/switcher/internal/syslog"
)

type Server struct {
	Config profile.ProxyConfig
	// ProfileLoader resolves persisted Desktop v4 profiles; defaults to profile.Load when nil (set in ctor).
	ProfileLoader func() (*profile.Store, error)
	// HTTPClient performs upstream calls when serving matching ingress/egress requests; defaults in NewServer (2-minute timeout).
	HTTPClient *http.Client
	Server     *http.Server
	CallLogs   *CallLogStore
}

type Health struct {
	OK      bool   `json:"ok"`
	Service string `json:"service"`
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
		ProfileLoader: profile.Load,
		CallLogs:      NewCallLogStore(),
		HTTPClient: &http.Client{
			Timeout: 2 * time.Minute,
			Transport: &http.Transport{
				Proxy:              http.ProxyFromEnvironment,
				ForceAttemptHTTP2:  true,
				DisableCompression: true,
			},
		},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/__debug/call-log", s.handleDebugCallLog)
	mux.HandleFunc("/__debug/system-log", s.handleDebugSystemLog)
	mux.HandleFunc("/__debug/transform-request", s.handleDebugTransform)
	mux.HandleFunc("/__debug/resolve-route", s.handleDebugResolveRoute)
	mux.HandleFunc("/", s.handleProxy)
	s.Server = &http.Server{Addr: cfg.Host + ":" + strconv.Itoa(cfg.Port), Handler: mux}
	return s
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

func (s *Server) handleDebugCallLog(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet, http.MethodHead:
		writeJSON(w, http.StatusOK, map[string]any{"entries": s.CallLogs.List()})
	case http.MethodDelete:
		s.CallLogs.Clear()
		writeJSON(w, http.StatusOK, map[string]string{"ok": "cleared"})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "GET or DELETE only"})
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, Health{OK: true, Service: "clovapi-core-proxy"})
}

func (s *Server) handleDebugResolveRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "GET only"})
		return
	}
	store, err := s.loadStore()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load profiles store"})
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

	hints := protocol.UpstreamHints{Model: req.Upstream.Model, Source: req.Upstream.Source}
	upstreamPayload, _, pathSuffix, err := protocol.PrepareUpstreamRequest(ingressStyle, egressStyle, body, hints)
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
	protocol.GatewayEnrich(&irFin, hints)
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
	trace := startRequestTrace(s.CallLogs, r)
	defer trace.finish()

	payload, bodyErr := readInboundBody(r)
	_ = r.Body.Close()
	trace.setRequestBody(payload)
	if bodyErr != nil {
		trace.setError("read request body")
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "read request body"})
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(payload))

	path := r.URL.EscapedPath()
	if path == "" {
		path = r.URL.Path
	}
	ingress, ok := provider.ParseProxyIngressPath(path)
	if !ok {
		trace.setError("invalid path; use /{providerId}/{modelId}/{apiStyle}/v1/...")
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "invalid path; use /{providerId}/{modelId}/{apiStyle}/v1/..."})
		return
	}
	if (r.Method == http.MethodGet || r.Method == http.MethodHead) && isModelsPath(ingress.PathSuffix) {
		store, err := s.loadStore()
		if err != nil {
			trace.setError("failed to load profiles store")
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load profiles store"})
			return
		}
		s.serveIngressModels(w, r, trace, ingress, store)
		return
	}
	if !shouldTransformProxyMethod(r.Method) {
		trace.setError("method not supported for proxy route")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not supported for proxy route"})
		return
	}

	store, err := s.loadStore()
	if err != nil {
		trace.setError("failed to load profiles store")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load profiles store"})
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

	hints := protocol.UpstreamHints{Model: route.EffectiveModel, Source: route.Source}
	upJSON, ir, _, err := protocol.PrepareUpstreamRequest(route.IngressStyle, route.EgressStyle, payload, hints)
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
	})
	for k, vv := range authHdr {
		upReq.Header[k] = vv
	}
	upReq.Header.Set("Content-Type", "application/json")
	upReq.Header.Set("Content-Length", strconv.Itoa(len(upJSON)))
	upReq.Header.Set("Accept-Encoding", "identity")

	upResp, err := s.upstreamHTTP().Do(upReq)
	if err != nil {
		trace.setError("upstream request failed")
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "upstream request failed"})
		return
	}

	ingressWantsSSEClaudeWire := protocol.IngressUsesClaudeSSEWire(route.IngressStyle, ir.Stream)
	plaintextReader := io.Reader(upResp.Body)
	upstreamCloser := func() {
		if upResp.Body != nil {
			_ = upResp.Body.Close()
		}
	}
	if ir.Stream {
		plain, layered := protocol.WrapStreamingPlaintextReader(upResp.Header.Get("Content-Encoding"), upResp.Body)
		plaintextReader = plain
		upstreamCloser = layered
	}
	defer upstreamCloser()

	ctypeLower := strings.ToLower(strings.TrimSpace(upResp.Header.Get("Content-Type")))
	streamingSSE := false
	if ir.Stream {
		buf := bufio.NewReader(plaintextReader)
		plaintextReader = buf
		peek, _ := buf.Peek(512)
		streamingSSE = protocol.UpstreamResponseLooksLikeSSE(ctypeLower, peek)
	}

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
		var capture bytes.Buffer
		tee := io.TeeReader(plaintextReader, &capture)
		var streamErr error
		if protocol.ShouldPassthroughStreamingSSE(route.IngressStyle, route.EgressStyle) {
			streamErr = protocol.PassthroughStreamingPlaintextSSE(r.Context(), tee, w)
		} else {
			streamErr = protocol.TranscodePlaintextSSEToIngress(r.Context(), route.IngressStyle, route.EgressStyle, ir.Model, tee, w)
		}
		if streamErr != nil {
			trace.setError(streamErr.Error())
		}
		trace.setUpstreamResponse(upResp.StatusCode, upResp.Header, capture.Bytes())
		return
	}

	upBody, err := io.ReadAll(plaintextReader)
	if err != nil {
		trace.setError("read upstream response")
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "read upstream response"})
		return
	}
	trace.setUpstreamResponse(upResp.StatusCode, upResp.Header, upBody)

	upStatus := upResp.StatusCode
	if ir.Stream && upStatus >= 400 {
		ev := protocol.MaterializePlainUpstreamEvents(route.EgressStyle, upStatus, upBody)
		if ingressWantsSSEClaudeWire {
			for k, vv := range protocol.MergeMinimalSSEStreamingErrorHeaders() {
				for _, v := range vv {
					w.Header().Add(k, v)
				}
			}
			w.WriteHeader(upStatus)
			_ = protocol.WriteSSEFromBufferedIR(route.IngressStyle, ir.Model, ev, w)
			return
		}
		payload, encErr := protocol.EncodeNonStreamJSONResponseForStyle(route.IngressStyle, ev)
		if encErr != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": encErr.Error()})
			return
		}
		h := protocol.MergeMinimalJSONReplyHeaders(payload)
		for k, vv := range h {
			for _, v := range vv {
				w.Header().Add(k, v)
			}
		}
		w.WriteHeader(upStatus)
		if len(payload) > 0 {
			_, _ = w.Write(payload)
		}
		return
	}

	if ir.Stream && upStatus < 400 {
		ev := protocol.MaterializePlainUpstreamEvents(route.EgressStyle, upStatus, upBody)
		if ingressWantsSSEClaudeWire {
			baseSan := protocol.SanitizeUpstreamResponseHeaders(upResp.Header.Clone())
			streamHdr := protocol.MergeSSEProxyDownstreamHeaders(baseSan)
			for k, vv := range streamHdr {
				for _, v := range vv {
					w.Header().Add(strings.TrimSpace(http.CanonicalHeaderKey(k)), v)
				}
			}
			w.WriteHeader(upStatus)
			_ = protocol.WriteSSEFromBufferedIR(route.IngressStyle, ir.Model, ev, w)
			return
		}
		payload, encErr := protocol.EncodeNonStreamJSONResponseForStyle(route.IngressStyle, ev)
		if encErr != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": encErr.Error()})
			return
		}
		baseSan := protocol.SanitizeUpstreamResponseHeaders(upResp.Header.Clone())
		outHdr := protocol.MergeJSONSuccessHeaders(baseSan, payload)
		for k, vv := range outHdr.Clone() {
			for _, v := range vv {
				w.Header().Add(k, v)
			}
		}
		w.WriteHeader(upStatus)
		if len(payload) > 0 {
			_, _ = w.Write(payload)
		}
		return
	}

	outStatus, outHdr, outBody, ferr := protocol.FinalizeNonStreamProxyDownstream(route.IngressStyle, route.EgressStyle, upStatus, upResp.Header.Clone(), upBody)
	if ferr != nil {
		switch {
		case errors.Is(ferr, protocol.ErrUpstreamSSEForNonStreamingClient):
			writeJSON(w, http.StatusNotImplemented, map[string]string{"error": ferr.Error()})
		default:
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": ferr.Error()})
		}
		return
	}
	for k, vv := range outHdr.Clone() {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(outStatus)
	if len(outBody) > 0 {
		_, _ = w.Write(outBody)
	}
}

func shouldTransformProxyMethod(m string) bool {
	switch strings.ToUpper(strings.TrimSpace(m)) {
	case http.MethodPost, http.MethodPut, http.MethodPatch:
		return true
	default:
		return false
	}
}

func (s *Server) upstreamHTTP() *http.Client {
	if s.HTTPClient != nil {
		return s.HTTPClient
	}
	return &http.Client{
		Timeout: 2 * time.Minute,
		Transport: &http.Transport{
			Proxy:              http.ProxyFromEnvironment,
			ForceAttemptHTTP2:  true,
			DisableCompression: true,
		},
	}
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
